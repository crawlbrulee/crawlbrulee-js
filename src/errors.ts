import type {
  ApiErrorDetails,
  ApiErrorName,
  ApiErrorResponse,
  RateLimitErrorDetails,
  UsageAllocationErrorDetails,
} from './types/common.js'

/**
 * Base error class for every failure raised by the SDK.
 *
 * Two kinds of failures end up here:
 *
 * 1. **API errors** — the server returned a non-2xx response with a well-formed
 *    JSON body. In that case `status`, `errorName` and (sometimes) `details`
 *    are populated.
 * 2. **Transport errors** — the request never produced a structured response
 *    (network failure, abort, timeout, non-JSON body, etc.). In that case
 *    `status` may be `0` and `errorName` is one of the synthetic transport
 *    names (`request_timeout`, `client_closed_request`) or `null`.
 *
 * Typed subclasses are exported for the most common cases. To branch on more
 * specific server-side errors, switch on `err.errorName` or use the
 * {@link isCrawlbruleeError} helper.
 */
export class CrawlbruleeError extends Error {
  /** HTTP status code; `0` for transport-level failures with no response. */
  readonly status: number
  /** The `name` field from the API error body, or `null` for transport errors. */
  readonly errorName: ApiErrorName | null
  /** Structured detail block from the API error body, if any. */
  readonly details?: ApiErrorDetails
  /** The original parsed error body, when one was received. */
  readonly response?: ApiErrorResponse

  constructor(
    message: string,
    options: {
      status: number
      errorName: ApiErrorName | null
      details?: ApiErrorDetails
      response?: ApiErrorResponse
      cause?: unknown
    }
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'CrawlbruleeError'
    this.status = options.status
    this.errorName = options.errorName
    this.details = options.details
    this.response = options.response
  }
}

/**
 * Raised when the API rejects your credentials — a missing, invalid, or
 * unauthorized API key (`invalid_credentials`, `access_denied`).
 *
 * Not every 403 is a key problem: a 403 carrying `antibot_blocked` is the
 * *target site* blocking us and raises {@link AntibotBlockedError} instead.
 * Only an unrecognized 403 name falls back to this class.
 */
export class AuthenticationError extends CrawlbruleeError {
  constructor(
    message: string,
    options: { status: number; errorName: ApiErrorName; response?: ApiErrorResponse }
  ) {
    super(message, options)
    this.name = 'AuthenticationError'
  }
}

/**
 * Raised when the target site's anti-bot protection blocked the request
 * (HTTP 403, `antibot_blocked`). Not an API-key problem — retrying the same
 * tier rarely helps; try a higher proxy tier or skip the site.
 */
export class AntibotBlockedError extends CrawlbruleeError {
  constructor(
    message: string,
    options: { status: number; errorName: ApiErrorName; response?: ApiErrorResponse }
  ) {
    super(message, options)
    this.name = 'AntibotBlockedError'
  }
}

/**
 * Raised when the target site redirected the request in a loop, or through
 * more hops than the API follows (HTTP 422, `too_many_redirects`). Like
 * {@link AntibotBlockedError} this is the target's doing — not a key problem
 * and not a bad request — so it is neither an `AuthenticationError` nor a
 * `ValidationError`. Retrying rarely helps. Returned by both `scrape` and `map`.
 */
export class TooManyRedirectsError extends CrawlbruleeError {
  constructor(
    message: string,
    options: { status: number; errorName: ApiErrorName; response?: ApiErrorResponse }
  ) {
    super(message, options)
    this.name = 'TooManyRedirectsError'
  }
}

/**
 * Raised when the page's HTML was too large to process (HTTP 422,
 * `page_too_large`). Like {@link TooManyRedirectsError} this is about the page,
 * not your request — so it is neither an `AuthenticationError` nor a
 * `ValidationError`. It is terminal: the same URL fails the same way, so do not
 * retry it. Returned by `scrape`.
 */
export class PageTooLargeError extends CrawlbruleeError {
  constructor(
    message: string,
    options: { status: number; errorName: ApiErrorName; response?: ApiErrorResponse }
  ) {
    super(message, options)
    this.name = 'PageTooLargeError'
  }
}

/**
 * Raised for HTTP 429 responses. When the server included a `retry_after_ms`
 * hint in `details` it is surfaced directly on the instance.
 *
 * `errorName` is always the literal `'too_many_requests'` — the SDK normalizes
 * this even when the server returns a 429 with a different `name` field. The
 * original body is still available on `response`.
 */
export class RateLimitError extends CrawlbruleeError {
  override readonly errorName: 'too_many_requests'
  /** Suggested delay (ms) before retrying, when the server provided one. */
  readonly retryAfterMs?: number
  /** Which rate limit was tripped (e.g. `org`, `ip`), when provided. */
  readonly limitedBy?: string

  constructor(
    message: string,
    options: {
      status: number
      details?: RateLimitErrorDetails
      response?: ApiErrorResponse
    }
  ) {
    super(message, { ...options, errorName: 'too_many_requests', details: options.details })
    this.name = 'RateLimitError'
    this.errorName = 'too_many_requests'
    this.retryAfterMs = options.details?.retry_after_ms
    this.limitedBy = options.details?.limited_by
  }
}

/**
 * Raised when the API rejects a request because the org's plan limits would
 * be exceeded (credit limit, concurrency cap, overage hard cap, etc.).
 *
 * `errorName` is always the literal `'usage_allocation_error'`.
 */
