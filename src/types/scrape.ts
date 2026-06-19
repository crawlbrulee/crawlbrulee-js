import type { ProxyTier, ResponseMeta, ScreenshotRequest, ScreenshotType } from './common.js'

/**
 * Which content formats to extract from the scraped page. Every field is
 * optional; the server defaults are noted on each field. The default request
 * extracts `{ metadata: true, cleaned_html: true }`.
 */
export interface ScrapeExtract {
  /** Extract page metadata (title, description, OG/Twitter tags, etc.). Default `true`. */
  metadata?: boolean
  /** Extract cleaned HTML (main content only). Default `true`. */
  cleaned_html?: boolean
  /** Extract the page as clean Markdown. Default `false`. */
  markdown?: boolean
  /** Return the raw, unprocessed HTML. Default `false`. */
  raw_html?: boolean
  /** Extract all links found on the page. Default `false`. */
  links?: boolean
  /** Extract all inline images found on the page. Default `false`. */
  images?: boolean
  /** Capture a screenshot. Omit to skip; set to a `ScreenshotRequest` to enable. */
  screenshot?: ScreenshotRequest
}

/** Cache settings for a scrape request. */
export interface ScrapeCache {
  /**
   * Maximum cache age. Either a number of seconds (non-negative integer) or
   * an ISO-8601 datetime cutoff — cached entries older than this are skipped.
   * Defaults to 2 days when omitted.
   */
  max_age?: number | string
  /**
   * Treat URLs with different query parameters as the same cache entry.
   * Defaults to `false`.
   */
  ignore_query_params?: boolean
}

/** Optional locale + country emulation for the scrape. */
export interface ScrapeLocation {
  /**
   * BCP-47 locale (e.g. `en-US`, `de-DE`, `pt-BR`). Sent as `Accept-Language`
   * and reflected in `navigator.language` when JS rendering is requested.
   */
  locale?: string
  /**
   * ISO 3166-1 alpha-2 country code (e.g. `US`, `DE`, `BR`). Drives the
   * emulated browser timezone. Case-insensitive.
   */
  country?: string
}

/** Request body for `POST /api/scrape` (and `POST /api/scrape/async`). */
export interface ScrapeRequest {
  /** The URL to scrape. */
  url: string
  /** Which content formats to extract. Defaults to `metadata + cleaned_html`. */
  extract?: ScrapeExtract
  /** Cache settings for this request. */
  cache?: ScrapeCache
  /**
   * Use a headless browser to render JavaScript before scraping. Adds latency
   * and credits — only enable when the page requires it. Default `false`.
   */
  require_js?: boolean
  /** CSS selectors to strip from the extracted content. */
  exclude_selectors?: string[]
  /** Proxy tier to use for fetching. Defaults to `basic`. */
  proxy?: ProxyTier
  /** Optional locale + country emulation. */
  location?: ScrapeLocation
}

/**
 * Per-job completion webhook, attached when submitting an ASYNC scrape via
 * {@link Crawlbrulee.scrapeAsync}. Async-only: the synchronous `scrape()`
 * response IS the notification, so {@link ScrapeRequest} deliberately omits
 * this field and the sync `/api/scrape` endpoint rejects it.
 *
 * Configure the signing secret used for deliveries in the dashboard
 * (Account → Webhooks) — there is no per-request secret.
 */
export interface AsyncScrapeWebhook {
  /**
   * Endpoint that receives a single signed `POST` when the job reaches a
   * terminal state. Must be an `http`/`https` URL (HTTPS is required in
   * production) of at most 2048 characters. The body is a
   * `scrape.complete` envelope signed with your organization webhook secret
   * on the `X-Cwbl-Signature` header — verify it with `verifyWebhookSignature`.
   */
  url: string
  /**
   * Opaque correlation object echoed verbatim in the webhook payload's
   * `data.metadata`. Must serialize to at most 2048 bytes (UTF-8 JSON). Use it
   * to route deliveries without keeping your own `job_id` mapping.
   */
  metadata?: Record<string, unknown>
}

/**
 * Request body for `POST /api/scrape/async`: a {@link ScrapeRequest} plus an
 * optional per-job completion {@link AsyncScrapeWebhook}. The `webhook` field
 * is async-only and is not accepted by the synchronous `scrape()` endpoint.
 */
