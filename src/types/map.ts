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

/**
 * What a map returns, sent as {@link MapRequest.entries}: `pages` (page
 * addresses, the default), `sitemaps` (sitemap files) or `all` (both).
 */
export type MapEntries = 'pages' | 'sitemaps' | 'all'

/** Request body for `POST /api/map`. */
export interface MapRequest {
  /**
   * The website URL to map. A map always covers the whole site, so the path,
   * query string and fragment are dropped.
   */
  url: string
  /**
   * Proxy tier to use for fetching. Defaults to `auto` (tries the basic tier
   * first, escalates to advanced on failure; billed at the delivered tier).
   */
  proxy?: ProxyTier
  /**
   * Use the sitemaps only: leave out the links found on the home page.
   * Default `false`. A map with `modified_since` or `sitemap_url` never adds
   * home page links.
   */
  sitemap_only?: boolean
  /** Filter which link types to include. */
  types?: MapTypes
  /**
   * Cache settings for this request. A request with `modified_since` is always
   * mapped fresh, so `cache.max_age` does nothing there.
   */
  cache?: MapCache
  /**
   * Start from this sitemap file, as a full http or https address. It must be
   * on the same site as `url`, or on a host the site's robots.txt names, such
   * as a CDN. Left out, the map starts from
   * the site's own top sitemap files.
   *
   * Use it to map a very large site in several calls: list the site's sitemap
   * files first, then read each one with `sitemap_url`.
   */
  sitemap_url?: string
  /**
   * How many levels of nested sitemaps to follow: `0` to `3`, default `3`.
   * The sdk does not check the range: the api answers a higher value with a
   * `400`, which raises {@link ValidationError}.
   *
   * With `sitemap_url`, level 0 is that file, and it is read. Without it,
   * level 0 is the list of the site's top sitemap files, which `depth: 0`
   * returns without reading them: `{ depth: 0, entries: 'sitemaps' }` lists a
   * site's top sitemap files.
   *
   * A sitemap index holds only sitemap files, so reading one at a low depth
   * with `entries: 'pages'` returns no pages. Ask with `entries: 'sitemaps'`
   * or a higher depth.
   */
  depth?: number
  /**
   * What to return: `pages` (the default), `sitemaps` or `all`. See
   * {@link MapEntries}.
   */
  entries?: MapEntries
  /**
   * An ISO 8601 date and time with a zone, such as `2026-11-01T00:00:00Z`.
   * Only entries whose `lastmod` is at or after it come back. An entry with no
   * `lastmod` is left out, so every entry returned matches; links found on the
   * home page have no `lastmod`, so none of them is returned. A nested sitemap
   * whose own `lastmod` is older is not read, so a site that does not update
   * the dates in its sitemap index can hide changed pages.
   *
   * A request with this field is always mapped fresh: it never reads from or
   * adds to the cache, and each call is priced as a fresh map.
   */
  modified_since?: string
  /**
   * The most entries the map finds, counting only the kind asked for in
   * `entries`. Must be in `(0, 100 000]`. Defaults to 5 000.
   *
   * Discovery stops as soon as this many have been found, so a smaller value
   * is a faster and lighter map, not just a shorter answer. A map that stopped
   * this way has {@link MapTruncation.discovery_cap_reason} set to
   * `max_results`; ask again with a higher `max_results` to get more.
   */
  max_results?: number
  /**
   * @deprecated Use {@link MapRequest.max_results}, which means the same. When
   * both are sent, only `max_results` is used. The api removes `max_urls` on
   * 2027-02-01.
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
  /**
   * Keeps the result out of the shared cache; anything stored to deliver it is
   * kept for 24 hours, then deleted. Adds 1 credit. Must be enabled for your
   * organization, or the request fails with {@link ZeroDataRetentionNotEnabledError}.
   * See https://crawlbrulee.com/docs/zero-data-retention.
   */
  zero_data_retention?: boolean
}

/**
 * What a link in a map result is: `page` for a page address, `sitemap` for a
 * sitemap file, which you can read with `sitemap_url` in another call. A file
 * on another site is read that way only when the site's robots.txt names its
 * host.
 */
export type MapLinkType = 'page' | 'sitemap'

/** Single discovered URL in a map result. */
export interface MapLinkItem {
  /**
   * The discovered URL, normalised the same way `/scrape` normalises the `url`
   * it returns.
   */
  url: string
  /**
   * `page` for a page address, `sitemap` for a sitemap file you can read with
   * `sitemap_url` in another call. A link found on the home page is a `page`.
   */
  type: MapLinkType
  /**
   * The entry's `lastmod` from the sitemap, as an ISO 8601 date and time in
   * UTC, or `null` when the sitemap gives none or it can't be read. Always
   * `null` for a link found on the home page.
   */
  lastmod: string | null
}

/** Pagination details on a map response. */
export interface MapPagination {
  page: number
  limit: number
  /**
   * How many links this answer holds across all its pages, after `entries`,
   * `types` and `max_results` are applied.
   */
  total: number
  total_pages: number
  has_more: boolean
}