export class UsageAllocationError extends CrawlbruleeError {
  override readonly errorName: 'usage_allocation_error'
  /** Specific reason the allocation was denied. */
  readonly reason: UsageAllocationErrorDetails['reason']
  /** Current usage / limit snapshot at the time of the rejection. */
  readonly usage?: UsageAllocationErrorDetails['details']

  constructor(
    message: string,
    options: {
      status: number
      details: UsageAllocationErrorDetails
      response?: ApiErrorResponse
    }
  ) {
    super(message, { ...options, errorName: 'usage_allocation_error' })
    this.name = 'UsageAllocationError'
    this.errorName = 'usage_allocation_error'
    this.reason = options.details.reason
    this.usage = options.details.details
  }
}

/** Raised for 4xx responses caused by an invalid request shape or arguments. */
export class ValidationError extends CrawlbruleeError {
  constructor(
    message: string,
    options: { status: number; errorName: ApiErrorName; response?: ApiErrorResponse }
  ) {
    super(message, options)
    this.name = 'ValidationError'
  }
}

/** Raised for 404 responses (e.g. unknown async job ID). */
export class NotFoundError extends CrawlbruleeError {
  constructor(
    message: string,
    options: { status: number; errorName: ApiErrorName; response?: ApiErrorResponse }
  ) {
    super(message, options)
    this.name = 'NotFoundError'
  }
}

/**
 * Raised for 503 responses — the API could not serve the request right now
 * (a transient infrastructure failure, not a problem with your request).
 *
 * This is **retryable**: back off and try again. In particular it is not an
 * authentication failure, so it is never a reason to rotate your API key —
 * a genuinely bad or expired key still comes back as a 401
 * (`invalid_credentials`) and raises {@link AuthenticationError}.
 */
export class ServiceUnavailableError extends CrawlbruleeError {
  constructor(
    message: string,
    options: { status: number; errorName: ApiErrorName; response?: ApiErrorResponse }
  ) {
    super(message, options)
    this.name = 'ServiceUnavailableError'
  }
}

/**
 * Raised when a request cannot be sent or no structured response is parsed.
 *
 * The `errorName` discriminates the cause:
 * - `'request_timeout'` — the per-request timeout fired.
 * - `'client_closed_request'` — the caller's `AbortSignal` fired.
 * - `null` — generic transport failure (network error, non-JSON body, etc.).
 */
export class TransportError extends CrawlbruleeError {
  constructor(
    message: string,
    options: {
      status?: number
      errorName?: 'request_timeout' | 'client_closed_request' | null
      cause?: unknown
    } = {}
  ) {
    super(message, {
      status: options.status ?? 0,
      errorName: options.errorName ?? null,
      cause: options.cause,
    })
    this.name = 'TransportError'
  }
}

/** Narrow `unknown` to the SDK's base error type. */
export function isCrawlbruleeError(err: unknown): err is CrawlbruleeError {
  return err instanceof CrawlbruleeError
}

/**
 * Map an API error body + HTTP status to the most specific error class.
 *
 * Dispatch is **name-first**: the body's `name` field is the most reliable
 * signal of what went wrong. Status code is used only as a fallback when the
 * name is unrecognized (e.g. a CDN-synthesized error). This avoids
 * miscategorizing things like a 403 with `name: 'not_found'` as an auth error.
 *
 * Internal — used by the HTTP layer.
 */
export function createApiError(body: ApiErrorResponse, status: number): CrawlbruleeError {
  const { name, message, details } = body
  const response = body

  switch (name) {
    case 'too_many_requests':
      return new RateLimitError(message, {
        status,
        details: details?.error_name === 'too_many_requests' ? details : undefined,
        response,
      })

    case 'usage_allocation_error': {
      // Without a structured details block we still want a typed error — fall
      // back to a synthetic `internal_error` reason so callers can branch.
      const usageDetails: UsageAllocationErrorDetails =
        details?.error_name === 'usage_allocation_error'
          ? details
          : { error_name: 'usage_allocation_error', reason: 'internal_error' }
      return new UsageAllocationError(message, { status, details: usageDetails, response })
    }

    case 'antibot_blocked':
      return new AntibotBlockedError(message, { status, errorName: name, response })

    case 'too_many_redirects':
      return new TooManyRedirectsError(message, { status, errorName: name, response })

    case 'page_too_large':
      return new PageTooLargeError(message, { status, errorName: name, response })

    case 'invalid_credentials':
    case 'access_denied':
      return new AuthenticationError(message, { status, errorName: name, response })

    case 'not_found':
      return new NotFoundError(message, { status, errorName: name, response })

    case 'service_unavailable':
      return new ServiceUnavailableError(message, { status, errorName: name, response })

    case 'validation_error':
    case 'invalid_url':
    case 'url_too_long':
    case 'unsupported_url_schema':
    case 'url_credentials_not_supported':
    case 'blocked_url':
    case 'unsupported_content':
    case 'unsupported_screenshot_output':
      return new ValidationError(message, { status, errorName: name, response })
  }

  // Name was not specific enough — fall back to status-based heuristics, but
  // never override what the name said. A 429 with an unrecognized name still
  // promotes to RateLimitError (the class invariant normalizes errorName).
  if (status === 429) {
    return new RateLimitError(message, { status, response })
  }
  if (status === 401 || status === 403) {
    return new AuthenticationError(message, { status, errorName: name, response })
  }
  if (status === 404) {
    return new NotFoundError(message, { status, errorName: name, response })
  }
  if (status === 503) {
    return new ServiceUnavailableError(message, { status, errorName: name, response })
  }

  return new CrawlbruleeError(message, { status, errorName: name, details, response })
}
