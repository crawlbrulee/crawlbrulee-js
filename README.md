# @crawlbrulee/sdk

The official TypeScript / JavaScript SDK for the [crawlbrulee](https://crawlbrulee.com) web-scraping API.

- Fully typed.
- ESM + CommonJS, ships its own `.d.ts`.
- Zero runtime dependencies — just `fetch`.
- Works on Node.js 22+, modern Deno, Bun, and runtimes where `fetch` is available.

> **Status:** v0.1.0 (beta). API surface is stabilizing — expect minor breaking changes between 0.x releases.

---

## Install

```bash
pnpm add @crawlbrulee/sdk
# or
npm install @crawlbrulee/sdk
# or
yarn add @crawlbrulee/sdk
```

## Quickstart

```ts
import { Crawlbrulee } from '@crawlbrulee/sdk'

const crawlbrulee = new Crawlbrulee({ apiKey: 'cble_…' })
// or read CRAWLBRULEE_API_KEY from the environment:
const crawlbrulee = Crawlbrulee.fromEnv()

const page = await crawlbrulee.scrape({
  url: 'https://example.com',
  extract: { markdown: true, links: true },
})

console.log(page.markdown)
console.log(page.links?.length, 'links found')
```

### Configuration

| Option      | Default          | Description                                                                                |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------ |
| `apiKey`    | —                | API key, sent as `Authorization: Bearer …`. **Required** — or use `Crawlbrulee.fromEnv()`. |
| `timeoutMs` | `0` (no timeout) | Per-request timeout (covers headers + body). A per-call `timeoutMs` overrides this.        |

`Crawlbrulee.fromEnv(overrides?)` reads the API key from `CRAWLBRULEE_API_KEY` and forwards any other option through `overrides`.

---

## API reference

All methods return a `Promise` that resolves to the parsed JSON response, or rejects with a [`CrawlbruleeError`](#errors) subclass.

Every method accepts an optional second argument with per-call overrides:

```ts
crawlbrulee.scrape(request, {
  signal: AbortSignal, // cancel the request
  timeoutMs: 30_000, // override the constructor timeout
})
```

### Scraping

#### `crawlbrulee.scrape(request, options?)`

Synchronously scrape a URL. The request blocks until the server is done.

```ts
const page = await crawlbrulee.scrape({
  url: 'https://news.example.com/article-1',
  extract: {
    markdown: true,
    metadata: true,
    links: true,
    images: true,
    screenshot: {
      type: 'full_page',
      device_mode: 'desktop',
      cleanup: { ads_and_popups: true },
    },
  },
  require_js: true,
  proxy: 'advanced',
  exclude_selectors: ['nav', 'footer'],
  cache: { max_age: 3600 },
  location: { country: 'US' },
})
```

See [`ScrapeRequest`](src/types/scrape.ts) and [`ScrapeResponse`](src/types/scrape.ts) for every field, with inline documentation.

#### `crawlbrulee.scrapeAsync(request, options?)`

Submit a scrape job in the background. Returns immediately with a `job_id`.

```ts
const { job_id } = await crawlbrulee.scrapeAsync({ url: 'https://example.com' })
```

#### `crawlbrulee.getScrapeStatus(jobId, options?)`

Look up the current status of an async job — `pending`, `running`, `done`, or `failed`.

#### `crawlbrulee.getScrapeResult(jobId, options?)`

Fetch the result of a completed async job. Throws if the job hasn't finished yet.

#### `crawlbrulee.waitForScrape(jobId, options?)`

Poll an async job until it reaches a terminal state, then return the scrape result.

```ts
const { job_id } = await crawlbrulee.scrapeAsync({ url: 'https://example.com' })

const page = await crawlbrulee.waitForScrape(job_id, {
  intervalMs: 2000, // poll every 2 s (default)
  timeoutMs: 5 * 60 * 1000, // give up after 5 min (default; 0 to wait forever)
})
```

Throws a `CrawlbruleeError` with `errorName: 'job_failed'` if the job ends in `failed`, or `errorName: 'request_timeout'` if the wait expires.

### Mapping

#### `crawlbrulee.map(request, options?)`

Build (or return a cached) link map for a website. Combines sitemap discovery with the freshest cached homepage scrape when available.

```ts
const result = await crawlbrulee.map({
  url: 'https://example.com',
  sitemap_only: false,
  types: { internal: true, internal_subdomains: false, external: false },
  max_urls: 5_000,
  page: 1,
  limit: 1_000,
})

console.log(result.links.length, 'urls on page 1 of', result.meta.pagination.total_pages)
```

### Account

#### `crawlbrulee.usage(options?)`

Return the current billing-cycle snapshot — total/used/available credits, used quota percentage, max concurrency, and the cycle reset timestamp.

#### `crawlbrulee.whoami(options?)`

Return the organization name and identifying details of the API token used to authenticate the request.

---

## Errors

Every failure raised by the SDK extends [`CrawlbruleeError`](src/errors.ts). Typed subclasses are exported for the most actionable cases:

| Class                  | When it's raised                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `AuthenticationError`  | 401 / 403 responses (missing, invalid, or unauthorized API key).                                     |
| `RateLimitError`       | 429 responses. Exposes `retryAfterMs` and `limitedBy` when the server provided them.                 |
| `UsageAllocationError` | The org's plan limit was hit. Exposes `reason` (`credit_limit`, `concurrency_limit`, …) and `usage`. |
| `ValidationError`      | 4xx caused by a bad request (`invalid_url`, `url_too_long`, `blocked_url`, …).                       |
| `NotFoundError`        | 404 responses (e.g. unknown async `jobId`).                                                          |
| `TransportError`       | Network failures, aborts, non-JSON responses, request body read failures.                            |
| `CrawlbruleeError`     | Base class — used for any other API error. Always has `status`, `errorName`, `message`.              |

```ts
import { Crawlbrulee, RateLimitError, UsageAllocationError } from '@crawlbrulee/sdk'

const crawlbrulee = new Crawlbrulee({ apiKey: 'cble_…' })
try {
  await crawlbrulee.scrape({ url: 'https://example.com' })
} catch (err) {
  if (err instanceof RateLimitError) {
    await sleep(err.retryAfterMs ?? 1000)
    // retry…
  } else if (err instanceof UsageAllocationError) {
    console.error('Plan limit hit:', err.reason, err.usage)
  } else {
    throw err
  }
}
```

For exhaustive branching, switch on `err.errorName` — the literal-typed union is exported as `ApiErrorName`.

---

## Cancellation and timeouts

Every method accepts an `AbortSignal`:

```ts
const controller = new AbortController()
const page = crawlbrulee.scrape({ url: 'https://slow.example.com' }, { signal: controller.signal })

setTimeout(() => controller.abort(), 5_000)
```

The per-call `timeoutMs` and the caller's signal are composed — whichever fires first wins.

---

## Development

```bash
pnpm install
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm build        # tsup → dist/
```

The SDK has zero runtime dependencies on purpose. Please keep it that way when contributing.
