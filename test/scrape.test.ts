import { describe, expect, expectTypeOf, it } from 'vitest'

import type { ScrapeResponse, Usage } from '../src/index.js'
import { buildClient, createFetchQueue, jsonResponse, lastCallOf } from './helpers.js'

describe('Crawlbrulee.scrape', () => {
  it('POSTs the request body verbatim and returns the parsed response', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        url: 'https://example.com/',
        requested_url: 'https://example.com',
        markdown: '# Hello',
        metadata: { title: 'Example' },
        response_meta: {
          usage: { credits: 15, engine: 'browser', proxy: 'advanced', screenshot_slices: 0 },
        },
      })
    )
    const client = buildClient(q.fetch)

    const res = await client.scrape({
      url: 'https://example.com',
      extract: { markdown: true, metadata: true },
      proxy: 'advanced',
      require_js: true,
    })

    const { url, init } = lastCallOf(q.mock)
    expect(url).toBe('https://api.test.example/api/scrape')
    expect(JSON.parse(init.body as string)).toEqual({
      url: 'https://example.com',
      extract: { markdown: true, metadata: true },
      proxy: 'advanced',
      require_js: true,
    })
    expect(res.markdown).toBe('# Hello')
    expect(res.metadata?.title).toBe('Example')
    expect(res.requested_url).toBe('https://example.com')
    expect(res.response_meta.usage).toEqual({
      credits: 15,
      engine: 'browser',
      proxy: 'advanced',
      screenshot_slices: 0,
    })
  })

  it('supports the full screenshot shape (viewport + actions)', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        url: 'https://example.com/',
        screenshot: {
          url: 'https://cdn.example/screenshot.png',
          type: 'full_page',
          properties: {
            file_name: 'screenshot.png',
            mime: 'image/png',
            width: 1280,
            height: 4200,
            viewport: { width: 1280, height: 720, device_scale_factor: 1 },
          },
        },
      })
    )
    const client = buildClient(q.fetch)

    await client.scrape({
      url: 'https://example.com',
      extract: {
        screenshot: {
          type: 'full_page',
          device_mode: 'desktop',
          viewport: { width: 1280, height: 720 },
          actions_before: [
            { type: 'wait', ms: 500 },
            { type: 'scroll', pixels: 2000 },
          ],
          actions_after: [{ type: 'slice', height: 1000 }],
        },
      },
    })

    const body = JSON.parse(lastCallOf(q.mock).init.body as string)
    expect(body.extract.screenshot.actions_before).toHaveLength(2)
    expect(body.extract.screenshot.actions_after[0]).toEqual({ type: 'slice', height: 1000 })
  })
})

