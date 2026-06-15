import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CrawlbruleeError } from '../src/index.js'
import type { AsyncScrapeRequest, AsyncScrapeWebhook } from '../src/index.js'

import { buildClient, createFetchQueue, jsonResponse, lastCallOf } from './helpers.js'

describe('Crawlbrulee — async scrape lifecycle', () => {
  it('scrapeAsync POSTs to /api/scrape/async and returns the job id', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ job_id: 'job-123' }, 202))
    const client = buildClient(q.fetch)

    const res = await client.scrapeAsync({ url: 'https://example.com' })

    const { url, init } = lastCallOf(q.mock)
    expect(url).toBe('https://api.test.example/api/scrape/async')
    expect(init.method).toBe('POST')
    expect(res.job_id).toBe('job-123')
  })

  it('scrapeAsync sends webhook.url and webhook.metadata in the POST body', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ job_id: 'job-wh' }, 202))
    const client = buildClient(q.fetch)

    await client.scrapeAsync({
      url: 'https://example.com',
      webhook: {
        url: 'https://hooks.example.com/crawlbrulee',
        metadata: { tenant: 'acme', batch: 7 },
      },
    })

    const body = JSON.parse(lastCallOf(q.mock).init.body as string)
    expect(body).toEqual({
      url: 'https://example.com',
      webhook: {
        url: 'https://hooks.example.com/crawlbrulee',
        metadata: { tenant: 'acme', batch: 7 },
      },
    })
  })

  it('scrapeAsync sends webhook with only a url when metadata is omitted', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ job_id: 'job-wh2' }, 202))
    const client = buildClient(q.fetch)

    await client.scrapeAsync({
      url: 'https://example.com',
      webhook: { url: 'https://hooks.example.com/crawlbrulee' },
    })

    const body = JSON.parse(lastCallOf(q.mock).init.body as string)
    expect(body.webhook).toEqual({ url: 'https://hooks.example.com/crawlbrulee' })
    expect(body.webhook).not.toHaveProperty('metadata')
  })

  it('scrapeAsync omits the webhook field entirely when no webhook is given', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ job_id: 'job-nowh' }, 202))
    const client = buildClient(q.fetch)

    await client.scrapeAsync({ url: 'https://example.com', require_js: true })

    const body = JSON.parse(lastCallOf(q.mock).init.body as string)
    expect(body).not.toHaveProperty('webhook')
    expect(body).toEqual({ url: 'https://example.com', require_js: true })
  })

  it('AsyncScrapeRequest types compile with the webhook field', () => {
    // Compile-time guard: AsyncScrapeRequest extends ScrapeRequest with an
    // optional webhook, and AsyncScrapeWebhook carries url + optional metadata.
    const webhook = {
      url: 'https://hooks.example.com/crawlbrulee',
      metadata: { ref: 'abc' },
    } satisfies AsyncScrapeWebhook

    const request = {
      url: 'https://example.com',
      extract: { markdown: true },
      webhook,
    } satisfies AsyncScrapeRequest

    expect(request.webhook?.url).toBe('https://hooks.example.com/crawlbrulee')
  })

  it('getScrapeStatus url-encodes the jobId', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        jobId: 'with space',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    )
    const client = buildClient(q.fetch)

    await client.getScrapeStatus('with space')

    expect(lastCallOf(q.mock).url).toBe('https://api.test.example/api/scrape/status/with%20space')
  })

  it('getScrapeResult fetches the completed result', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ url: 'https://example.com/', markdown: '# done' }))
    const client = buildClient(q.fetch)

    const res = await client.getScrapeResult('job-123')

    expect(lastCallOf(q.mock).url).toBe('https://api.test.example/api/scrape/result/job-123')
    expect(res.markdown).toBe('# done')
  })
})

describe('Crawlbrulee.waitForScrape', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls status until done, then fetches the result', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        jobId: 'job-1',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    )
    q.enqueue(
      jsonResponse({
        jobId: 'job-1',
        status: 'running',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    )
    q.enqueue(
      jsonResponse({
        jobId: 'job-1',
        status: 'done',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    )
    q.enqueue(jsonResponse({ url: 'https://example.com/', markdown: '# done' }))

    const client = buildClient(q.fetch)
    const pending = client.waitForScrape('job-1', { intervalMs: 100, timeoutMs: 10_000 })

    // Drain the first poll synchronously, then advance time twice to trigger the
    // next two polls. Each `runAllTimersAsync` releases pending setTimeouts and
    // lets the promise microtasks settle.
    await vi.runAllTimersAsync()
    await vi.runAllTimersAsync()
    await vi.runAllTimersAsync()
    const res = await pending

    expect(res.markdown).toBe('# done')
    // 3 status polls + 1 result fetch
    expect(q.mock).toHaveBeenCalledTimes(4)
  })

  it('throws CrawlbruleeError when the job ends in failed', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        jobId: 'job-fail',
        status: 'failed',
        createdAt: '2026-01-01T00:00:00.000Z',
        error: 'boom',
      })
    )
    const client = buildClient(q.fetch)

    await expect(client.waitForScrape('job-fail', { intervalMs: 1 })).rejects.toMatchObject({
      name: 'CrawlbruleeError',
      errorName: 'job_failed',
      message: 'boom',
    })
  })

  it('honors a caller-supplied AbortSignal (pre-aborted)', async () => {
    // Use real timers for this one: pre-abort and expect the very first
    // throwIfAborted in the loop to bail out without making any HTTP calls.
    vi.useRealTimers()
    const q = createFetchQueue()
    const controller = new AbortController()
    controller.abort()
    const client = buildClient(q.fetch)

    await expect(
      client.waitForScrape('job-2', { intervalMs: 1, signal: controller.signal })
    ).rejects.toBeInstanceOf(CrawlbruleeError)

    expect(q.mock).not.toHaveBeenCalled()
  })
})
