import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import type {
  ScrapeElementObject,
  ScrapeElements,
  ScrapeElementSpec,
  ScrapeElementValue,
  ScrapeResponse,
  ScrapeWarningCode,
} from '../src/index.js'
import { buildClient, createFetchQueue, jsonResponse, lastCallOf } from './helpers.js'

const booksElements: ScrapeElements = {
  heading: 'h1',
  books: {
    selector: 'article.product_pod',
    all: true,
    fields: {
      title: { selector: 'h3 a', output: 'attribute', attribute: 'title' },
      price: '.price_color',
      url: { selector: 'h3 a', output: 'attribute', attribute: 'href' },
    },
  },
  next_page: { selector: 'li.next a', output: 'attribute', attribute: 'href' },
}

const booksResult = {
  url: 'https://books.toscrape.com/',
  requested_url: 'https://books.toscrape.com/',
  elements: {
    heading: 'All products',
    books: [
      {
        title: 'A Light in the Attic',
        price: '£51.77',
        url: 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
      },
      {
        title: 'Tipping the Velvet',
        price: '£53.74',
        url: 'https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html',
      },
    ],
    next_page: 'https://books.toscrape.com/catalogue/page-2.html',
  },
  response_meta: { usage: { total_credit_cost: 1, engine: 'http', proxy: 'basic' } },
}

describe('extract.elements — request', () => {
  it('scrape sends extract.elements as-is', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse(booksResult))
    const client = buildClient(q.fetch)

    await client.scrape({
      url: 'https://books.toscrape.com/',
      extract: { elements: booksElements },
    })

    const { url, init } = lastCallOf(q.mock)
    expect(url).toBe('https://api.test.example/api/scrape')
    expect(JSON.parse(init.body as string)).toEqual({
      url: 'https://books.toscrape.com/',
      extract: { elements: booksElements },
    })
  })

  it('scrapeAsync sends extract.elements as-is, nested fields included', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ job_id: 'job-el' }, 202))
    const client = buildClient(q.fetch)

    const elements: ScrapeElements = {
      categories: {
        selector: '.category',
        all: true,
        fields: {
          name: 'h2',
          products: {
            selector: '.product',
            all: true,
            fields: {
              title: '.title',
              variants: {
                selector: '.variant',
                all: true,
                fields: {
                  sku: { selector: '[data-sku]', output: 'attribute', attribute: 'data-sku' },
                },
              },
            },
          },
        },
      },
      body: { selector: 'main', output: 'html' },
    }
    await client.scrapeAsync({ url: 'https://shop.example/', extract: { elements } })

    const { url, init } = lastCallOf(q.mock)
    expect(url).toBe('https://api.test.example/api/scrape/async')
    expect(JSON.parse(init.body as string)).toEqual({
      url: 'https://shop.example/',
      extract: { elements },
    })
  })

  it('types fields as nesting up to 3 levels, with no fields on the innermost level', () => {
    const ok: ScrapeElementSpec = {
      selector: 'a',
      fields: { b: { selector: 'b', fields: { c: { selector: 'c', fields: { d: 'd' } } } } },
    }
    void ok

    const tooDeep: ScrapeElementSpec = {
      selector: 'a',
      fields: {
        b: {
          selector: 'b',
          fields: {
            c: {
              selector: 'c',
              // @ts-expect-error — a fourth level of fields is not allowed
              fields: { d: { selector: 'd', fields: { e: 'e' } } },
            },
          },
        },
      },
    }
    void tooDeep

    // @ts-expect-error — output is one of text, html or attribute
    const badOutput: ScrapeElementSpec = { selector: 'a', output: 'json' }
    void badOutput
  })

  it('types fields as never combined with output or attribute', () => {
    const withFields: ScrapeElementSpec = { selector: 'a', all: true, fields: { b: 'b' } }
    const withOutput: ScrapeElementSpec = { selector: 'a', output: 'attribute', attribute: 'href' }
    void withFields
    void withOutput

    // @ts-expect-error — fields can't be combined with output
    const mixedOutput: ScrapeElementSpec = { selector: 'a', output: 'text', fields: { b: 'b' } }
    void mixedOutput

    // @ts-expect-error — fields can't be combined with attribute
    const mixedAttr: ScrapeElementSpec = { selector: 'a', attribute: 'href', fields: { b: 'b' } }
    void mixedAttr

    const nested: ScrapeElementSpec = {
      selector: 'a',
      fields: {
        // @ts-expect-error — the same rule holds inside fields
        b: { selector: 'b', output: 'html', fields: { c: 'c' } },
      },
    }
    void nested
  })
})

