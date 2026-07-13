/** Response from `GET /api/usage`. Current billing-cycle snapshot. */
export interface UsageResponse {
  /**
   * Total credits available for the current billing cycle
   * (plan base + purchased + gifted).
   */
  total_credits: number
  /**
   * Credits spent so far in the current billing cycle. May exceed
   * `total_credits` on plans that allow overages.
   */
  used_credits: number
  /**
   * Remaining credits, `max(0, total_credits - used_credits)`. Clamped to 0
   * while in overage.
   */
  available_credits: number
  /**
   * Percentage of `total_credits` used in the current cycle, rounded to one
   * decimal. Not capped — values above 100 indicate overage.
   */
  used_quota_percent: number
  /**
   * Maximum number of concurrent jobs allowed for the org
   * (plan base + purchased + gifted extras).
   */
  max_concurrency: number
  /**
   * ISO-8601 UTC timestamp when the current billing cycle ends and
   * `used_credits` resets to 0.
   */
  usage_reset: string
}

/** Response from `GET /api/whoami`. Identifies the calling API token. */
export interface WhoamiResponse {
  /** Display name of the organization that owns the token. */
  organization_name: string
  /** User-assigned name of the API token. */
  token_name: string
  /** Truncated preview of the API token (e.g. `cwbl_…xyz`). Safe to display. */
  token_preview: string
}
