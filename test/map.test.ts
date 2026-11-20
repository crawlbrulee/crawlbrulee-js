import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  MapDiscoveryCapReason,
  MapEntries,
  MapLinkItem,
  MapLinkType,
  MapRequest,
  MapResponse,
  MapTruncation,
  MapUsage,
} from '../src/index.js'
import { buildClient, createFetchQueue, jsonResponse, lastCallOf } from './helpers.js'

/** Minimal valid `/api/map` body; callers override only what the test is about. */
function mapResponse(
  overrides: {
    links?: MapResponse['links']
    usage?: MapResponse['response_meta']['usage']
    pagination?: MapResponse['response_meta']['pagination']
    truncation?: MapResponse['response_meta']['truncation']
  } = {}
): MapResponse {
  return {
    links: overrides.links ?? [{ url: 'https://example.com/', type: 'page', lastmod: null }],
    response_meta: {
      usage: overrides.usage ?? {
        total_credit_cost: 1,
        zero_data_retention_credit_cost: 0,
        engine: 'http',
        proxy: 'basic',
      },
      pagination: overrides.pagination ?? {
        page: 1,
        limit: 5000,
        total: 1,
        total_pages: 1,
        has_more: false,
      },
      truncation: overrides.truncation ?? {
        storage_capped: false,
        response_capped: false,
        total_before_max_results: 1,
        total_before_max_urls: 1,
        total_detected_before_storage_cap: 1,
        discovery_capped: false,
        sitemaps_skipped: 0,
        unread_sitemaps: [],
        discovery_cap_reason: null,
      },
    },
  }
}

describe('Crawlbrulee.map', () => {
  it('POSTs to /api/map with the request body and returns the result', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        links: [
          { url: 'https://example.com/', type: 'page', lastmod: null },
          { url: 'https://example.com/about', type: 'page', lastmod: null },
        ],
        response_meta: {
          usage: {
            total_credit_cost: 1,
            zero_data_retention_credit_cost: 0,
            engine: 'http',
            proxy: 'basic',
          },
          pagination: { page: 1, limit: 100, total: 2, total_pages: 1, has_more: false },
          truncation: {
            storage_capped: false,
            response_capped: false,
            total_before_max_results: 2,
            total_before_max_urls: 2,
            total_detected_before_storage_cap: 2,
            discovery_capped: false,
            sitemaps_skipped: 0,
            unread_sitemaps: [],
            discovery_cap_reason: null,
          },
        },
      })
    )
    const client = buildClient(q.fetch)

    const res = await client.map({
      url: 'https://example.com',
      sitemap_only: true,
      types: { internal: true, external: false, internal_subdomains: false },
      max_results: 500,
      page: 1,
      limit: 100,
    })

    const { url, init } = lastCallOf(q.mock)
    expect(url).toBe('https://api.test.example/api/map')
    expect(JSON.parse(init.body as string)).toMatchObject({
      url: 'https://example.com',
      sitemap_only: true,
      types: { internal: true, external: false, internal_subdomains: false },
    })
    expect(res.links).toHaveLength(2)
    expect(res.response_meta.pagination.has_more).toBe(false)
    expect(res.response_meta.usage).toEqual({
      total_credit_cost: 1,
      zero_data_retention_credit_cost: 0,
      engine: 'http',
      proxy: 'basic',
    })
    expect(res.response_meta.usage).not.toHaveProperty('screenshot_slices')
    expect(res.response_meta.truncation.discovery_capped).toBe(false)
    expect(res.response_meta.truncation.sitemaps_skipped).toBe(0)
    expect(res.response_meta.truncation.discovery_cap_reason).toBeNull()
    expect(res.links[0]).toEqual({ url: 'https://example.com/', type: 'page', lastmod: null })
  })

  it('sends only the fields the caller passed — no client-side max_results/limit defaults', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse(mapResponse()))
    const client = buildClient(q.fetch)

    await client.map({ url: 'https://example.com' })

    const { init } = lastCallOf(q.mock)
    // the server owns the defaults (max_results 5000, limit 5000); the sdk must not
    // freeze a copy of them into the request body
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://example.com' })
  })

  it('surfaces a discovery stop at max_results without setting response_capped', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse(
        mapResponse({
          links: [
            { url: 'https://example.com/', type: 'page', lastmod: null },
            { url: 'https://example.com/about', type: 'page', lastmod: null },
          ],
          truncation: {
            storage_capped: false,
            // discovery stops at max_results, so the list was never trimmed at the end
            response_capped: false,
            total_before_max_results: 2,
            total_before_max_urls: 2,
            total_detected_before_storage_cap: 2,
            discovery_capped: true,
            sitemaps_skipped: 3,
            unread_sitemaps: [],
            discovery_cap_reason: 'max_results',
          },
          pagination: { page: 1, limit: 5000, total: 2, total_pages: 1, has_more: false },
        })
      )
    )
    const client = buildClient(q.fetch)

    const res = await client.map({ url: 'https://example.com', max_results: 2 })
    const { truncation } = res.response_meta

    expect(res.links).toHaveLength(2)
    expect(truncation.response_capped).toBe(false)
    expect(truncation.discovery_capped).toBe(true)
    expect(truncation.discovery_cap_reason).toBe('max_results')
    expect(truncation.sitemaps_skipped).toBe(3)
  })

  it('reports a non-actionable discovery stop reason verbatim', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse(
        mapResponse({
          truncation: {
            storage_capped: false,
            response_capped: false,
            total_before_max_results: 1,
            total_before_max_urls: 1,
            total_detected_before_storage_cap: 1,
            discovery_capped: true,
            sitemaps_skipped: 12,
            unread_sitemaps: [],
            discovery_cap_reason: 'file_budget',
          },
        })
      )
    )
    const client = buildClient(q.fetch)

    const res = await client.map({ url: 'https://example.com' })
    const reason: MapDiscoveryCapReason | null = res.response_meta.truncation.discovery_cap_reason

    expect(reason).toBe('file_budget')
  })

  it('reports the retryable unread_files stop reason verbatim', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse(
        mapResponse({
          truncation: {
            storage_capped: false,
            response_capped: false,
            total_before_max_results: 1,
            total_before_max_urls: 1,
            total_detected_before_storage_cap: 1,
            discovery_capped: true,
            sitemaps_skipped: 2,
            unread_sitemaps: [],
            discovery_cap_reason: 'unread_files',
          },
        })
      )
    )
    const client = buildClient(q.fetch)

    const res = await client.map({ url: 'https://example.com' })
    const reason: MapDiscoveryCapReason | null = res.response_meta.truncation.discovery_cap_reason

    expect(reason).toBe('unread_files')
  })

  it('types every discovery stop reason the api can return', () => {
    // A Record over the union fails `pnpm typecheck` when a value is missing
    // from this list or from the type, so the two cannot drift apart silently.
    const reasons: Record<MapDiscoveryCapReason, true> = {
      max_results: true,
      time: true,
      file_budget: true,
      depth: true,
      file_size: true,
      unread_files: true,
    }

    expect(Object.keys(reasons)).toEqual([
      'max_results',
      'time',
      'file_budget',
      'depth',
      'file_size',
      'unread_files',
    ])
  })
})

