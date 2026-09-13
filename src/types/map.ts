import type { ProxyTier, ResolvedProxyTier } from './common.js'

/** Filter which link types appear in the map result. */
export interface MapTypes {
  /**
   * Include internal links (same domain; `www.` and the bare domain count as
   * the same site). Default `true`.
   *
   * Note this is only about *classifying* a link — the URLs that come back keep
   * the host exactly as the site publishes it. See {@link MapLinkItem.url}.
   */
  internal?: boolean
  /** Include links to subdomains of the target. Default `true`. */
  internal_subdomains?: boolean
  /** Include external links (different domains). Default `true`. */
  external?: boolean
}

/** Cache settings for a map request. */
export interface MapCache {
  /**
   * Maximum cache age — either seconds or an ISO-8601 datetime cutoff.
   * Defaults to 7 days when omitted.
   */
  max_age?: number | string
}

/** Country-only egress emulation (map requests have no locale knob). */
export interface MapLocation {
  /** ISO 3166-1 alpha-2 country code (e.g. `US`). Case-insensitive. */
  country?: string
}

/** Request body for `POST /api/map`. */
export interface MapRequest {
  /** The website URL to map. */
  url: string
  /**
   * Proxy tier to use for fetching. Defaults to `auto` (tries the basic tier
   * first, escalates to advanced on failure; billed at the delivered tier).
   */
  proxy?: ProxyTier
  /** Only use sitemap.xml — skip homepage link extraction. Default `false`. */
  sitemap_only?: boolean
  /** Filter which link types to include. */
  types?: MapTypes
  /** Cache settings for this request. */
  cache?: MapCache
  /**
   * Maximum number of URLs to discover and store in the map. Must be in
   * `(0, 100 000]`. Defaults to 5 000.
   *
   * Sitemap discovery stops as soon as this many URLs have been found, so a
   * smaller value is a cheaper and faster crawl, not just a shorter answer. A
   * map that stopped this way comes back with exactly `max_urls` links and
   * {@link MapTruncation.discovery_cap_reason} set to `max_urls` — ask again
   * with a higher `max_urls` to get more.
   */
  max_urls?: number
  /** 1-based page number for paginated results. Defaults to 1. */
  page?: number
  /**
   * Number of URLs per page. Must be in `(0, 10 000]`. Defaults to 5 000.
   */
  limit?: number
  /** Optional country emulation. */
  location?: MapLocation
}

/** Single discovered URL in a map result. */
export interface MapLinkItem {
  /**
   * The discovered URL, normalised the same way `/scrape` normalises the `url`
   * it returns.
   */
  url: string
}

/** Pagination details on a map response. */
export interface MapPagination {
  page: number
  limit: number
  /** Total number of URLs in the stored map. */
  total: number
  total_pages: number
  has_more: boolean
}

/**
 * Which limit stopped sitemap discovery first, or `null` when nothing stopped
 * it.
 *
 * - `max_urls` — your own {@link MapRequest.max_urls} was reached. This is the
 *   only reason you can do something about: ask again with a higher one.
 * - `time` — discovery ran out of its time budget.
 * - `file_budget` — the site has more sitemap files than one request reads.
 * - `depth` — the site's sitemap indexes nest too deeply.
 * - `file_size` — a sitemap file was too large to read.
 */
export type MapDiscoveryCapReason = 'max_urls' | 'time' | 'file_budget' | 'depth' | 'file_size'

/** Information about whether the stored or returned map was truncated. */
export interface MapTruncation {
  /** Whether the stored map hit the 100 000-URL storage cap. */
  storage_capped: boolean
  /**
   * Whether more links were eligible than `max_urls`, so the list was trimmed.
   * Discovery itself stops at `max_urls`, so this is normally `true` only when
   * home-page links pushed the total past it. A map that ran into the
   * `max_urls` limit during discovery reports `response_capped: false` and
   * signals the stop through {@link discovery_cap_reason} instead.
   */
  response_capped: boolean
  /** Total URLs found before the `max_urls` cap was applied. */
  total_before_max_urls: number
  /** Total URLs detected during discovery before the storage cap was applied. */
  total_detected_before_storage_cap: number
  /**
   * Whether sitemap discovery stopped before it had read every sitemap file it
   * found. When `true`, the site has more pages than this map lists.
   */
  discovery_capped: boolean
  /**
   * How many sitemap files were skipped or only partly read during discovery,
   * because a file was too large, could not be fetched, or a discovery limit
   * was reached. Integer `>= 0`.
   */
  sitemaps_skipped: number
  /**
   * Which limit stopped sitemap discovery first, or `null` when nothing did.
   * Only `max_urls` is something you can change from the request.
   */
  discovery_cap_reason: MapDiscoveryCapReason | null
}

/** Billing engine reported by map: fresh discovery or a cached result. */
export type MapBillingEngine = 'text' | 'cache'

/** Usage accounting returned by the map endpoint. Map operations do not produce screenshot slices. */
export interface MapUsage {
  /** Credits charged for this operation. */
  credits: number
  /** `text` for fresh discovery or `cache` for a cached result. */
  engine: MapBillingEngine
  /** The proxy tier the server resolved and used (never `auto`). */
  proxy: ResolvedProxyTier
}

/**
 * Response envelope for a map result: map usage plus the map-specific
 * `pagination` and `truncation`.
 */
export interface MapResponseMeta {
  usage: MapUsage
  pagination: MapPagination
  truncation: MapTruncation
}

/** Success response from `POST /api/map`. */
export interface MapResponse {
  /**
   * The current page of discovered URLs.
   *
   * Ordering is stable, with the most useful links first.
   */
  links: MapLinkItem[]
  /** Usage, pagination, and truncation metadata for the result set. */
  response_meta: MapResponseMeta
}
