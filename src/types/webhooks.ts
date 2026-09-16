/**
 * Async scrape completion webhooks.
 *
 * When you submit a job with {@link Crawlbrulee.scrapeAsync} the API can deliver
 * a `scrape.complete` webhook to your configured endpoint once the job reaches a
 * terminal state. The envelope on the wire is exactly:
 *
 * ```json
 * {
 *   "event_id": "evt_…",
 *   "timestamp": "2026-06-13T12:00:00.000Z",
 *   "event": "scrape.complete",
 *   "data": {
 *     "job_id": "job_…",
 *     "status": "success",
 *     "url": "https://…",
 *     "completed_at": "…",
 *     "metadata": { "tenant": "acme" },
 *     "response_meta": { "usage": { "credits": 1, "engine": "http", "proxy": "basic", "screenshot_slices": 0 } }
 *   }
 * }
 * ```
 */

import type { ResponseMeta } from './common.js'

/** Terminal status carried by a {@link ScrapeCompleteWebhook}. */
export type ScrapeWebhookStatus = 'success' | 'failed' | 'cancelled'

/** `data` block of a {@link ScrapeCompleteWebhook}. */
export interface ScrapeCompleteWebhookData {
  /** The async job identifier — pass it to `getScrapeResult`. */
  job_id: string
  /** Terminal state of the job. */
  status: ScrapeWebhookStatus
  /** The URL that was scraped. */
  url: string
  /** ISO-8601 UTC timestamp when the job reached its terminal state. */
  completed_at: string
  /** Failure message — present only when `status === 'failed'`. */
  error?: string
  /**
   * Correlation data echoed back from the original scrape request's
   * `webhook.metadata`, if any.
   */
  metadata?: Record<string, unknown>
  /**
   * Response envelope metadata — `usage` (credits charged, billing engine,
   * resolved proxy tier, and billed screenshot slices). Present only on `status: 'success'`
   * deliveries; omitted for `failed` / `cancelled` (no usage was charged).
   */
  response_meta?: ResponseMeta
}

/**
 * Webhook envelope delivered when an async scrape job completes. The `event`
 * discriminator is always the literal `'scrape.complete'`.
 */
export interface ScrapeCompleteWebhook {
  /** Unique event identifier — also delivered in the `X-Cwbl-Event-Id` header. */
  event_id: string
  /** ISO-8601 UTC timestamp when the event was emitted. */
  timestamp: string
  /** Event type discriminator. */
  event: 'scrape.complete'
  /** Event payload. */
  data: ScrapeCompleteWebhookData
}
