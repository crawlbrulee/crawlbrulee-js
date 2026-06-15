import { ENV_API_KEY } from './config.js'
import { CrawlbruleeError } from './errors.js'
import { HttpClient, type RequestOptions } from './http.js'
import type {
  AsyncJobStatusResponse,
  AsyncScrapeRequest,
  AsyncScrapeResponse,
  MapRequest,
  MapResponse,
  ScrapeCompleteWebhook,
  ScrapeRequest,
  ScrapeResponse,
  UsageResponse,
  WhoamiResponse,
} from './types/index.js'

/** Options accepted by the {@link Crawlbrulee} constructor. */
export interface CrawlbruleeOptions {
  /**
   * API key sent as `Authorization: Bearer <key>`. Required — to read from the
   * environment instead, use {@link Crawlbrulee.fromEnv}. Leading and trailing
   * whitespace is stripped; an empty / whitespace-only value is rejected.
   */
  apiKey: string
  /**
   * Override the base URL the SDK targets. Defaults to the production host
   * ({@link DEFAULT_BASE_URL}). Intended for local development and staging
   * (e.g. `https://api.staging.crawlbrulee.com`) — production callers should
   * leave it unset. Trailing slashes are stripped.
   */
  baseUrl?: string
  /**
   * Per-request timeout in milliseconds. Defaults to `0` (no timeout). Set to a
   * positive number to abort slow requests; a per-call `timeoutMs` override
   * takes precedence. The timeout covers the WHOLE request, including the
   * response body read.
   */
  timeoutMs?: number
}

/**
 * Options accepted by {@link Crawlbrulee.waitForScrape}.
 *
 * Note: `timeoutMs` here is the OVERALL wait budget across all polls — not the
 * per-HTTP-request timeout. The per-poll HTTP timeout is whatever the client
 * was constructed with; if you want to bound each individual poll, construct
 * the client with `timeoutMs` set.
 */
export interface WaitForScrapeOptions extends Omit<RequestOptions, 'timeoutMs'> {
  /** Time between status polls in milliseconds. Default `2000`. */
  intervalMs?: number
  /**
   * Maximum total time to wait before giving up, in milliseconds. Default
   * `300_000` (5 minutes). Pass `0` to wait indefinitely.
   */
  timeoutMs?: number
}

/**
 * Official client for the crawlbrulee API.
 *
 * @example
 * ```ts
 * import { Crawlbrulee } from '@crawlbrulee/sdk'
 *
 * const crawlbrulee = new Crawlbrulee({ apiKey: 'cble_…' })
 * // or read CRAWLBRULEE_API_KEY from the environment:
 * const crawlbrulee = Crawlbrulee.fromEnv()
 *
 * const page = await crawlbrulee.scrape({
 *   url: 'https://example.com',
 *   extract: { markdown: true, links: true },
 * })
 * console.log(page.markdown)
 * ```
 */
export class Crawlbrulee {
  /** Resolved base URL — trailing slash already stripped. */
  readonly baseUrl: string
  /** Underlying HTTP layer. Exposed for advanced use cases (custom endpoints). */
  readonly http: HttpClient

  constructor(options: CrawlbruleeOptions) {
    const apiKey = options.apiKey?.trim()
    if (!apiKey) {
      throw new CrawlbruleeError(
        `Missing API key. Pass { apiKey } to Crawlbrulee or call Crawlbrulee.fromEnv() to read ${ENV_API_KEY}.`,
        { status: 0, errorName: null }
      )
    }
    this.http = new HttpClient({ apiKey, baseUrl: options.baseUrl, timeoutMs: options.timeoutMs })
    this.baseUrl = this.http.baseUrl
  }

  /**
   * Build a {@link Crawlbrulee} reading the API key from
   * `process.env.CRAWLBRULEE_API_KEY`. Throws if the variable is unset, empty,
   * or whitespace.
   *
   * Any other constructor option can be passed via `overrides`.
   *
   * @example
   * ```ts
   * const crawlbrulee = Crawlbrulee.fromEnv()
   * const crawlbrulee = Crawlbrulee.fromEnv({ timeoutMs: 30_000 })
   * ```
   */
  static fromEnv(overrides: Omit<CrawlbruleeOptions, 'apiKey'> = {}): Crawlbrulee {
    const apiKey = readEnv(ENV_API_KEY)
    if (!apiKey) {
      throw new CrawlbruleeError(
        `${ENV_API_KEY} is not set. Export it in your shell, or pass apiKey to new Crawlbrulee({ apiKey }).`,
        { status: 0, errorName: null }
      )
    }
    return new Crawlbrulee({ ...overrides, apiKey })
  }

