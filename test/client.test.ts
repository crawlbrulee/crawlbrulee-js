import { describe, expect, it } from 'vitest'

import { Crawlbrulee, CrawlbruleeError, DEFAULT_BASE_URL, ENV_API_KEY } from '../src/index.js'

import { buildClient, createFetchQueue, jsonResponse, lastCallOf } from './helpers.js'

describe('Crawlbrulee — construction', () => {
  it('throws when apiKey is missing from the options', () => {
    expect(() => new Crawlbrulee({ apiKey: undefined as unknown as string })).toThrow(
      CrawlbruleeError
    )
  })

  it('rejects whitespace-only apiKey', () => {
    expect(() => new Crawlbrulee({ apiKey: '   ' })).toThrow(CrawlbruleeError)
  })

  it('does NOT read the API key from process.env unless fromEnv() is called', () => {
    const prev = process.env[ENV_API_KEY]
    process.env[ENV_API_KEY] = 'cble_env'
    try {
      expect(() => new Crawlbrulee({ apiKey: '' })).toThrow(CrawlbruleeError)
    } finally {
      if (prev === undefined) delete process.env[ENV_API_KEY]
      else process.env[ENV_API_KEY] = prev
    }
  })

  it('defaults baseUrl to the production host', () => {
    const client = new Crawlbrulee({ apiKey: 'cble_x' })
    expect(client.baseUrl).toBe(DEFAULT_BASE_URL)
  })

  it('honors an explicit baseUrl and strips the trailing slash', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ url: 'https://example.com' }))
    const client = buildClient(q.fetch, { baseUrl: 'https://api.example.com/' })

    expect(client.baseUrl).toBe('https://api.example.com')

    await client.scrape({ url: 'https://example.com' })
    expect(lastCallOf(q.mock).url).toBe('https://api.example.com/api/scrape')
  })
})

describe('Crawlbrulee.fromEnv', () => {
  it('reads apiKey from CRAWLBRULEE_API_KEY', () => {
    const prev = process.env[ENV_API_KEY]
    process.env[ENV_API_KEY] = 'cble_env_key'
    try {
      const client = Crawlbrulee.fromEnv()
      expect(client.baseUrl).toBe(DEFAULT_BASE_URL)
    } finally {
      if (prev === undefined) delete process.env[ENV_API_KEY]
      else process.env[ENV_API_KEY] = prev
    }
  })

  it('throws when CRAWLBRULEE_API_KEY is unset', () => {
    const prev = process.env[ENV_API_KEY]
    delete process.env[ENV_API_KEY]
    try {
      expect(() => Crawlbrulee.fromEnv()).toThrow(CrawlbruleeError)
    } finally {
      if (prev !== undefined) process.env[ENV_API_KEY] = prev
    }
  })

  it('throws when CRAWLBRULEE_API_KEY is whitespace-only', () => {
    const prev = process.env[ENV_API_KEY]
    process.env[ENV_API_KEY] = '   '
    try {
      expect(() => Crawlbrulee.fromEnv()).toThrow(CrawlbruleeError)
    } finally {
      if (prev === undefined) delete process.env[ENV_API_KEY]
      else process.env[ENV_API_KEY] = prev
    }
  })

  it('accepts overrides for non-apiKey options', () => {
    const prev = process.env[ENV_API_KEY]
    process.env[ENV_API_KEY] = 'cble_env_key'
    try {
      const client = Crawlbrulee.fromEnv({ timeoutMs: 5000 })
      expect(client.baseUrl).toBe(DEFAULT_BASE_URL)
    } finally {
      if (prev === undefined) delete process.env[ENV_API_KEY]
      else process.env[ENV_API_KEY] = prev
    }
  })
})

describe('Crawlbrulee — request shaping', () => {
  it('sends Authorization, content-type and accept headers on POST', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ url: 'https://example.com' }))
    const client = buildClient(q.fetch)

    await client.scrape({ url: 'https://example.com' })

    const { url, init } = lastCallOf(q.mock)
    expect(url).toBe('https://api.test.example/api/scrape')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer cble_test_key')
    expect(headers['content-type']).toBe('application/json')
    expect(headers.accept).toBe('application/json')
    expect(headers['user-agent']).toMatch(/^@crawlbrulee\/sdk/)
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://example.com' })
  })

  it('omits content-type on GET requests with no body', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse({
        organization_name: 'Acme',
        token_name: 'prod',
        token_preview: 'cble_…abc',
      })
    )
    const client = buildClient(q.fetch)

    await client.whoami()

    const { init } = lastCallOf(q.mock)
    expect(init.method).toBe('GET')
    const headers = init.headers as Record<string, string>
    expect(headers['content-type']).toBeUndefined()
    expect(init.body).toBeUndefined()
  })
})