export interface AsyncScrapeRequest extends ScrapeRequest {
  /** Optional completion webhook delivered when this job finishes. */
  webhook?: AsyncScrapeWebhook
}

/** Viewport metadata returned alongside a captured screenshot. */
export interface ScreenshotViewportInfo {
  width: number
  height: number
  device_scale_factor: number
}

/** Image-level properties of a captured screenshot (or tile). */
export interface ScreenshotProperties {
  /** File name of the image asset. */
  file_name: string
  /** MIME type (e.g. `image/png`). */
  mime: string
  /** Image width in pixels. */
  width: number
  /** Image height in pixels. */
  height: number
  /** Viewport dimensions used during capture. */
  viewport: ScreenshotViewportInfo
}

/** One horizontal tile of a sliced full-page screenshot. */
export interface ScreenshotSlice {
  /** 0-based row index of this slice. */
  row_nr: number
  /** Signed URL to download this slice image. */
  url: string
  type: 'slice'
  /** Image-level properties of this slice. */
  properties: ScreenshotProperties
}

/** Result block returned when a screenshot was requested. */
export interface ScreenshotResult {
  /** Signed URL to download the full screenshot image. */
  url: string
  /** Capture mode that was used. */
  type: ScreenshotType
  /** Image-level properties of the full screenshot. */
  properties: ScreenshotProperties
  /** Tile slices, present only when the `slice` `actions_after` was requested. */
  slices?: ScreenshotSlice[]
}

/** A single inline image discovered on the page. */
export interface PageInlineImage {
  /** Absolute URL of the image. */
  url: string
  /** Alt text of the image, or `null` if not set. */
  alt: string | null
}

/** A single link discovered on the page. */
export interface PageLink {
  /** Anchor text of the link. */
  text: string
  /** The link URL as it appears on the page (absolute or relative). */
  href: string
  /** Whether the link points to the same domain as the scraped page. */
  internal: boolean
}

/** Structured page metadata extracted from `<head>`. */
export interface ScrapeMetadata {
  title?: string
  description?: string
  keywords?: string[]
  canonical?: string

  og_url?: string
  og_title?: string
  og_description?: string
  og_type?: string
  og_site_name?: string
  og_locale?: string
  og_locale_alternate?: string[]
  og_image?: string

  author?: string
  date_modified?: string
  date_published?: string

  twitter_site?: string
  twitter_card?: string
  twitter_description?: string
  twitter_title?: string
  twitter_image?: string

  robots?: string
  favicon_url?: string | null
}

/** Successful response from `POST /api/scrape` and `GET /api/scrape/result/:jobId`. */
export interface ScrapeResponse {
  /** The URL that was actually scraped (after any redirects). */
  url: string
  /** `Content-Type` header returned by the origin. */
  content_type?: string
  /**
   * Extract fields that were requested but aren't supported for this
   * content type (e.g. asking for `markdown` of a PDF).
   */
  unsupported_fields?: string[]
  /** Page content converted to clean Markdown (when `extract.markdown`). */
  markdown?: string
  /** Cleaned HTML of the main page content (when `extract.cleaned_html`). */
  cleaned_html?: string
  /** Raw, unprocessed HTML (when `extract.raw_html`). */
  raw_html?: string
  /** Inline images discovered on the page (when `extract.images`). */
  images?: PageInlineImage[]
  /** Links discovered on the page (when `extract.links`). */
  links?: PageLink[]
  /** Captured screenshot (when `extract.screenshot`). */
  screenshot?: ScreenshotResult
  /** Extracted page metadata (when `extract.metadata`, on by default). */
  metadata?: ScrapeMetadata
  /**
   * Non-error notices about the scrape (e.g. `screenshot_truncated` when a
   * long page exceeded the scrolling-screenshot height cap). Stable codes —
   * safe to switch on. Currently surfaced only on fresh scrapes; cache hits
   * omit warnings.
   */
  warnings?: string[]
  /**
   * Response envelope metadata. Carries `usage` (credits charged, resolved
   * proxy tier, and whether the result was a cache hit).
   */
  response_meta: ResponseMeta
}