  // ------------------------------------------------------------------
  // Scraping
  // ------------------------------------------------------------------

  /**
   * Scrape a URL synchronously and return the extracted content.
   *
   * The request blocks until the scrape is finished. For long-running jobs
   * (heavy JS rendering, screenshots of long pages) prefer
   * {@link Crawlbrulee.scrapeAsync} so the connection isn't held open.
   *
   * @param request — body for `POST /api/scrape`.
   * @param options — per-call timeout and abort signal.
   */
  scrape(request: ScrapeRequest, options?: RequestOptions): Promise<ScrapeResponse> {
    return this.http.post<ScrapeResponse>('/api/scrape', request, options)
  }

  /**
   * Submit an asynchronous scrape job and return its `job_id`. Poll the job
   * with {@link Crawlbrulee.getScrapeStatus} or wait for completion with
   * {@link Crawlbrulee.waitForScrape}.
   *
   * Pass an optional `webhook` to have the API deliver a signed
   * `scrape.complete` `POST` to your endpoint when the job finishes (see
   * {@link AsyncScrapeWebhook}). This field is async-only.
   */
  scrapeAsync(request: AsyncScrapeRequest, options?: RequestOptions): Promise<AsyncScrapeResponse> {
    return this.http.post<AsyncScrapeResponse>('/api/scrape/async', request, options)
  }

  /** Look up the current status of an async scrape job. */
  getScrapeStatus(jobId: string, options?: RequestOptions): Promise<AsyncJobStatusResponse> {
    assertNonEmptyJobId(jobId)
    return this.http.get<AsyncJobStatusResponse>(
      `/api/scrape/status/${encodeURIComponent(jobId)}`,
      options
    )
  }

  /**
   * Fetch the result of a completed async scrape job. Throws if the job is
   * still pending/running — call {@link Crawlbrulee.getScrapeStatus}
   * first, or use {@link Crawlbrulee.waitForScrape} to poll-then-fetch.
   */
  getScrapeResult(jobId: string, options?: RequestOptions): Promise<ScrapeResponse> {
    assertNonEmptyJobId(jobId)
    return this.http.get<ScrapeResponse>(`/api/scrape/result/${encodeURIComponent(jobId)}`, options)
  }

  /**
   * Fetch the scrape result referenced by a `scrape.complete` webhook body.
   *
   * Always verify the webhook signature with `verifyWebhookSignature` before
   * acting on it; this method trusts the parsed body it is handed.
   *
   * Behavior by `data.status`:
   * - `success` — delegates to {@link Crawlbrulee.getScrapeResult} for the
   *   webhook's `job_id` and returns the parsed result.
   * - `failed` — throws a {@link CrawlbruleeError} carrying `data.error`
   *   (`errorName: 'job_failed'`); there is no result to fetch.
   * - `cancelled` — throws a {@link CrawlbruleeError}
   *   (`errorName: 'client_closed_request'`).
   *
   * A non-`scrape.complete` envelope throws a {@link CrawlbruleeError}
   * defensively. Any HTTP error from the underlying fetch propagates as the
   * usual typed `CrawlbruleeError` subclass.
   */
  async fetchScrapeResultFromWebhook(
    webhook: ScrapeCompleteWebhook,
    options?: RequestOptions
  ): Promise<ScrapeResponse> {
    if (webhook?.event !== 'scrape.complete') {
      throw new CrawlbruleeError(
        `Expected a 'scrape.complete' webhook but received '${String(webhook?.event)}'.`,
        { status: 0, errorName: 'validation_error' }
      )
    }

    const { job_id: jobId, status, error } = webhook.data

    switch (status) {
      case 'success':
        return this.getScrapeResult(jobId, options)

      case 'failed':
        throw new CrawlbruleeError(error ?? `Async scrape job ${jobId} failed.`, {
          status: 0,
          errorName: 'job_failed',
        })

      case 'cancelled':
        throw new CrawlbruleeError(`Async scrape job ${jobId} was cancelled.`, {
          status: 0,
          errorName: 'client_closed_request',
        })

      default:
        throw new CrawlbruleeError(
          `Async scrape webhook for job ${jobId} carried an unexpected status '${String(status)}'.`,
          { status: 0, errorName: 'validation_error' }
        )
    }
  }

