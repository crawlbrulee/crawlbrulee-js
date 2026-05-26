import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CrawlbruleeError, NotFoundError, RateLimitError, TransportError } from '../src/index.js'

import { buildClient, createFetchQueue, jsonResponse } from './helpers.js'

// ---------------------------------------------------------------------
// Timeout vs caller-abort discrimination
// ---------------------------------------------------------------------

describe('timeout vs caller-abort discrimination', () => {
  it('per-request timeout throws TransportError with errorName=request_timeout', async () => {
    const slowFetch: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    const client = buildClient(slowFetch, { timeoutMs: 10 })

    try {
      await client.scrape({ url: 'https://example.com' })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(TransportError)
      expect((err as TransportError).errorName).toBe('request_timeout')
      expect((err as TransportError).message).toMatch(/timed out after 10ms/)
    }
  })

  it('caller-supplied abort throws TransportError with errorName=client_closed_request', async () => {
    const slowFetch: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    const controller = new AbortController()
    const client = buildClient(slowFetch)
    const pending = client.scrape({ url: 'https://example.com' }, { signal: controller.signal })
    setTimeout(() => controller.abort(), 5)

    try {
      await pending
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(TransportError)
      expect((err as TransportError).errorName).toBe('client_closed_request')
    }
  })
})

// ---------------------------------------------------------------------
// composeSignal listener cleanup
// ---------------------------------------------------------------------

describe('composeSignal — listener cleanup on a reused AbortSignal', () => {
  it('does not accumulate listeners on a long-lived caller signal across many requests', async () => {
    const q = createFetchQueue()
    for (let i = 0; i < 30; i++) {
      q.enqueue(jsonResponse({ url: 'https://example.com' }))
    }
    const controller = new AbortController()
    const signal = controller.signal
    const client = buildClient(q.fetch, { timeoutMs: 10_000 })

    // Track listener attachments via a spy on addEventListener.
    type AddArgs = Parameters<typeof signal.addEventListener>
    type RemoveArgs = Parameters<typeof signal.removeEventListener>
    const added: string[] = []
    const removed: string[] = []
    const origAdd = signal.addEventListener.bind(signal)
    const origRemove = signal.removeEventListener.bind(signal)
    vi.spyOn(signal, 'addEventListener').mockImplementation((...args: AddArgs) => {
      added.push(args[0] as string)
      return origAdd(...args)
    })
    vi.spyOn(signal, 'removeEventListener').mockImplementation((...args: RemoveArgs) => {
      removed.push(args[0] as string)
      return origRemove(...args)
    })

    for (let i = 0; i < 30; i++) {
      await client.scrape({ url: 'https://example.com' }, { signal })
    }

    expect(added.length).toBe(30)
    expect(removed.length).toBe(30)
    vi.restoreAllMocks()
  })
})

// ---------------------------------------------------------------------
// Error-dispatch ordering: name-first, status-fallback
// ---------------------------------------------------------------------

describe('createApiError — name takes precedence over status', () => {
  it('403 with name=not_found maps to NotFoundError (not AuthenticationError)', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ name: 'not_found', message: 'no such job' }, 403))
    const client = buildClient(q.fetch)

    await expect(client.getScrapeResult('j')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('429 with a non-too_many_requests name still produces RateLimitError with normalized errorName', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({ name: 'internal_server_error', message: 'gateway rate-limited upstream' }, 429)
    )
    const client = buildClient(q.fetch)

    try {
      await client.scrape({ url: 'https://example.com' })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError)
      expect((err as RateLimitError).errorName).toBe('too_many_requests')
      // Raw body preserved on `response`.
      expect((err as RateLimitError).response?.name).toBe('internal_server_error')
    }
  })
})

// ---------------------------------------------------------------------
// waitForScrape: deadline check, unknown statuses, jobId validation
// ---------------------------------------------------------------------

describe('waitForScrape — unknown status + jobId validation', () => {
  it('throws CrawlbruleeError with errorName=job_failed when the server returns an unknown status', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        jobId: 'j',
        status: 'cancelled' as unknown as 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    )
    const client = buildClient(q.fetch)

    try {
      await client.waitForScrape('j', { intervalMs: 1 })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CrawlbruleeError)
      expect((err as CrawlbruleeError).errorName).toBe('job_failed')
      expect((err as CrawlbruleeError).message).toMatch(/unexpected status 'cancelled'/)
    }
  })

  it('rejects empty / whitespace-only jobId synchronously, without an HTTP call', () => {
    const q = createFetchQueue()
    const client = buildClient(q.fetch)

    expect(() => client.getScrapeStatus('')).toThrow(/non-empty string/)
    expect(() => client.getScrapeResult('   ')).toThrow(CrawlbruleeError)
    expect(q.mock).not.toHaveBeenCalled()
  })
})

describe('waitForScrape — deadline is checked at the top of every iteration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('only polls once when the deadline is exhausted by the first sleep, not a second time', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        jobId: 'j',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    )
    const client = buildClient(q.fetch)

    // intervalMs (50) > timeoutMs (30) — after one poll + one sleep, the deadline
    // is past, so the loop must throw on the NEXT iteration's deadline check
    // rather than firing a second fetch.
    const pending = client.waitForScrape('j', { intervalMs: 50, timeoutMs: 30 })
    // Attach the rejection assertion before driving the clock so vitest
    // doesn't flag the (already-handled) rejection as unhandled.
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'CrawlbruleeError',
      errorName: 'request_timeout',
    })
    await vi.runAllTimersAsync()
    await assertion
    expect(q.mock).toHaveBeenCalledTimes(1)
  })
})
