import { describe, expect, expectTypeOf, it } from 'vitest'

import { ValidationError } from '../src/index.js'
import type {
  PdfLayout,
  PdfMedia,
  PdfPaper,
  PdfRequest,
  PdfResult,
  ScrapeCookie,
  ScrapeExtract,
  ScrapeRequest,
  ScrapeResponse,
  ScrapeWarningCode,
  ScreenshotColorScheme,
  ScreenshotRequest,
  Usage,
} from '../src/index.js'
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
          usage: { total_credit_cost: 15, engine: 'browser', proxy: 'advanced' },
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
      total_credit_cost: 15,
      engine: 'browser',
      proxy: 'advanced',
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
  })

  it('still reads a response from an api without page_status_code or the usage breakdown', async () => {
    // The shape the api returned before page_status_code and the usage
    // breakdown existed. It must keep type-checking and parsing.
    const oldResponse: ScrapeResponse = {
      url: 'https://example.com/',
      requested_url: 'https://example.com',
      markdown: '# Hello',
      response_meta: {
        usage: {
          engine: 'browser',
          proxy: 'basic',
        },
      },
    }
    const q = createFetchQueue()
    q.enqueue(jsonResponse(oldResponse))
    const client = buildClient(q.fetch)

    const page = await client.scrape({ url: 'https://example.com' })

    expect(page.page_status_code).toBeUndefined()
    expect(page.response_meta.usage.total_credit_cost).toBeUndefined()
  })

  it('types page_status_code as an optional number and the new usage fields as optional numbers', () => {
    expectTypeOf<ScrapeResponse['page_status_code']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Usage['total_credit_cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Usage['engine_credit_cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Usage['proxy_multiplier']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Usage['screenshot_slicing_credit_cost']>().toEqualTypeOf<number | undefined>()
    // The removed deprecated names are gone from the type.
    expectTypeOf<Usage>().not.toHaveProperty('credits')
    expectTypeOf<Usage>().not.toHaveProperty('screenshot_slices')
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

describe('Crawlbrulee.scrape — headers and cookies', () => {
  it('sends headers and cookies unchanged: header name case and cookie order are kept', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        url: 'https://app.example.com/orders',
        requested_url: 'https://app.example.com/orders',
      })
    )
    const client = buildClient(q.fetch)

    await client.scrape({
      url: 'https://app.example.com/orders',
      headers: { Authorization: 'Bearer abc', 'X-Tenant-Id': 'acme', 'x-lower-case': 'v' },
      cookies: [
        { name: 'session_id', value: 'a1b2c3' },
        { name: 'theme', value: 'dark' },
        { name: 'a_last', value: '1' },
      ],
    })

    const body = JSON.parse(lastCallOf(q.mock).init.body as string)
    expect(body).toEqual({
      url: 'https://app.example.com/orders',
      headers: { Authorization: 'Bearer abc', 'X-Tenant-Id': 'acme', 'x-lower-case': 'v' },
      cookies: [
        { name: 'session_id', value: 'a1b2c3' },
        { name: 'theme', value: 'dark' },
        { name: 'a_last', value: '1' },
      ],
    })
    expect(Object.keys(body.headers)).toEqual(['Authorization', 'X-Tenant-Id', 'x-lower-case'])
    expect(body.cookies.map((c: ScrapeCookie) => c.name)).toEqual(['session_id', 'theme', 'a_last'])
  })

  it('keeps the headers for the site in the body, apart from the request headers of the sdk', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({ url: 'https://app.example.com/', requested_url: 'https://app.example.com' })
    )
    const client = buildClient(q.fetch)

    await client.scrape({
      url: 'https://app.example.com',
      headers: { Authorization: 'Bearer target' },
    })

    const { init } = lastCallOf(q.mock)
    const sent = init.headers as Record<string, string>
    expect(sent.authorization).toMatch(/^Bearer cwbl_/)
    expect(sent).not.toHaveProperty('Authorization')
    expect(JSON.parse(init.body as string).headers).toEqual({ Authorization: 'Bearer target' })
  })

  it('does not send either field when it is not set', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ url: 'https://example.com/', requested_url: 'https://example.com' }))
    const client = buildClient(q.fetch)

    await client.scrape({ url: 'https://example.com' })

    const body = JSON.parse(lastCallOf(q.mock).init.body as string)
    expect(body).not.toHaveProperty('headers')
    expect(body).not.toHaveProperty('cookies')
  })

  it('reads the custom_user_agent warning', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        url: 'https://example.com/',
        requested_url: 'https://example.com',
        warnings: ['custom_user_agent'],
      })
    )
    const client = buildClient(q.fetch)

    const page = await client.scrape({
      url: 'https://example.com',
      headers: { 'User-Agent': 'my-bot/1.0' },
    })

    expect(page.warnings).toEqual(['custom_user_agent'])
    expectTypeOf<'custom_user_agent'>().toMatchTypeOf<ScrapeWarningCode>()
  })

  it('still reads a warning code it does not know yet', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        url: 'https://example.com/',
        requested_url: 'https://example.com',
        warnings: ['custom_user_agent', 'some_future_code'],
      })
    )
    const client = buildClient(q.fetch)

    const page = await client.scrape({ url: 'https://example.com' })

    expect(page.warnings).toEqual(['custom_user_agent', 'some_future_code'])
  })

  it('raises ValidationError when the api refuses a header', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse(
        {
          name: 'validation_error',
          message:
            'Request validation failed: headers: "Cookie" can\'t be set as a header. Send cookies in the cookies field.',
        },
        400
      )
    )
    const client = buildClient(q.fetch)

    await expect(
      client.scrape({ url: 'https://example.com', headers: { Cookie: 'a=b' } })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('types headers as a string map and cookies as a list of name and value', () => {
    expectTypeOf<ScrapeRequest['headers']>().toEqualTypeOf<Record<string, string> | undefined>()
    expectTypeOf<ScrapeRequest['cookies']>().toEqualTypeOf<ScrapeCookie[] | undefined>()
    expectTypeOf<ScrapeCookie>().toEqualTypeOf<{ name: string; value: string }>()
  })
})