describe('Crawlbrulee.map — usage fields', () => {
  it('reads the usage fields', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse(
        mapResponse({
          usage: {
            total_credit_cost: 5,
            engine_credit_cost: 1,
            proxy_multiplier: 5,
            zero_data_retention_credit_cost: 0,
            engine: 'http',
            proxy: 'advanced',
          },
        })
      )
    )
    const client = buildClient(q.fetch)

    const { response_meta } = await client.map({ url: 'https://example.com' })
    const usage = response_meta.usage

    expect(usage.total_credit_cost).toBe(5)
    expect(usage.engine_credit_cost).toBe(1)
    expect(usage.proxy_multiplier).toBe(5)
    expect(usage).not.toHaveProperty('screenshot_slicing_credit_cost')
  })

  it('types the map usage fields as optional numbers, without the removed credits', () => {
    expectTypeOf<MapUsage['total_credit_cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<MapUsage['engine_credit_cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<MapUsage['proxy_multiplier']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<MapUsage>().not.toHaveProperty('credits')
    expectTypeOf<MapUsage['zero_data_retention_credit_cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<MapUsage>().not.toHaveProperty('screenshot_slicing_credit_cost')
  })
})

describe('Crawlbrulee.map — zero data retention', () => {
  it('sends zero_data_retention at the top level of the body', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse(mapResponse()))
    const client = buildClient(q.fetch)

    await client.map({ url: 'https://example.com', zero_data_retention: true })

    expect(JSON.parse(lastCallOf(q.mock).init.body as string)).toEqual({
      url: 'https://example.com',
      zero_data_retention: true,
    })
  })

  it('reads zero_data_retention_credit_cost and it adds into the total', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse(
        mapResponse({
          usage: {
            total_credit_cost: 6,
            engine_credit_cost: 1,
            proxy_multiplier: 5,
            zero_data_retention_credit_cost: 1,
            engine: 'http',
            proxy: 'advanced',
          },
        })
      )
    )
    const client = buildClient(q.fetch)

    const { usage } = (await client.map({ url: 'https://example.com' })).response_meta

    expect(usage.zero_data_retention_credit_cost).toBe(1)
    expect(usage.total_credit_cost).toBe(
      usage.engine_credit_cost! * usage.proxy_multiplier! + usage.zero_data_retention_credit_cost!
    )
  })
})