describe('extract.elements — response', () => {
  it('scrape returns elements: strings, null, lists and objects', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        ...booksResult,
        elements: { ...booksResult.elements, missing: null, empty_list: [], tags: ['a', 'b'] },
      })
    )
    const client = buildClient(q.fetch)

    const page = await client.scrape({
      url: 'https://books.toscrape.com/',
      extract: {
        elements: {
          ...booksElements,
          missing: '.nope',
          empty_list: { selector: '.nope', all: true },
          tags: { selector: '.tag', all: true },
        },
      },
    })

    expect(page.elements?.heading).toBe('All products')
    expect(page.elements?.next_page).toBe('https://books.toscrape.com/catalogue/page-2.html')
    expect(page.elements?.missing).toBeNull()
    expect(page.elements?.empty_list).toEqual([])
    expect(page.elements?.tags).toEqual(['a', 'b'])

    const books = page.elements?.books
    expect(Array.isArray(books)).toBe(true)
    if (!Array.isArray(books)) throw new Error('books should be a list')
    const first = books[0] as ScrapeElementObject
    expect(first.title).toBe('A Light in the Attic')
    expect(first.price).toBe('£51.77')
  })

  it('getScrapeResult returns nested element objects 3 levels deep', async () => {
    const elements = {
      categories: [
        {
          name: 'Shoes',
          products: [
            {
              title: 'Runner',
              variants: [{ sku: 'R-41' }, { sku: null }],
              colors: ['red', 'blue'],
            },
          ],
        },
      ],
      body: '<main>…</main>',
    }
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ url: 'https://shop.example/', elements }))
    const client = buildClient(q.fetch)

    const res = await client.getScrapeResult('job-el')

    expect(res.elements).toEqual(elements)
  })

  it('carries elements_truncated as a warning', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ ...booksResult, warnings: ['elements_truncated'] }))
    const client = buildClient(q.fetch)

    const page = await client.scrape({
      url: 'https://books.toscrape.com/',
      extract: { elements: booksElements },
    })

    expect(page.warnings).toEqual(['elements_truncated'])
  })

  it('carries elements in unsupported_fields when the page is json', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        url: 'https://example.com/data.json',
        content_type: 'application/json',
        unsupported_fields: ['elements'],
      })
    )
    const client = buildClient(q.fetch)

    const page = await client.scrape({
      url: 'https://example.com/data.json',
      extract: { elements: { title: 'h1' } },
    })

    expect(page.unsupported_fields).toEqual(['elements'])
    expect(page.elements).toBeUndefined()
  })

  it('types elements as an optional map of element values', () => {
    expectTypeOf<ScrapeResponse['elements']>().toEqualTypeOf<
      Record<string, ScrapeElementValue> | undefined
    >()
    expectTypeOf<null>().toMatchTypeOf<ScrapeElementValue>()
    expectTypeOf<string[]>().toMatchTypeOf<ScrapeElementValue>()
    expectTypeOf<ScrapeElementObject[]>().toMatchTypeOf<ScrapeElementValue>()
    expectTypeOf<'elements_truncated'>().toMatchTypeOf<ScrapeWarningCode>()
    expectTypeOf<'screenshot_unavailable'>().toMatchTypeOf<ScrapeWarningCode>()
  })
})

describe('extract.elements — waitForScrape', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the elements from the finished job', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({ job_id: 'job-el', status: 'done', created_at: '2026-01-01T00:00:00.000Z' })
    )
    q.enqueue(jsonResponse(booksResult))
    const client = buildClient(q.fetch)

    const pending = client.waitForScrape('job-el', { intervalMs: 1 })
    await vi.runAllTimersAsync()
    const res = await pending

    expect(res.elements).toEqual(booksResult.elements)
  })
})