describe('Crawlbrulee.scrape — pdf', () => {
  it('sends extract.pdf as {} when every default is wanted', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ url: 'https://example.com/', requested_url: 'https://example.com' }))
    const client = buildClient(q.fetch)

    await client.scrape({
      url: 'https://example.com',
      extract: { markdown: false, metadata: false, pdf: {} },
    })

    expect(JSON.parse(lastCallOf(q.mock).init.body as string)).toEqual({
      url: 'https://example.com',
      extract: { markdown: false, metadata: false, pdf: {} },
    })
  })

  it('sends every pdf option unchanged', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ url: 'https://example.com/', requested_url: 'https://example.com' }))
    const client = buildClient(q.fetch)

    const pdf: PdfRequest = { layout: 'pages', paper: 'letter', landscape: true, media: 'print' }
    await client.scrape({ url: 'https://example.com', extract: { pdf } })

    expect(JSON.parse(lastCallOf(q.mock).init.body as string).extract).toEqual({
      pdf: { layout: 'pages', paper: 'letter', landscape: true, media: 'print' },
    })
  })

  it('reads the top-level pdf result next to the other outputs', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        url: 'https://example.com/',
        requested_url: 'https://example.com',
        page_status_code: 200,
        markdown: '# Hello',
        pdf: { url: 'https://cdn.example.com/pdf/abc.pdf?token=t', bytes: 48213 },
        response_meta: {
          usage: {
            total_credit_cost: 5,
            engine_credit_cost: 5,
            proxy_multiplier: 1,
            screenshot_slicing_credit_cost: 0,
            zero_data_retention_credit_cost: 0,
            engine: 'screenshot',
            proxy: 'basic',
          },
        },
      })
    )
    const client = buildClient(q.fetch)

    const page = await client.scrape({ url: 'https://example.com', extract: { pdf: {} } })

    expect(page.pdf).toEqual({ url: 'https://cdn.example.com/pdf/abc.pdf?token=t', bytes: 48213 })
    expect(page.markdown).toBe('# Hello')
    expect(page.response_meta.usage.engine).toBe('screenshot')
  })

  it('reads pdf_unavailable when the pdf could not be made, and leaves pdf out', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        url: 'https://example.com/',
        requested_url: 'https://example.com',
        markdown: '# Hello',
        warnings: ['pdf_unavailable'],
      })
    )
    const client = buildClient(q.fetch)

    const page = await client.scrape({ url: 'https://example.com', extract: { pdf: {} } })

    expect(page.pdf).toBeUndefined()
    expect(page.warnings).toEqual(['pdf_unavailable'])
    expect(page.markdown).toBe('# Hello')
  })

  it('reads pdf_single_page_overflow next to the pdf', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        url: 'https://example.com/',
        requested_url: 'https://example.com',
        pdf: { url: 'https://cdn.example.com/pdf/tall.pdf', bytes: 912000 },
        warnings: ['pdf_single_page_overflow'],
      })
    )
    const client = buildClient(q.fetch)

    const page = await client.scrape({
      url: 'https://example.com',
      extract: { markdown: false, metadata: false, pdf: { layout: 'single_page' } },
    })

    expect(page.pdf?.bytes).toBe(912000)
    expect(page.warnings).toEqual(['pdf_single_page_overflow'])
  })

  it('raises ValidationError for unsupported_pdf_output', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse(
        { name: 'unsupported_pdf_output', message: 'This content type cannot be saved as a PDF.' },
        422
      )
    )
    const client = buildClient(q.fetch)

    await expect(
      client.scrape({
        url: 'https://example.com/data.json',
        extract: { markdown: false, metadata: false, pdf: {} },
      })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('types the pdf request, its options, the result and the warnings', () => {
    expectTypeOf<ScrapeExtract['pdf']>().toEqualTypeOf<PdfRequest | undefined>()
    expectTypeOf<PdfLayout>().toEqualTypeOf<'pages' | 'single_page'>()
    expectTypeOf<PdfPaper>().toEqualTypeOf<'a4' | 'letter'>()
    expectTypeOf<PdfMedia>().toEqualTypeOf<'screen' | 'print'>()
    expectTypeOf<PdfRequest>().toEqualTypeOf<{
      layout?: PdfLayout
      paper?: PdfPaper
      landscape?: boolean
      media?: PdfMedia
    }>()
    expectTypeOf<ScrapeResponse['pdf']>().toEqualTypeOf<PdfResult | undefined>()
    expectTypeOf<PdfResult>().toEqualTypeOf<{ url: string; bytes: number }>()
    expectTypeOf<'pdf_unavailable'>().toMatchTypeOf<ScrapeWarningCode>()
    expectTypeOf<'pdf_single_page_overflow'>().toMatchTypeOf<ScrapeWarningCode>()
  })
})

