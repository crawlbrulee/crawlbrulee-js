import { describe, expect, it } from 'vitest'

import type { MapDiscoveryCapReason, MapResponse } from '../src/index.js'
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
      usage: overrides.usage ?? { credits: 1, engine: 'text', proxy: 'basic' },
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
          usage: { credits: 1, engine: 'text', proxy: 'basic' },
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
    expect(res.response_meta.usage).toEqual({ credits: 1, engine: 'text', proxy: 'basic' })
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
})
