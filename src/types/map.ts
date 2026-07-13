import type { ProxyTier, ResponseMeta } from './common.js'

/** Filter which link types appear in the map result. */
export interface MapTypes {
  /** Include internal links (same domain). Default `true`. */
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
   * Maximum number of URLs to store in the map. Must be in `(0, 100 000]`.
   * Defaults to 100 000.
   */
  max_urls?: number
  /** 1-based page number for paginated results. Defaults to 1. */
  page?: number
  /**
   * Number of URLs per page. Must be in `(0, 10 000]`. Defaults to 10 000.
   */
  limit?: number
  /** Optional country emulation. */
  location?: MapLocation
}

/** Single discovered URL in a map result. */
export interface MapLinkItem {
  /** The discovered URL. */
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

/** Information about whether the stored or returned map was truncated. */
export interface MapTruncation {
  /** Whether the stored map was capped by `max_urls`. */
  storage_capped: boolean
  /** Whether the response was capped by pagination. */
  response_capped: boolean
  /** Total URLs found before the `max_urls` cap was applied. */
  total_before_max_urls: number
  /** Total URLs detected during discovery before the storage cap was applied. */
  total_detected_before_storage_cap: number
}

/**
 * Response envelope for a map result: the shared {@link ResponseMeta} (`usage`)
 * plus the map-specific `pagination` and `truncation`.
 */
export interface MapResponseMeta extends ResponseMeta {
  pagination: MapPagination
  truncation: MapTruncation
}

/** Success response from `POST /api/map`. */
export interface MapResponse {
  /** The current page of discovered URLs. */
  links: MapLinkItem[]
  /** Usage, pagination, and truncation metadata for the result set. */
  response_meta: MapResponseMeta
}
