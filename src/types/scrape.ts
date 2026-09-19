import type { ProxyTier, ResponseMeta, ScreenshotRequest, ScreenshotType } from './common.js'

/**
 * Which content formats to extract from the scraped page. Every field is
 * optional; the server defaults are noted on each field. The default request
 * extracts `{ metadata: true, cleaned_html: true }`.
 *
 * `extract` only selects what is returned — changing it does not change whether
 * an otherwise identical request can be served from cache.
 */
export interface ScrapeExtract {
  /** Extract page metadata (title, description, OG/Twitter tags, etc.). Default `true`. */
  metadata?: boolean
  /** Extract cleaned HTML (main content only). Default `true`. */
  cleaned_html?: boolean
  /** Extract the page as clean Markdown. Default `false`. */
  markdown?: boolean
  /**
   * Return the raw, unprocessed HTML. Default `false`. Capped at 10 000 000
   * characters per page; past that the HTML is truncated at a tag boundary and
   * a `raw_html_truncated` warning is returned.
   */
  raw_html?: boolean
  /**
   * Extract the links found on the page. Default `false`. At most 30 000 links
   * per page — beyond that the list is truncated and a `links_truncated`
   * warning is returned.
   */
  links?: boolean
  /**
   * Extract the inline images found on the page. Default `false`. Image URLs
   * preserve their query string, and document-relative `src`s are resolved
   * against the full page URL (browser parity) — same rules as `links`. At most
   * 10 000 images per page — beyond that the list is truncated and an
   * `inline_images_truncated` warning is returned.
   */
  images?: boolean
  /** Capture a screenshot. Omit to skip; set to a `ScreenshotRequest` to enable. */
  screenshot?: ScreenshotRequest
}

/**
 * What is removed from the page before any output is built.
 *
 * Applies to `markdown`, `cleaned_html`, `links` and `images` on every engine,
 * and to the screenshot. It never applies to `raw_html` — that is always the
 * page as it arrived, before anything was removed.
 */
export interface ScrapeCleanup {
  /**
   * Remove ads, cookie banners, consent dialogs and chat widgets. Defaults to
   * `true` server-side. Set it to `false` to capture the page as-is, or to get
   * past a site that refuses to serve content to an ad-blocking client.
   */
  ads_and_popups?: boolean
  /**
   * CSS selectors whose elements are removed before anything is captured. Use
   * it for a banner or widget `ads_and_popups` does not recognise.
   *
   * At most 100 selectors, each at most 500 characters. Sending any selector
   * here makes the request skip the cache, so it always costs a live fetch.
   */
  exclude_selectors?: string[]
}

/**
 * Cache settings for a scrape request. `max_age` is the only cache control.
 * A cached result has to match the url, the screenshot setup (type, viewport,
 * device mode), `cleanup.ads_and_popups` and `location.locale`, and
 * `require_js: true` only matches browser-rendered results.
 * `cleanup.exclude_selectors` and a non-zero `actions_before` wait or scroll
 * disable caching for that request.
 */
export interface ScrapeCache {
  /**
   * Maximum cache age. Either a number of seconds (non-negative integer) or
   * an ISO-8601 datetime cutoff — cached entries older than this are skipped.
   * Defaults to 2 days when omitted.
   */
  max_age?: number | string
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
  /**
   * The URL to scrape. Known tracking parameters are removed before the page is
   * fetched, so they reach neither the target site nor the cache. Every other query
   * parameter is kept verbatim.
   */
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
  /**
   * What is removed from the page before any output is built. Shapes
   * `markdown`, `cleaned_html`, `links`, `images` and the screenshot.
   *
   * Never applies to `raw_html`, which is always the page before anything was
   * removed.
   */
  cleanup?: ScrapeCleanup
  /**
   * Proxy tier to use for fetching. Defaults to `auto` (tries the basic tier
   * first, escalates to advanced on failure; billed at the delivered tier).
   */
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
  /**
   * Absolute URL of the image, query string preserved. Document-relative
   * `src`s are resolved against the full page URL (browser parity).
   */
  url: string
  /** Alt text of the image, or `null` if not set. */
  alt: string | null
}