describe('Crawlbrulee.map — sitemap_url, depth, entries and modified_since', () => {
  it('sends the new top-level fields unchanged', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse(mapResponse()))
    const client = buildClient(q.fetch)

    await client.map({
      url: 'https://example.com',
      sitemap_url: 'https://cdn.example.com/sitemaps/products-1.xml.gz',
      depth: 1,
      entries: 'all',
      modified_since: '2026-11-01T00:00:00Z',
      max_results: 2_000,
    })

    expect(JSON.parse(lastCallOf(q.mock).init.body as string)).toEqual({
      url: 'https://example.com',
      sitemap_url: 'https://cdn.example.com/sitemaps/products-1.xml.gz',
      depth: 1,
      entries: 'all',
      modified_since: '2026-11-01T00:00:00Z',
      max_results: 2_000,
    })
  })

  it('passes a depth through without checking a maximum, so the api decides', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse(mapResponse()))
    const client = buildClient(q.fetch)

    await client.map({ url: 'https://example.com', depth: 9 })

    expect(JSON.parse(lastCallOf(q.mock).init.body as string)).toEqual({
      url: 'https://example.com',
      depth: 9,
    })
  })

  it('still sends the deprecated max_urls as given', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse(mapResponse()))
    const client = buildClient(q.fetch)

    // the old name must keep working until the api removes it
    await client.map({ url: 'https://example.com', max_urls: 300 })

    expect(JSON.parse(lastCallOf(q.mock).init.body as string)).toEqual({
      url: 'https://example.com',
      max_urls: 300,
    })
  })

  it('reads type and lastmod on each link, and unread_sitemaps', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse(
        mapResponse({
          links: [
            { url: 'https://example.com/sitemap-products.xml', type: 'sitemap', lastmod: null },
            {
              url: 'https://example.com/products/blue-mug',
              type: 'page',
              lastmod: '2026-11-10T08:30:00.000Z',
            },
          ],
          truncation: {
            storage_capped: false,
            response_capped: false,
            total_before_max_results: 2,
            total_before_max_urls: 2,
            total_detected_before_storage_cap: 2,
            discovery_capped: true,
            sitemaps_skipped: 1,
            unread_sitemaps: ['https://example.com/sitemap-blog.xml'],
            discovery_cap_reason: 'depth',
          },
        })
      )
    )
    const client = buildClient(q.fetch)

    const res = await client.map({ url: 'https://example.com', depth: 0, entries: 'all' })

    expect(res.links[0]).toEqual({
      url: 'https://example.com/sitemap-products.xml',
      type: 'sitemap',
      lastmod: null,
    })
    expect(res.links[1]?.type).toBe('page')
    expect(res.links[1]?.lastmod).toBe('2026-11-10T08:30:00.000Z')
    expect(res.response_meta.truncation.total_before_max_results).toBe(2)
    expect(res.response_meta.truncation.discovery_cap_reason).toBe('depth')
    expect(res.response_meta.truncation.unread_sitemaps).toEqual([
      'https://example.com/sitemap-blog.xml',
    ])
  })

  it('reads a sitemap_index link from a depth 1, entries sitemaps map', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse(
        mapResponse({
          links: [
            {
              url: 'https://example.com/sitemap_index.xml',
              type: 'sitemap_index',
              lastmod: '2026-11-12T00:00:00.000Z',
            },
            { url: 'https://example.com/sitemap-products.xml', type: 'sitemap', lastmod: null },
          ],
          truncation: {
            storage_capped: false,
            response_capped: false,
            total_before_max_results: 2,
            total_before_max_urls: 2,
            total_detected_before_storage_cap: 2,
            discovery_capped: true,
            sitemaps_skipped: 2,
            unread_sitemaps: [
              'https://example.com/sitemap_index.xml',
              'https://example.com/sitemap-products.xml',
            ],
            discovery_cap_reason: 'depth',
          },
        })
      )
    )
    const client = buildClient(q.fetch)

    const res = await client.map({ url: 'https://example.com', depth: 1, entries: 'sitemaps' })

    expect(res.links.map(link => link.type)).toEqual(['sitemap_index', 'sitemap'])
    expect(JSON.parse(lastCallOf(q.mock).init.body as string)).toEqual({
      url: 'https://example.com',
      depth: 1,
      entries: 'sitemaps',
    })
  })

  it('types the new request fields, the link shape and the truncation fields', () => {
    expectTypeOf<MapRequest['sitemap_url']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<MapRequest['depth']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<MapRequest['entries']>().toEqualTypeOf<MapEntries | undefined>()
    expectTypeOf<MapRequest['modified_since']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<MapRequest['max_results']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<MapEntries>().toEqualTypeOf<'pages' | 'sitemaps' | 'all'>()
    expectTypeOf<MapLinkType>().toEqualTypeOf<'page' | 'sitemap' | 'sitemap_index'>()
    expectTypeOf<MapLinkItem>().toEqualTypeOf<{
      url: string
      type: MapLinkType
      lastmod: string | null
    }>()
    expectTypeOf<MapTruncation['total_before_max_results']>().toEqualTypeOf<number>()
    expectTypeOf<MapTruncation['unread_sitemaps']>().toEqualTypeOf<string[]>()
    expectTypeOf<MapRequest>().not.toHaveProperty('sitemap')
  })
})
