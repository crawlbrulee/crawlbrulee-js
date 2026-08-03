/**
 * Shared primitive types used across crawlbrulee request and response shapes.
 */

/**
 * Proxy tier used to route the fetch.
 *
 * - `basic` — datacenter proxy, lowest cost.
 * - `advanced` — residential proxy, higher success rate on protected sites.
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
 * Usage accounting for a single billable operation, returned on the response
 * envelope of scrape, map, and async-status (when terminal). All crawlbrulee
 * responses report this on `response_meta.usage`.
 */
export interface Usage {
  /**
   * Credits charged for this operation. `0` on a fully cached result — only
   * parts we still had to compute fresh (e.g. a newly produced
   * screenshot-slice variant) are charged.
   */
  credits: number
  /** The proxy tier the server resolved and used (never `auto`). */
  proxy: ResolvedProxyTier
  /** Whether the result was served from cache. */
  cache_hit: boolean
}

/**
 * Response envelope `response_meta` carried by scrape responses and async-status
 * responses (terminal state only). Currently exposes {@link Usage}; map
 * responses extend this shape with `pagination` + `truncation`.
 */
export interface ResponseMeta {
  /** Usage accounting for the operation. */
  usage: Usage
}

/** Screenshot capture mode: visible viewport or the full scrollable page. */
export type ScreenshotType = 'viewport' | 'full_page'

/** Emulated device class for the viewport (drives default width/height). */
export type ScreenshotDeviceMode = 'desktop' | 'mobile'

/** Pre-capture cleanup options applied to the page before the screenshot. */
export interface ScreenshotCleanup {
  /**
   * Remove ads, cookie banners, and popups before capturing. Defaults to
   * `true` server-side.
   */
  ads_and_popups?: boolean
}

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
   * must be in `[1, 4]`. Defaults to 1 server-side.
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
  /** Page cleanup applied before capture. */
  cleanup?: ScreenshotCleanup
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
  | 'too_many_requests'
  | 'unsupported_content'
  | 'unsupported_screenshot_output'
  | 'validation_error'
  | 'antibot_blocked'

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
