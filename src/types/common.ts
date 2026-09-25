/**
 * Shared primitive types used across crawlbrulee request and response shapes.
 */

/**
 * Proxy tier used to route the fetch.
 *
 * - `basic` — datacenter proxy, lowest cost.
 * - `advanced` — enhanced proxy tier with a higher success rate.
 * - `auto` — start at the basic tier and escalate to advanced on failure;
 *   billed at the delivered tier. This is the default when `proxy` is omitted.
 */
export type ProxyTier = 'basic' | 'advanced' | 'auto'

/**
 * Proxy tier the server actually used to route a fetch, as reported back in
 * {@link Usage.proxy}. Unlike the request-side {@link ProxyTier}, this never
 * includes `auto` — when a request asks for `auto`, the server resolves it to a
 * concrete tier and echoes the resolved value here.
 */
export type ResolvedProxyTier = 'basic' | 'advanced'

/**
 * Engine base the operation was billed at. This reflects what the server
 * delivered, not what the request asked for. `cache` identifies a cache hit.
 */
export type BillingEngine = 'http' | 'browser' | 'screenshot' | 'cache'

/**
 * Usage accounting for a single scrape, returned on `response_meta.usage` of
 * scrape and async-status (when terminal) responses, and on completion
 * webhooks.
 *
 * The response explains its own price:
 * `total_credit_cost = engine_credit_cost × proxy_multiplier + screenshot_slicing_credit_cost`.
 *
 * The four `*_credit_cost` / `proxy_multiplier` fields are optional in this
 * type because older api versions do not send them. When you read the total,
 * fall back to the deprecated name: `usage.total_credit_cost ?? usage.credits`.
 */
export interface Usage {
  /**
   * Credits charged for this request. Always equals
   * `engine_credit_cost × proxy_multiplier + screenshot_slicing_credit_cost`.
   * `0` when nothing is billed: a cache hit, or a page whose status is not
   * billed (see `page_status_code` on the scrape result).
   *
   * Optional only because older api versions do not send it; fall back to
   * {@link credits} when it is missing.
   */
  total_credit_cost?: number
  /**
   * The engine base charged, before the proxy multiplier: `1` for `http`, `3`
   * for `browser`, `5` for `screenshot`, `0` for `cache`. Also `0` when the
   * page is not billed.
   */
  engine_credit_cost?: number
  /**
   * The multiplier of the proxy tier the request ran on: `1` for `basic`, `5`
   * for `advanced`. Always reported, even when the engine cost is `0`.
   */
  proxy_multiplier?: number
  /**
   * The screenshot slicing add-on: `1` when the screenshot was split into
   * slices on this request (a flat +1 credit outside the proxy multiplier,
   * however many slices it made), otherwise `0`.
   */
  screenshot_slicing_credit_cost?: number
  /**
   * Engine the delivered result was billed at: `http`, `browser`,
   * `screenshot`, or `cache` (served from cache).
   */
  engine: BillingEngine
  /**
   * The proxy tier the server resolved and used (never `auto`). `advanced`
   * multiplies the engine base by 5.
   */
  proxy: ResolvedProxyTier
  /**
   * Credits charged for this request. Same value as {@link total_credit_cost}.
   *
   * @deprecated Use {@link total_credit_cost}, which always has the same value.
   * This field will be removed in a future version.
   */
  credits: number
  /**
   * Screenshot slicing add-on: `1` when slices were made on this request,
   * otherwise `0`. Same value as {@link screenshot_slicing_credit_cost}.
   *
   * @deprecated Use {@link screenshot_slicing_credit_cost}, which always has
   * the same value. Despite its name this is a 0/1 charge, not a count of
   * slices. This field will be removed in a future version.
   */
  screenshot_slices: number
}

/**
 * Response envelope `response_meta` carried by scrape responses and async-status
 * responses (terminal state only). Map responses use a narrower usage shape.
 */
export interface ResponseMeta {
  /** Usage accounting for the operation. */
  usage: Usage
}

/** Screenshot capture mode: visible viewport or the full scrollable page. */
export type ScreenshotType = 'viewport' | 'full_page'

/** Emulated device class for the viewport (drives default width/height). */
export type ScreenshotDeviceMode = 'desktop' | 'mobile'

/** A `wait` action: pause for `ms` milliseconds before the next step. */
export interface ScreenshotWaitAction {
  type: 'wait'
  /** Milliseconds to wait. Must be a non-negative integer. */
  ms: number
}

/** A `scroll` action: scroll the page by `pixels` (positive = down). */
export interface ScreenshotScrollAction {
  type: 'scroll'
  /** Pixels to scroll. Positive scrolls down, negative scrolls up. */
  pixels: number
}

