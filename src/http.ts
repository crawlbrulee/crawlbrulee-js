import { USER_AGENT } from './config.js'
import { TransportError, createApiError, type CrawlbruleeError } from './errors.js'
import { CwblInstrumentation, type FetchLike } from './instrumentation.js'
import type { ApiErrorResponse } from './types/common.js'

/** HTTP methods used by the SDK. */
export type HttpMethod = 'GET' | 'POST'

/** Options the SDK accepts at construction time for the HTTP layer. */
export interface HttpClientOptions {
  /** Base URL of the API (trailing slash is stripped). */
  baseUrl: string
  /** API key sent as `Authorization: Bearer <key>`. */
  apiKey: string
  /**
   * Per-request timeout in milliseconds. Pass `0` (or omit) to disable the
   * timeout entirely.
   */
  timeoutMs?: number
}

/** Per-call overrides accepted on every resource method. */
export interface RequestOptions {
  /** Abort the request when this signal fires. Composable with the timeout. */
  signal?: AbortSignal
  /**
   * Override the constructor-level `timeoutMs` for this call. Pass `0` to
   * disable the timeout for this call.
   */
  timeoutMs?: number
}

interface SendArgs extends RequestOptions {
  method: HttpMethod
  path: string
  body?: unknown
}

interface ComposedSignal {
  signal: AbortSignal | undefined
  /** Returns `true` if the abort was triggered by the per-request timeout. */
  timedOut: () => boolean
  /** Releases the timer and any listeners attached to the caller's signal. */
  cleanup: () => void
}

/**
 * Minimal `fetch`-based HTTP layer used by {@link Crawlbrulee}. Handles:
 *
 * - URL composition (joining `baseUrl` and path safely).
 * - JSON serialization and parsing.
 * - The `Authorization: Bearer …` header.
 * - Composing the caller's `AbortSignal` with an internal timeout signal. The
 *   timeout covers the WHOLE request, including the response body read — not
 *   just the time-to-headers.
 * - Mapping non-2xx responses to typed `CrawlbruleeError` subclasses via
 *   {@link createApiError}.
 *
 * The `fetch` implementation is sourced from {@link CwblInstrumentation} at
 * construction time so tests can stub the module.
 */
export class HttpClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetch: FetchLike
  private readonly timeoutMs: number

  constructor(options: HttpClientOptions) {
    this.baseUrl = stripTrailingSlash(options.baseUrl)
    this.apiKey = options.apiKey
    this.fetch = CwblInstrumentation.getFetch()
    this.timeoutMs = options.timeoutMs ?? 0
  }

  /** Send a `GET` request and parse the response as `T`. */
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.send<T>({ method: 'GET', path, ...options })
  }

  /** Send a `POST` request with a JSON body and parse the response as `T`. */
  post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this.send<T>({ method: 'POST', path, body, ...options })
  }

  private async send<T>(args: SendArgs): Promise<T> {
    const url = this.buildUrl(args.path)
    const headers = this.buildHeaders(args)
    const body = args.body === undefined ? undefined : JSON.stringify(args.body)
    const composed = this.composeSignal(args.signal, args.timeoutMs)

    try {
      let res: Response
      try {
        res = await this.fetch(url, {
          method: args.method,
          headers,
          body,
          signal: composed.signal,
        })
      } catch (cause: unknown) {
        throw abortOrNetworkError(cause, composed.timedOut(), args.timeoutMs ?? this.timeoutMs)
      }

      let text: string
      try {
        text = await res.text()
      } catch (cause: unknown) {
        if (isAbortError(cause)) {
          throw abortOrNetworkError(cause, composed.timedOut(), args.timeoutMs ?? this.timeoutMs)
        }
        throw new TransportError(`Failed to read response body (status ${res.status}).`, {
          status: res.status,
          cause,
        })
      }

      const parsed = parseJsonOrThrow(text, res.status)
      if (!res.ok) throw toApiError(parsed, res.status, text)
      return parsed as T
    } finally {
      composed.cleanup()
    }
  }

  private buildUrl(path: string): string {
    if (!path.startsWith('/')) {
      throw new TypeError(`crawlbrulee SDK: path must start with '/' (received '${path}')`)
    }
    return `${this.baseUrl}${path}`
  }

  private buildHeaders(args: SendArgs): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': USER_AGENT,
      authorization: `Bearer ${this.apiKey}`,
    }
    if (args.body !== undefined) headers['content-type'] = 'application/json'
    return headers
  }

  /**
   * Build a single `AbortSignal` that fires when either the caller-supplied
   * signal aborts OR the per-request timeout elapses. The returned `cleanup`
   * callback MUST be invoked on every exit path so we don't leak timers or
   * dead listeners on long-lived caller signals.
   */
  private composeSignal(
    callerSignal: AbortSignal | undefined,
    overrideTimeoutMs: number | undefined
  ): ComposedSignal {
    const timeoutMs = overrideTimeoutMs ?? this.timeoutMs
    const hasTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0

    if (!hasTimeout && !callerSignal) {
      return { signal: undefined, timedOut: () => false, cleanup: () => {} }
    }

    if (!hasTimeout) {
      return { signal: callerSignal, timedOut: () => false, cleanup: () => {} }
    }

    const controller = new AbortController()
    let didTimeout = false
    const timer = setTimeout(() => {
      didTimeout = true
      controller.abort(new Error('request_timeout'))
    }, timeoutMs)

    let onCallerAbort: (() => void) | undefined
    if (callerSignal) {
      if (callerSignal.aborted) {
        clearTimeout(timer)
        controller.abort(callerSignal.reason)
      } else {
        onCallerAbort = () => {
          clearTimeout(timer)
          controller.abort(callerSignal.reason)
        }
        callerSignal.addEventListener('abort', onCallerAbort, { once: true })
      }
    }

    const cleanup = () => {
      clearTimeout(timer)
      if (onCallerAbort && callerSignal) {
        callerSignal.removeEventListener('abort', onCallerAbort)
      }
    }

    return { signal: controller.signal, timedOut: () => didTimeout, cleanup }
  }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

function abortOrNetworkError(cause: unknown, timedOut: boolean, timeoutMs: number): TransportError {
  if (isAbortError(cause)) {
    if (timedOut) {
      return new TransportError(`Request timed out after ${timeoutMs}ms.`, {
        errorName: 'request_timeout',
        cause,
      })
    }
    return new TransportError('Request aborted by caller.', {
      errorName: 'client_closed_request',
      cause,
    })
  }
  return new TransportError(formatNetworkErrorMessage(cause), { cause })
}

function formatNetworkErrorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return `Network error: ${cause.message}`
  }
  return 'Network error: unknown failure while sending the request.'
}

function parseJsonOrThrow(text: string, status: number): unknown {
  if (text === '') return {}
  try {
    return JSON.parse(text)
  } catch (cause: unknown) {
    const preview = text.length > 200 ? `${text.slice(0, 200)}…` : text
    throw new TransportError(`Unexpected non-JSON response (status ${status}): ${preview}`, {
      status,
      cause,
    })
  }
}

function toApiError(parsed: unknown, status: number, rawText: string): CrawlbruleeError {
  if (isApiErrorResponse(parsed)) {
    return createApiError(parsed, status)
  }
  const preview = rawText.length > 200 ? `${rawText.slice(0, 200)}…` : rawText
  return new TransportError(`HTTP ${status}: ${preview || '(empty body)'}`, { status })
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.name === 'string' && typeof v.message === 'string'
}
