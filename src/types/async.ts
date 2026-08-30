import type { ResponseMeta } from './common.js'

/** Job lifecycle states for an async scrape. */
export type AsyncJobStatus = 'pending' | 'running' | 'done' | 'failed'

/** Response body of `POST /api/scrape/async`. */
export interface AsyncScrapeResponse {
  /** Job identifier — pass it to `getScrapeStatus` / `getScrapeResult`. */
  job_id: string
}

/** Response body of `GET /api/scrape/status/:jobId`. */
export interface AsyncJobStatusResponse {
  /** The job identifier. */
  job_id: string
  /** Current state of the job. */
  status: AsyncJobStatus
  /** ISO-8601 UTC timestamp when the job was created. */
  created_at: string
  /** Error message if the job ended in `failed`. */
  error?: string
  /**
   * Response envelope metadata — present only when the job has reached the
   * terminal `done` state. Carries `usage` (credits charged, billing engine,
   * resolved proxy tier, and billed screenshot slices).
   */
  response_meta?: ResponseMeta
}