  /**
   * Poll an async scrape job until it reaches a terminal state, then return
   * the scrape result.
   *
   * Throws a {@link CrawlbruleeError} when:
   * - the job ends in `failed` (`errorName: 'job_failed'`),
   * - the server reports an unexpected status (`errorName: 'job_failed'`),
   * - the overall wait exceeds `timeoutMs` (`errorName: 'request_timeout'`),
   * - the caller's `signal` aborts (`errorName: 'client_closed_request'`).
   */
  async waitForScrape(jobId: string, options: WaitForScrapeOptions = {}): Promise<ScrapeResponse> {
    assertNonEmptyJobId(jobId)
    const intervalMs = options.intervalMs ?? 2000
    const timeoutMs = options.timeoutMs ?? 300_000
    const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : Number.POSITIVE_INFINITY

    while (true) {
      throwIfAborted(options.signal)
      if (Date.now() >= deadline) {
        throw new CrawlbruleeError(
          `Timed out after ${timeoutMs}ms waiting for async scrape job ${jobId}.`,
          { status: 0, errorName: 'request_timeout' }
        )
      }

      const status = await this.getScrapeStatus(jobId, { signal: options.signal })

      switch (status.status) {
        case 'done':
          return this.getScrapeResult(jobId, { signal: options.signal })

        case 'failed':
          throw new CrawlbruleeError(status.error ?? `Async scrape job ${jobId} failed.`, {
            status: 0,
            errorName: 'job_failed',
          })

        case 'pending':
        case 'running':
          break

        default:
          throw new CrawlbruleeError(
            `Async scrape job ${jobId} returned unexpected status '${String(status.status)}'.`,
            { status: 0, errorName: 'job_failed' }
          )
      }

      await sleep(intervalMs, options.signal)
    }
  }

  // ------------------------------------------------------------------
  // Mapping
  // ------------------------------------------------------------------

  /**
   * Build (or return a cached) site link-map for a domain. Combines sitemap
   * discovery with the freshest cached homepage scrape when available.
   */
  map(request: MapRequest, options?: RequestOptions): Promise<MapResponse> {
    return this.http.post<MapResponse>('/api/map', request, options)
  }

  // ------------------------------------------------------------------
  // Account
  // ------------------------------------------------------------------

  /**
   * Return the current billing-cycle usage: total/used/available credits,
   * used quota percentage, max concurrency, and when the cycle resets.
   */
  usage(options?: RequestOptions): Promise<UsageResponse> {
    return this.http.get<UsageResponse>('/api/usage', options)
  }

  /**
   * Return the organization name and identifying details of the API token
   * used to authenticate this request. Useful for confirming which key is in
   * use before performing destructive operations.
   */
  whoami(options?: RequestOptions): Promise<WhoamiResponse> {
    return this.http.get<WhoamiResponse>('/api/whoami', options)
  }
}

/**
 * Defensive read of `process.env[name]`. Guards both the absence of `process`
 * (browser / edge runtimes) and Deno's permission throw on env access without
 * `--allow-env`.
 */
function readEnv(name: string): string | undefined {
  try {
    if (typeof process === 'undefined' || !process.env) return undefined
    const v = process.env[name]
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
  } catch {
    return undefined
  }
}

function assertNonEmptyJobId(jobId: string): void {
  if (typeof jobId !== 'string' || jobId.trim().length === 0) {
    throw new CrawlbruleeError('jobId must be a non-empty string.', {
      status: 0,
      errorName: null,
    })
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new CrawlbruleeError('Request aborted by caller.', {
      status: 0,
      errorName: 'client_closed_request',
      cause: signal.reason,
    })
  }
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(
        new CrawlbruleeError('Request aborted by caller.', {
          status: 0,
          errorName: 'client_closed_request',
          cause: signal?.reason,
        })
      )
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer)
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}