describe('Crawlbrulee.scrape — dark mode', () => {
  it('sends screenshot.color_scheme unchanged, next to a pdf', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ url: 'https://example.com/', requested_url: 'https://example.com' }))
    const client = buildClient(q.fetch)

    await client.scrape({
      url: 'https://example.com',
      extract: { screenshot: { type: 'full_page', color_scheme: 'dark' }, pdf: {} },
    })

    expect(JSON.parse(lastCallOf(q.mock).init.body as string).extract).toEqual({
      screenshot: { type: 'full_page', color_scheme: 'dark' },
      pdf: {},
    })
  })

  it('does not send color_scheme when it is not set', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ url: 'https://example.com/', requested_url: 'https://example.com' }))
    const client = buildClient(q.fetch)

    await client.scrape({
      url: 'https://example.com',
      extract: { screenshot: { type: 'viewport' } },
    })

    const body = JSON.parse(lastCallOf(q.mock).init.body as string)
    expect(body.extract.screenshot).not.toHaveProperty('color_scheme')
  })

  it('types color_scheme as light or dark', () => {
    expectTypeOf<ScreenshotColorScheme>().toEqualTypeOf<'light' | 'dark'>()
    expectTypeOf<ScreenshotRequest['color_scheme']>().toEqualTypeOf<
      ScreenshotColorScheme | undefined
    >()
  })
})
