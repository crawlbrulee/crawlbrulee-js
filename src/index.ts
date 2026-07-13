/**
 * Official TypeScript / JavaScript SDK for the crawlbrulee API.
 *
 * Most usage starts with {@link Crawlbrulee}:
 *
 * ```ts
 * import { Crawlbrulee } from '@crawlbrulee/sdk'
 *
 * const crawlbrulee = new Crawlbrulee({ apiKey: 'cwbl_…' })
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

export {
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  WEBHOOK_EVENT_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_ROTATED_HEADER,
  verifyWebhookSignature,
} from './webhooks.js'
export type {
  VerifyWebhookSignatureOptions,
  WebhookSignatureSource,
  WebhookVerificationFailureReason,
  WebhookVerificationResult,
} from './webhooks.js'

export * from './types/index.js'