/**
 * Actions performed before the screenshot is taken. The server caps the total
 * wait time (~20 s) and total absolute scroll distance (~50 000 px) across
 * the array; at most 5 actions are accepted.
 */
export type ScreenshotBeforeAction = ScreenshotWaitAction | ScreenshotScrollAction

/**
 * Action performed after the screenshot is taken. Currently only `slice` is
 * supported — it cuts the screenshot into horizontal tiles of `height` px.
 */
export interface ScreenshotSliceAction {
  type: 'slice'
  /** Tile height in pixels. Minimum 500. */
  height: number
}

export type ScreenshotAfterAction = ScreenshotSliceAction

/** Custom browser viewport dimensions used during a screenshot capture. */
export interface ScreenshotViewport {
  /** Viewport width in pixels. Integer in `[16, 10000]`; out-of-range values are rejected with a 400. */
  width: number
  /** Viewport height in pixels. Integer in `[16, 10000]`; out-of-range values are rejected with a 400. */
  height: number
  /**
   * Device pixel ratio (e.g. 2 for retina). Fractional values are allowed;
   * must be in `[1, 3]`. Defaults to 1 server-side.
   */
  device_scale_factor?: number
}

/** Screenshot capture configuration. Pass this on `extract.screenshot`. */
export interface ScreenshotRequest {
  /** Capture mode: `viewport` (visible only) or `full_page`. */
  type: ScreenshotType
  /** Custom viewport. If omitted, the `device_mode` defaults are used. */
  viewport?: ScreenshotViewport
  /** Emulate desktop or mobile. Defaults to `desktop`. */
  device_mode?: ScreenshotDeviceMode
  /** Pre-capture actions (waits and scrolls). Maximum 5 entries. */
  actions_before?: ScreenshotBeforeAction[]
  /** Post-capture actions (e.g. slice into tiles). Maximum 1 entry. */
  actions_after?: ScreenshotAfterAction[]
}

/**
 * Machine-readable error names returned by the crawlbrulee API. Stable
 * identifiers — clients can switch on them.
 */
export type ApiErrorName =
  | 'usage_allocation_error'
  | 'request_timeout'
  | 'invalid_url'
  | 'url_too_long'
  | 'client_closed_request'
  | 'reset_password_token_expired'
  | 'user_not_found'
  | 'unsupported_url_schema'
  | 'url_credentials_not_supported'
  | 'blocked_url'
  | 'scrape_error'
  | 'job_failed'
  | 'incorrect_login_method_used'
  | 'not_found'
  | 'invalid_credentials'
  | 'resource_already_exists'
  | 'access_denied'
  | 'internal_server_error'
  | 'service_unavailable'
  | 'too_many_requests'
  | 'unsupported_content'
  | 'unsupported_screenshot_output'
  | 'validation_error'
  | 'antibot_blocked'
  | 'too_many_redirects'
  | 'page_too_large'
  | 'target_unreachable'

/** Reason a usage allocation was denied (when `error_name = usage_allocation_error`). */
export type UsageAllocationReason =
  | 'credit_limit'
  | 'concurrency_limit'
  | 'duplicate_reservation'
  | 'internal_error'

/** Snapshot of the org's current usage at the moment the error was raised. */
export interface UsageLimitDetails {
  /** Current credit usage in the billing period. */
  current_usage?: number
  /** Credits currently reserved by in-flight jobs. */
  current_reserved?: number
  /** Maximum credits allowed in the billing period. */
  max_credits?: number
  /** Number of currently running concurrent jobs. */
  current_concurrent?: number
  /** Maximum concurrent jobs allowed. */
  max_concurrent?: number
}

/** Discriminated detail for `error_name = usage_allocation_error`. */
export interface UsageAllocationErrorDetails {
  error_name: 'usage_allocation_error'
  reason: UsageAllocationReason
  details?: UsageLimitDetails
}

/** Discriminated detail for `error_name = too_many_requests`. */
export interface RateLimitErrorDetails {
  error_name: 'too_many_requests'
  /** Suggested wait time before retrying. */
  retry_after_ms?: number
  /** Which rate limit was exceeded (e.g. `org`, `ip`). */
  limited_by?: string
}

/** Union of all known `details` payloads on an `ApiErrorResponse`. */
export type ApiErrorDetails = UsageAllocationErrorDetails | RateLimitErrorDetails

/** Standard JSON error shape returned for any non-2xx response. */
export interface ApiErrorResponse {
  /** Machine-readable identifier — safe to switch on. */
  name: ApiErrorName
  /** Human-readable error message. */
  message: string
  /** Error-specific structured detail; only present for some `name`s. */
  details?: ApiErrorDetails
}
