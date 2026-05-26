/**
 * Official TypeScript / JavaScript SDK for the crawlbrulee API.
 *
 * Most usage starts with {@link Crawlbrulee}:
 *
 * ```ts
 * import { Crawlbrulee } from '@crawlbrulee/sdk'
 *
 * const crawlbrulee = new Crawlbrulee({ apiKey: 'cble_…' })
 * // or read CRAWLBRULEE_API_KEY from the environment:
 * const crawlbrulee = Crawlbrulee.fromEnv()
 *
 * const page = await crawlbrulee.scrape({ url: 'https://example.com' })
 * ```
 */

export { Crawlbrulee } from './client.js'
export type { CrawlbruleeOptions, WaitForScrapeOptions } from './client.js'

export type { HttpMethod, RequestOptions } from './http.js'

export {
  AuthenticationError,
  CrawlbruleeError,
  NotFoundError,
  RateLimitError,
  TransportError,
  UsageAllocationError,
  ValidationError,
  isCrawlbruleeError,
} from './errors.js'

export { DEFAULT_BASE_URL, DEFAULT_REQUEST_TIMEOUT_MS, ENV_API_KEY } from './config.js'

export * from './types/index.js'