/** A single link discovered on the page. */
export interface PageLink {
  /** Anchor text of the link. */
  text: string
  /**
   * The link URL as written on the page, resolved to an absolute URL.
   * Verbatim otherwise: query string, fragment, and duplicates are preserved.
   * Non-http(s) hrefs (`mailto:`, `tel:`, …) are dropped.
   */
  href: string
  /**
   * Whether the link points to the same domain as the scraped page. `www` and
   * the bare domain are equivalent; other subdomains are external.
   */
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

/**
 * Non-error notices returned on {@link ScrapeResponse.warnings}. Stable codes —
 * safe to switch on. They come in two families.
 *
 * Truncation — the output is there, but capped:
 *
 * - `screenshot_truncated` — a long page exceeded the scrolling-screenshot
 *   height cap.
 * - `links_truncated` — the page had more than 30 000 links.
 * - `inline_images_truncated` — the page had more than 10 000 inline images.
 * - `raw_html_truncated` — the page body exceeded 10 000 000 characters of HTML.
 * - `metadata_truncated` — the page `<head>` exceeded 2 000 000 characters of
 *   HTML, so some metadata may be missing.
 *
 * Unavailability — that section's extraction failed, so the field is omitted
 * or empty while the rest of the scrape succeeded. These let you tell "the page
 * had none" apart from "we couldn't read them":
 *
 * - `links_unavailable` — link extraction failed.
 * - `inline_images_unavailable` — image extraction failed.
 * - `metadata_unavailable` — metadata extraction failed.
 *
 * The page body has no such code: if it can't be extracted the scrape fails
 * outright rather than returning a hollow `200`, and isn't billed.
 */
export type ScrapeWarningCode =
  | 'screenshot_truncated'
  | 'links_truncated'
  | 'inline_images_truncated'
  | 'raw_html_truncated'
  | 'metadata_truncated'
  | 'links_unavailable'
  | 'inline_images_unavailable'
  | 'metadata_unavailable'

/** Successful response from `POST /api/scrape` and `GET /api/scrape/result/:jobId`. */
export interface ScrapeResponse {
  /**
   * The URL that was actually scraped, after any redirects, in cleaned
   * canonical form (tracking params and fragment removed) — the base that
   * `links`, `images`, and `internal` labels are computed against.
   */
  url: string
  /** The URL you requested, echoed verbatim — before any redirects. */
  requested_url: string
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
  /**
   * Raw, unprocessed HTML (when `extract.raw_html`). Truncated at a tag
   * boundary past 10 000 000 characters, with a `raw_html_truncated` warning.
   */
  raw_html?: string
  /** Inline images discovered on the page (when `extract.images`). */
  images?: PageInlineImage[]
  /** Links discovered on the page (when `extract.links`). */
  links?: PageLink[]
  /**
   * Captured screenshot (when `extract.screenshot`). In rare cases a screenshot
   * can't be captured; when you also requested other outputs those are still
   * returned and this field is simply left out (so it reads back as
   * `undefined`) — guard with `page.screenshot?.url`. A screenshot-only request
   * that can't deliver fails instead of returning an empty response: a `422`
   * with `unsupported_screenshot_output` when the content type can't be
   * screenshotted, a `500` when the capture itself failed — and isn't billed.
   */
  screenshot?: ScreenshotResult
  /** Extracted page metadata (when `extract.metadata`, on by default). */
  metadata?: ScrapeMetadata
  /**
   * Non-error notices about the scrape — an output was capped (`*_truncated`)
   * or could not be extracted (`*_unavailable`); see {@link ScrapeWarningCode}
   * for what each one means. The codes are stable and safe to switch on, but
   * the array stays widened to `string` so a newly introduced code doesn't
   * break your build.
   *
   * Warnings are stored with the result, so cache hits and async result
   * fetches carry them too, filtered to the outputs you requested —
   * `raw_html_truncated` always surfaces, since a truncated body also feeds
   * `markdown` and `cleaned_html`.
   */
  warnings?: (ScrapeWarningCode | (string & {}))[]
  /**
   * Response envelope metadata. Carries `usage` (credits charged, billing
   * engine, resolved proxy tier, and billed screenshot slices).
   */
  response_meta: ResponseMeta
}