/**
 * Which limit stopped sitemap discovery first, or `null` when nothing stopped
 * it.
 *
 * - `max_results`: your own {@link MapRequest.max_results} was reached. Ask
 *   again with a higher one to get more.
 * - `depth`: there are sitemap files past the `depth` you asked for. That is
 *   the answer to the depth you chose, not a fault: with `depth: 0` it is how
 *   a site's top sitemap files are listed. The files past it are in
 *   {@link MapTruncation.unread_sitemaps}; read each one with `sitemap_url`.
 * - `time`: discovery ran out of its time budget.
 * - `file_budget`: the site has more sitemap files than one request reads.
 * - `file_size`: a sitemap file was too large. A file that says up front
 *   that it is over the size limit is not downloaded: nothing comes back from
 *   it, and it is listed in {@link MapTruncation.unread_sitemaps}. A file of
 *   pages that turns out too large while it is read returns the links in its
 *   first part. Any other file that turns out too large, such as a sitemap
 *   index, returns nothing and is listed.
 * - `unread_files`: a sitemap file the site publishes could not be read whole
 *   this time (the request failed or was rate limited, the download broke off,
 *   or the file was not a readable sitemap). When a download broke off, the
 *   links received before the break are returned, and the file is listed in
 *   `unread_sitemaps`. Asking again later can return more.
 */
export type MapDiscoveryCapReason =
  | 'max_results'
  | 'time'
  | 'file_budget'
  | 'depth'
  | 'file_size'
  | 'unread_files'

/** Information about whether the stored or returned map was truncated. */
export interface MapTruncation {
  /** Whether the map found more than 100 000 URLs, the most one map holds, so some were left out. */
  storage_capped: boolean
  /**
   * Whether more links were eligible than `max_results`, so the list was
   * trimmed. Discovery itself stops at `max_results`, so this is normally
   * `true` only when home-page links pushed the total past it. A discovery
   * stop shows on {@link discovery_cap_reason} instead.
   */
  response_capped: boolean
  /** Total links found before `max_results` was applied. */
  total_before_max_results: number
  /**
   * @deprecated Use {@link MapTruncation.total_before_max_results}, which
   * always has the same value. The api removes `total_before_max_urls` on
   * 2027-02-01.
   */
  total_before_max_urls: number
  /** Total URLs found, before the 100 000-URL limit of one map. */
  total_detected_before_storage_cap: number
  /**
   * Whether sitemap discovery stopped before it had read every sitemap file it
   * found. When `true`, the site has more pages than this map lists.
   */
  discovery_capped: boolean
  /**
   * How many sitemap files were skipped or only partly read during discovery.
   * Integer `>= 0`.
   */
  sitemaps_skipped: number
  /**
   * The sitemap files this call knew about but did not read whole, because a
   * limit stopped it, the file could not be read, or its download broke off.
   * Read each one with `sitemap_url` in another call, except a file that says
   * it is over the size limit: no call reads that one. Up to 1 000 addresses;
   * empty when every file was read.
   *
   * When this list is full, send the same request with `entries: 'sitemaps'`
   * to get every sitemap file as a link, paged.
   */
  unread_sitemaps: string[]
  /**
   * Which limit stopped sitemap discovery first, or `null` when nothing did.
   * See {@link MapDiscoveryCapReason}.
   */
  discovery_cap_reason: MapDiscoveryCapReason | null
}

/** Billing engine reported by map: fresh discovery or a cached result. */
export type MapBillingEngine = 'http' | 'cache'

/**
 * Usage accounting returned by the map endpoint. Map requests make no
 * screenshots, so there is no slicing add-on:
 * `total_credit_cost = engine_credit_cost × proxy_multiplier + zero_data_retention_credit_cost`.
 *
 * The `*_credit_cost` / `proxy_multiplier` fields are optional in this type
 * because older api versions do not send them.
 */
export interface MapUsage {
  /**
   * Credits charged for this map request. Always equals
   * `engine_credit_cost × proxy_multiplier + zero_data_retention_credit_cost`. `0` for a cache hit, and for an
   * empty map when the site answered only with statuses we don't bill (a `5xx`,
   * for example) or not at all.
   *
   * Optional only because older api versions do not send it.
   */
  total_credit_cost?: number
  /**
   * The engine base charged, before the proxy multiplier: `1` for `http`, `0`
   * for `cache`. Also `0` for an empty map that is not billed.
   */
  engine_credit_cost?: number
  /**
   * The multiplier of the proxy tier the request ran on: `1` for `basic`, `5`
   * for `advanced`. Always reported, even when the engine cost is `0`.
   */
  proxy_multiplier?: number
  /**
   * Credits added by zero data retention: `1` on a billed, fresh result,
   * otherwise `0`. Absent on an older api version; read it as
   * `usage.zero_data_retention_credit_cost ?? 0`.
   */
  zero_data_retention_credit_cost?: number
  /** `http` for fresh discovery or `cache` for a cached result. */
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
   * The current page of discovered URLs, each with its `type` and `lastmod`.
   *
   * Ordering is stable, with the most useful links first. The site root is
   * listed only when a sitemap lists it.
   */
  links: MapLinkItem[]
  /** Usage, pagination, and truncation metadata for the result set. */
  response_meta: MapResponseMeta
}
