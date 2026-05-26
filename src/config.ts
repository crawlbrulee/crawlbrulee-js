/**
 * Production base URL of the crawlbrulee API. Burned in at build time —
 * customers always hit production. The base URL is intentionally not
 * configurable via env var; tests and local development override it through
 * the `baseUrl` constructor option (marked `@internal`).
 */
export const DEFAULT_BASE_URL = 'https://api.crawlbrulee.com'

/** Default request timeout (60 s) when the caller doesn't specify one. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000

/** Environment variable read by `Crawlbrulee.fromEnv()` to source the API key. */
export const ENV_API_KEY = 'CRAWLBRULEE_API_KEY'

/** Identifies the SDK in the `User-Agent` header. Kept in one place for easy bumping. */
export const USER_AGENT = '@crawlbrulee/sdk/0.1.1 (node)'
