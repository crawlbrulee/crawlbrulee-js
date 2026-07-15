/**
 * Production base URL of the crawlbrulee API. Used by default when the caller
 * doesn't pass a `baseUrl` to {@link Crawlbrulee}. Local development and
 * staging callers point at their own host via that option.
 */
export const DEFAULT_BASE_URL = 'https://api.crawlbrulee.com'

/** Default request timeout when the caller doesn't specify one (0 disables the timeout). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 0

/** Environment variable read by `Crawlbrulee.fromEnv()` to source the API key. */
export const ENV_API_KEY = 'CRAWLBRULEE_API_KEY'

/** Identifies the SDK in the `User-Agent` header. Kept in one place for easy bumping. */
export const USER_AGENT = '@crawlbrulee/sdk/0.7.0 (node)'
