import { describe, expect, it, vi } from 'vitest'

import { TransportError } from '../src/index.js'
import { HttpClient } from '../src/http.js'
import { CwblInstrumentation } from '../src/instrumentation.js'

import { createFetchQueue, jsonResponse } from './helpers.js'

function buildHttp(fetchImpl: typeof fetch, opts: { timeoutMs?: number } = {}) {
  vi.spyOn(CwblInstrumentation, 'getFetch').mockReturnValue(fetchImpl)
  return new HttpClient({
    baseUrl: 'https://api.test.example',
    apiKey: 'k',
    timeoutMs: opts.timeoutMs,
  })
}

describe('HttpClient — path validation', () => {
  it('rejects paths that do not start with a slash', async () => {
    const q = createFetchQueue()
    const http = buildHttp(q.fetch)
    await expect(http.get('api/whoami')).rejects.toBeInstanceOf(TypeError)
  })
})

describe('HttpClient — timeout', () => {
  it('aborts the request when timeoutMs is exceeded', async () => {
    const slowFetch: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortErr = new Error('aborted')
          abortErr.name = 'AbortError'
          reject(abortErr)
        })
      })
    const http = buildHttp(slowFetch, { timeoutMs: 10 })

    await expect(http.get('/api/whoami')).rejects.toBeInstanceOf(TransportError)
  })

  it('honors a per-call timeoutMs override of 0 (disables timeout)', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ ok: true }))
    const http = buildHttp(q.fetch, { timeoutMs: 1 })

    await expect(http.get('/api/whoami', { timeoutMs: 0 })).resolves.toEqual({ ok: true })
  })
})

describe('HttpClient — empty success body', () => {
  it('treats an empty 2xx body as {}', async () => {
    const q = createFetchQueue()
    q.enqueue(new Response('', { status: 200 }))
    const http = buildHttp(q.fetch)

    await expect(http.get('/public/health')).resolves.toEqual({})
  })
})
