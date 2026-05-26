import { vi, type Mock } from 'vitest'

import { Crawlbrulee, type CrawlbruleeOptions } from '../src/index.js'
import { CwblInstrumentation } from '../src/instrumentation.js'

/**
 * Build a mock `fetch` whose returned `Response`s are queued via `enqueue()`.
 * Each call to the mock pops one queued response (or throws if the queue is
 * empty), making "expect N HTTP calls, each returning X" tests easy to write.
 */
export function createFetchQueue() {
  const queue: Array<() => Response | Promise<Response>> = []

  const fetchMock: Mock = vi.fn(async (..._args: unknown[]) => {
    const next = queue.shift()
    if (!next) {
      throw new Error(`fetch was called with no queued response: ${String(_args[0])}`)
    }
    return next()
  })

  return {
    fetch: fetchMock as unknown as typeof fetch,
    mock: fetchMock,
    /** Queue a single response (or a thunk that builds one). */
    enqueue(response: Response | (() => Response | Promise<Response>)) {
      queue.push(typeof response === 'function' ? response : () => response)
    },
    queuedCount() {
      return queue.length
    },
  }
}

/** Convenience: build a `Response` from a JSON value with the given status. */
export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

/** Convenience: build a non-JSON `Response` (e.g. an HTML error page). */
export function textResponse(
  body: string,
  status = 500,
  headers: Record<string, string> = {}
): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain', ...headers },
  })
}

/**
 * Test base URL used by the spy on `CwblInstrumentation.getBaseUrl()` inside
 * {@link buildClient}. Real test bodies assert against this hostname.
 */
export const TEST_BASE_URL = 'https://api.test.example'

/**
 * Build a {@link Crawlbrulee} wired up to a mock fetch and the test base URL
 * by stubbing `CwblInstrumentation.getFetch()` + `getBaseUrl()`. Both stubs
 * are restored automatically between tests via vitest's `restoreMocks: true`
 * config.
 */
export function buildClient(
  fetchImpl: typeof fetch,
  overrides: Partial<Omit<CrawlbruleeOptions, 'apiKey'>> & { baseUrl?: string } = {}
) {
  const { baseUrl = TEST_BASE_URL, ...rest } = overrides
  vi.spyOn(CwblInstrumentation, 'getFetch').mockReturnValue(fetchImpl)
  vi.spyOn(CwblInstrumentation, 'getBaseUrl').mockReturnValue(baseUrl)
  return new Crawlbrulee({ apiKey: 'cble_test_key', ...rest })
}

/** Pull out the URL + RequestInit of a single recorded fetch call. */
export function lastCallOf(mock: Mock): { url: string; init: RequestInit } {
  const call = mock.mock.calls.at(-1)
  if (!call) throw new Error('fetch was never called')
  const [url, init] = call as [string, RequestInit]
  return { url, init }
}
