import { describe, expect, it } from 'vitest'

import { buildClient, createFetchQueue, jsonResponse, lastCallOf } from './helpers.js'

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
  })
})
