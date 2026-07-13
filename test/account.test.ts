import { describe, expect, it } from 'vitest'

import { buildClient, createFetchQueue, jsonResponse, lastCallOf } from './helpers.js'

describe('Crawlbrulee — account endpoints', () => {
  it('whoami() GETs /api/whoami', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        organization_name: 'Acme',
        token_name: 'prod-key',
        token_preview: 'cwbl_…abc',
      })
    )
    const client = buildClient(q.fetch)

    const res = await client.whoami()

    expect(lastCallOf(q.mock).url).toBe('https://api.test.example/api/whoami')
    expect(res).toEqual({
      organization_name: 'Acme',
      token_name: 'prod-key',
      token_preview: 'cwbl_…abc',
    })
  })

  it('usage() GETs /api/usage and exposes the credit snapshot', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        total_credits: 1000,
        used_credits: 250,
        available_credits: 750,
        used_quota_percent: 25,
        max_concurrency: 5,
        usage_reset: '2026-06-01T00:00:00.000Z',
      })
    )
    const client = buildClient(q.fetch)

    const res = await client.usage()

    expect(lastCallOf(q.mock).url).toBe('https://api.test.example/api/usage')
    expect(res.available_credits).toBe(750)
    expect(res.max_concurrency).toBe(5)
  })
})
