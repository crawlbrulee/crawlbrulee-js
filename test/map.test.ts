import { describe, expect, expectTypeOf, it } from 'vitest'

import type { MapDiscoveryCapReason, MapResponse, MapUsage } from '../src/index.js'
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
    links: overrides.links ?? [{ url: 'https://example.com/' }],
    response_meta: {
      usage: overrides.usage ?? {
        credits: 1,
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
        total_before_max_urls: 1,
        total_detected_before_storage_cap: 1,
        discovery_capped: false,
        sitemaps_skipped: 0,
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
        links: [{ url: 'https://example.com/' }, { url: 'https://example.com/about' }],
        response_meta: {
          usage: { credits: 1, zero_data_retention_credit_cost: 0, engine: 'http', proxy: 'basic' },
          pagination: { page: 1, limit: 100, total: 2, total_pages: 1, has_more: false },
          truncation: {
            storage_capped: false,
            response_capped: false,
            total_before_max_urls: 2,
            total_detected_before_storage_cap: 2,
            discovery_capped: false,
            sitemaps_skipped: 0,
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
      max_urls: 500,
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
      credits: 1,
      zero_data_retention_credit_cost: 0,
      engine: 'http',
      proxy: 'basic',
    })
    expect(res.response_meta.usage).not.toHaveProperty('screenshot_slices')
    expect(res.response_meta.truncation.discovery_capped).toBe(false)
    expect(res.response_meta.truncation.sitemaps_skipped).toBe(0)
    expect(res.response_meta.truncation.discovery_cap_reason).toBeNull()
    expect(res.links[0]).toEqual({ url: 'https://example.com/' })
  })

  it('sends only the fields the caller passed — no client-side max_urls/limit defaults', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse(mapResponse()))
    const client = buildClient(q.fetch)

    await client.map({ url: 'https://example.com' })

    const { init } = lastCallOf(q.mock)
    // the server owns the defaults (max_urls 5000, limit 5000); the sdk must not
    // freeze a copy of them into the request body
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://example.com' })
  })

  it('surfaces a discovery stop at max_urls without setting response_capped', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse(
        mapResponse({
          links: [{ url: 'https://example.com/' }, { url: 'https://example.com/about' }],
          truncation: {
            storage_capped: false,
            // discovery stops at max_urls, so the list was never trimmed at the end
            response_capped: false,
            total_before_max_urls: 2,
            total_detected_before_storage_cap: 2,
            discovery_capped: true,
            sitemaps_skipped: 3,
            discovery_cap_reason: 'max_urls',
          },
          pagination: { page: 1, limit: 5000, total: 2, total_pages: 1, has_more: false },
        })
      )
    )
    const client = buildClient(q.fetch)

    const res = await client.map({ url: 'https://example.com', max_urls: 2 })
    const { truncation } = res.response_meta

    expect(res.links).toHaveLength(2)
    expect(truncation.response_capped).toBe(false)
    expect(truncation.discovery_capped).toBe(true)
    expect(truncation.discovery_cap_reason).toBe('max_urls')
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
            total_before_max_urls: 1,
            total_detected_before_storage_cap: 1,
            discovery_capped: true,
            sitemaps_skipped: 12,
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
            total_before_max_urls: 1,
            total_detected_before_storage_cap: 1,
            discovery_capped: true,
            sitemaps_skipped: 2,
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
      max_urls: true,
      time: true,
      file_budget: true,
      depth: true,
      file_size: true,
      unread_files: true,
    }

    expect(Object.keys(reasons)).toEqual([
      'max_urls',
      'time',
      'file_budget',
      'depth',
      'file_size',
      'unread_files',
    ])
  })
})

describe('Crawlbrulee.map — usage fields', () => {
  it('reads the new usage fields next to the deprecated credits', async () => {
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
            credits: 5,
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
    expect(usage.credits).toBe(usage.total_credit_cost)
    expect(usage).not.toHaveProperty('screenshot_slicing_credit_cost')
  })

  it('still reads map usage from an api without the new fields', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse(
        mapResponse({
          usage: { credits: 1, zero_data_retention_credit_cost: 0, engine: 'http', proxy: 'basic' },
        })
      )
    )
    const client = buildClient(q.fetch)

    const { response_meta } = await client.map({ url: 'https://example.com' })

    expect(response_meta.usage.total_credit_cost).toBeUndefined()
    expect(response_meta.usage.total_credit_cost ?? response_meta.usage.credits).toBe(1)
  })

  it('types the new map usage fields as optional numbers and keeps credits required', () => {
    expectTypeOf<MapUsage['total_credit_cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<MapUsage['engine_credit_cost']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<MapUsage['proxy_multiplier']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<MapUsage['credits']>().toEqualTypeOf<number>()
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
            credits: 6,
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
