/** Job lifecycle states for an async scrape. */
export type AsyncJobStatus = 'pending' | 'running' | 'done' | 'failed'

/** Response body of `POST /api/scrape/async`. */
export interface AsyncScrapeResponse {
  /** Job identifier — pass it to `getScrapeStatus` / `getScrapeResult`. */
  job_id: string
}

/**
 * Response body of `GET /api/scrape/status/:jobId`.
 *
 * Note: this response uses camelCase field names (`jobId`, `createdAt`) while
 * most other crawlbrulee responses use snake_case (e.g. `job_id` on
 * {@link AsyncScrapeResponse}, `total_credits` on `UsageResponse`). The SDK
 * mirrors the wire format faithfully — if the inconsistency trips you up,
 * destructure with explicit names.
 */
export interface AsyncJobStatusResponse {
  /** The job identifier. */
  jobId: string
  /** Current state of the job. */
  status: AsyncJobStatus
  /** ISO-8601 UTC timestamp when the job was created. */
  createdAt: string
  /** Error message if the job ended in `failed`. */
  error?: string
}