describe('Crawlbrulee.scrape — page status and usage', () => {
  it('returns a 404 page as a normal result carrying page_status_code', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        url: 'https://example.com/missing',
        requested_url: 'https://example.com/missing',
        page_status_code: 404,
        content_type: 'text/html',
        markdown: '# Page not found',
        metadata: { title: 'Page not found' },
        response_meta: {
          usage: {
            total_credit_cost: 1,
            engine_credit_cost: 1,
            proxy_multiplier: 1,
            screenshot_slicing_credit_cost: 0,
            zero_data_retention_credit_cost: 0,
            engine: 'http',
            proxy: 'basic',
            credits: 1,
            screenshot_slices: 0,
          },
        },
        warnings: [],
      })
    )
    const client = buildClient(q.fetch)

    const page = await client.scrape({ url: 'https://example.com/missing' })

    expect(page.page_status_code).toBe(404)
    expect(page.markdown).toBe('# Page not found')
  })

  it('reads the new usage fields next to the deprecated ones', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        url: 'https://example.com/',
        requested_url: 'https://example.com',
        page_status_code: 200,
        response_meta: {
          usage: {
            total_credit_cost: 26,
            engine_credit_cost: 5,
            proxy_multiplier: 5,
            screenshot_slicing_credit_cost: 1,
            zero_data_retention_credit_cost: 0,
            engine: 'screenshot',
            proxy: 'advanced',
            credits: 26,
            screenshot_slices: 1,
          },
        },
      })
    )
    const client = buildClient(q.fetch)

    const { response_meta } = await client.scrape({ url: 'https://example.com' })
    const usage = response_meta.usage

    expect(usage.total_credit_cost).toBe(26)
    expect(usage.engine_credit_cost).toBe(5)
    expect(usage.proxy_multiplier).toBe(5)
    expect(usage.screenshot_slicing_credit_cost).toBe(1)
    // The price explains itself: base × multiplier + slicing.
    expect(usage.total_credit_cost).toBe(
      usage.engine_credit_cost! * usage.proxy_multiplier! + usage.screenshot_slicing_credit_cost!
    )
    // The deprecated names still carry the same values.
    expect(usage.credits).toBe(usage.total_credit_cost)
    expect(usage.screenshot_slices).toBe(usage.screenshot_slicing_credit_cost)
  })

  it('still reads a response from an api without page_status_code or the new usage fields', async () => {
    // The shape the api returned before page_status_code and the usage
    // breakdown existed. It must keep type-checking and parsing.
    const oldResponse: ScrapeResponse = {
      url: 'https://example.com/',
      requested_url: 'https://example.com',
      markdown: '# Hello',
      response_meta: {
        usage: {
          credits: 3,
          zero_data_retention_credit_cost: 0,
          engine: 'browser',
          proxy: 'basic',
          screenshot_slices: 0,
        },
      },
    }
    const q = createFetchQueue()
    q.enqueue(jsonResponse(oldResponse))
    const client = buildClient(q.fetch)

    const page = await client.scrape({ url: 'https://example.com' })

    expect(page.page_status_code).toBeUndefined()
    expect(page.response_meta.usage.total_credit_cost).toBeUndefined()
    // Reading code falls back to the old name when the new one is missing.
    expect(page.response_meta.usage.total_credit_cost ?? page.response_meta.usage.credits).toBe(3)
  })

  it('types page_status_code as an optional number and the new usage fields as optional numbers', () => {
    expectTypeOf<ScrapeResponse['page_status_code']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Usage['total_credit_cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Usage['engine_credit_cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Usage['proxy_multiplier']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Usage['screenshot_slicing_credit_cost']>().toEqualTypeOf<number | undefined>()
    // The deprecated names stay required: every api version sends them.
    expectTypeOf<Usage['credits']>().toEqualTypeOf<number>()
    expectTypeOf<Usage['screenshot_slices']>().toEqualTypeOf<number>()
  })
})

describe('Crawlbrulee.scrape — zero data retention', () => {
  it('sends zero_data_retention at the top level of the body', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ url: 'https://example.com/', requested_url: 'https://example.com' }))
    const client = buildClient(q.fetch)

    await client.scrape({
      url: 'https://example.com',
      zero_data_retention: true,
      cache: { max_age: 0 },
    })

    expect(JSON.parse(lastCallOf(q.mock).init.body as string)).toEqual({
      url: 'https://example.com',
      zero_data_retention: true,
      cache: { max_age: 0 },
    })
  })

  it('does not send the field when it is not set', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ url: 'https://example.com/', requested_url: 'https://example.com' }))
    const client = buildClient(q.fetch)

    await client.scrape({ url: 'https://example.com' })

    expect(JSON.parse(lastCallOf(q.mock).init.body as string)).not.toHaveProperty(
      'zero_data_retention'
    )
  })

  it('reads zero_data_retention_credit_cost and it adds into the total', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        url: 'https://example.com/',
        requested_url: 'https://example.com',
        response_meta: {
          usage: {
            total_credit_cost: 6,
            engine_credit_cost: 1,
            proxy_multiplier: 5,
            screenshot_slicing_credit_cost: 0,
            zero_data_retention_credit_cost: 1,
            engine: 'http',
            proxy: 'advanced',
            credits: 6,
            screenshot_slices: 0,
          },
        },
      })
    )
    const client = buildClient(q.fetch)

    const { usage } = (await client.scrape({ url: 'https://example.com' })).response_meta

    expect(usage.zero_data_retention_credit_cost).toBe(1)
    expect(usage.total_credit_cost).toBe(
      usage.engine_credit_cost! * usage.proxy_multiplier! +
        usage.screenshot_slicing_credit_cost! +
        usage.zero_data_retention_credit_cost!
    )
  })

  it('types zero_data_retention_credit_cost as an optional number, like the other cost parts', () => {
    expectTypeOf<Usage['zero_data_retention_credit_cost']>().toEqualTypeOf<number | undefined>()
  })
})
