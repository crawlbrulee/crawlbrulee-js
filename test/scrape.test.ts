import { describe, expect, it } from 'vitest'

import { buildClient, createFetchQueue, jsonResponse, lastCallOf } from './helpers.js'

describe('Crawlbrulee.scrape', () => {
  it('POSTs the request body verbatim and returns the parsed response', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        url: 'https://example.com/',
        markdown: '# Hello',
        metadata: { title: 'Example' },
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
          cleanup: { ads_and_popups: true },
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
