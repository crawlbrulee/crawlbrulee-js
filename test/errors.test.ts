import { describe, expect, it } from 'vitest'

import {
  AuthenticationError,
  CrawlbruleeError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  TransportError,
  UsageAllocationError,
  ValidationError,
  isCrawlbruleeError,
} from '../src/index.js'

import { buildClient, createFetchQueue, jsonResponse, textResponse } from './helpers.js'

describe('Error mapping', () => {
  it('maps 401 with invalid_credentials to AuthenticationError', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ name: 'invalid_credentials', message: 'bad key' }, 401))
    const client = buildClient(q.fetch)

    await expect(client.whoami()).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('maps 429 with too_many_requests and surfaces retry_after_ms', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse(
        {
          name: 'too_many_requests',
          message: 'slow down',
          details: { error_name: 'too_many_requests', retry_after_ms: 1500, limited_by: 'org' },
        },
        429
      )
    )
    const client = buildClient(q.fetch)

    try {
      await client.scrape({ url: 'https://example.com' })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError)
      const e = err as RateLimitError
      expect(e.status).toBe(429)
      expect(e.retryAfterMs).toBe(1500)
      expect(e.limitedBy).toBe('org')
    }
  })

  it('maps usage_allocation_error and surfaces structured reason + details', async () => {
    const q = createFetchQueue()
    q.enqueue(
      jsonResponse(
        {
          name: 'usage_allocation_error',
          message: 'over the credit limit',
          details: {
            error_name: 'usage_allocation_error',
            reason: 'credit_limit',
            details: { current_usage: 1000, max_credits: 1000 },
          },
        },
        402
      )
    )
    const client = buildClient(q.fetch)

    try {
      await client.scrape({ url: 'https://example.com' })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(UsageAllocationError)
      const e = err as UsageAllocationError
      expect(e.reason).toBe('credit_limit')
      expect(e.usage?.current_usage).toBe(1000)
    }
  })

  it('maps 404 not_found to NotFoundError', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ name: 'not_found', message: 'no such job' }, 404))
    const client = buildClient(q.fetch)

    await expect(client.getScrapeResult('missing')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('maps 503 service_unavailable to ServiceUnavailableError, not AuthenticationError', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ name: 'service_unavailable', message: 'try again shortly' }, 503))
    const client = buildClient(q.fetch)

    try {
      await client.scrape({ url: 'https://example.com' })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceUnavailableError)
      // A transient 503 must never read as a credentials problem — that is the
      // whole point of the api no longer returning 401 for infra failures.
      expect(err).not.toBeInstanceOf(AuthenticationError)
      const e = err as ServiceUnavailableError
      expect(e.status).toBe(503)
      expect(e.errorName).toBe('service_unavailable')
    }
  })

  it('maps a 503 with an unrecognized name to ServiceUnavailableError by status', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ name: 'internal_server_error', message: 'upstream down' }, 503))
    const client = buildClient(q.fetch)

    await expect(client.whoami()).rejects.toBeInstanceOf(ServiceUnavailableError)
  })

  it('maps invalid_url to ValidationError', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ name: 'invalid_url', message: 'bad url' }, 400))
    const client = buildClient(q.fetch)

    await expect(client.scrape({ url: 'not-a-url' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('falls back to CrawlbruleeError for unknown error names', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ name: 'scrape_error', message: 'page crashed' }, 500))
    const client = buildClient(q.fetch)

    try {
      await client.scrape({ url: 'https://example.com' })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(CrawlbruleeError)
      expect(err).not.toBeInstanceOf(ValidationError)
      const e = err as CrawlbruleeError
      expect(e.errorName).toBe('scrape_error')
      expect(e.status).toBe(500)
    }
  })

  it('throws TransportError for non-JSON error bodies', async () => {
    const q = createFetchQueue()
    q.enqueue(textResponse('<html>500 Internal Server Error</html>', 500))
    const client = buildClient(q.fetch)

    await expect(client.scrape({ url: 'https://example.com' })).rejects.toBeInstanceOf(
      TransportError
    )
  })

  it('throws TransportError when fetch itself rejects', async () => {
    const q = createFetchQueue()
    q.mock.mockImplementationOnce(async () => {
      throw new TypeError('network down')
    })
    const client = buildClient(q.fetch)

    await expect(client.scrape({ url: 'https://example.com' })).rejects.toBeInstanceOf(
      TransportError
    )
  })

  it('isCrawlbruleeError narrows correctly', () => {
    const err = new RateLimitError('x', { status: 429 })
    expect(isCrawlbruleeError(err)).toBe(true)
    expect(isCrawlbruleeError(new Error('plain'))).toBe(false)
  })
})
