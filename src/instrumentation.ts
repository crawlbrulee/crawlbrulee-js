import { DEFAULT_BASE_URL } from './config.js'
import { CrawlbruleeError } from './errors.js'

/** Function shape compatible with the global `fetch`. */
export type FetchLike = typeof fetch

/**
 * Centralized factory for the low-level dependencies the SDK injects into its
 * HTTP layer. Production code resolves these to the runtime's global `fetch`
 * and the burned-in production base URL; tests stub this module to swap in
 * mocks and alternate hosts.
 *
 * This is internal — it is not exported from the package's public entry. Tests
 * import it from `src/instrumentation.js` directly and use `vi.spyOn` to
 * substitute behavior.
 */
export const CwblInstrumentation = {
  /**
   * Resolve the `fetch` implementation the SDK should use. Throws a
   * {@link CrawlbruleeError} if the runtime does not expose a global `fetch`.
   */
  getFetch(): FetchLike {
    const g = globalThis as { fetch?: FetchLike }
    if (typeof g.fetch !== 'function') {
      throw new CrawlbruleeError(
        'No global fetch is available in this runtime. crawlbrulee requires Node.js 20+, Bun, Deno, or a modern browser/edge runtime.',
        { status: 0, errorName: null }
      )
    }
    return g.fetch.bind(globalThis)
  },

  /**
   * Resolve the base URL the SDK should target. Returns the production host by
   * default; tests stub this to point at a mock origin.
   */
  getBaseUrl(): string {
    return DEFAULT_BASE_URL
  },
}
