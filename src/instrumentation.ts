import { CrawlbruleeError } from './errors.js'

/** Function shape compatible with the global `fetch`. */
export type FetchLike = typeof fetch

/**
 * Centralized factory for low-level dependencies the SDK injects into its HTTP
 * layer. Production code resolves `getFetch()` to the runtime's global `fetch`;
 * tests stub this module to return a mock implementation.
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
}
