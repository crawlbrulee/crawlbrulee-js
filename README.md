# 🍮 crawlbrulee js/ts sdk

[![npm](https://img.shields.io/npm/v/@crawlbrulee/sdk?style=flat-square&label=npm)](https://www.npmjs.com/package/@crawlbrulee/sdk)
[![types](https://img.shields.io/npm/types/@crawlbrulee/sdk?style=flat-square&label=types)](https://www.npmjs.com/package/@crawlbrulee/sdk)
[![license](https://img.shields.io/npm/l/@crawlbrulee/sdk?style=flat-square&label=license)](./LICENSE)

the official js/ts sdk for the [crawlbrulee](https://crawlbrulee.com) web-scraping api — published to npm as [`@crawlbrulee/sdk`](https://www.npmjs.com/package/@crawlbrulee/sdk). you
send a url, you get back markdown, cleaned html, links, images, metadata, or a screenshot.

- fully typed.
- ESM + CommonJS, ships its own `.d.ts`.
- zero runtime dependencies — just `fetch`.
- works on Node.js 22+, modern Deno, Bun, and runtimes where `fetch` is available.

this readme covers the sdk itself — the client, the types, and the js-side ergonomics. for how
the api behaves — endpoints, parameters, and error semantics — please see our
[api docs](https://crawlbrulee.com/docs).

> **status:** v0.10.0 (beta). the api surface is stabilizing — expect minor breaking changes between 0.x releases.

**get a free api key** → [dashboard.crawlbrulee.com](https://dashboard.crawlbrulee.com)

---

## install

```bash
pnpm add @crawlbrulee/sdk
# or
npm install @crawlbrulee/sdk
# or
yarn add @crawlbrulee/sdk
```

## quickstart

```ts
import { Crawlbrulee } from '@crawlbrulee/sdk'

const crawlbrulee = new Crawlbrulee({ apiKey: 'cwbl_…' })
// or read CRAWLBRULEE_API_KEY from the environment:
const crawlbrulee = Crawlbrulee.fromEnv()

const page = await crawlbrulee.scrape({
  url: 'https://example.com',
  extract: { markdown: true, links: true },
})

console.log(page.markdown)
console.log(page.links?.length, 'links found')
console.log(page.metadata?.title) // structured <head> metadata
console.log(page.response_meta.usage.credits, 'credits charged') // usage accounting
```

### authentication

every request carries your api key as `Authorization: Bearer <key>`. give it to the sdk one of two ways:

```ts
// explicit — pass the key directly
const crawlbrulee = new Crawlbrulee({ apiKey: 'cwbl_…' })

// from the environment — reads CRAWLBRULEE_API_KEY
const crawlbrulee = Crawlbrulee.fromEnv()
```

`Crawlbrulee.fromEnv(overrides?)` reads the key from `CRAWLBRULEE_API_KEY` and forwards any other option through
`overrides` (e.g. `Crawlbrulee.fromEnv({ timeoutMs: 30_000 })`). it throws if the variable is unset or empty. keys are
minted in the dashboard; see [authentication](https://crawlbrulee.com/docs/authentication) for how the api consumes them.

### configuration

| option      | default                       | description                                                                                         |
| ----------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `apiKey`    | —                             | api key, sent as `Authorization: Bearer …`. **required** — or use `Crawlbrulee.fromEnv()`.          |
| `baseUrl`   | `https://api.crawlbrulee.com` | override the target host (local dev / staging). trailing slashes are stripped.                      |
| `timeoutMs` | `0` (no timeout)              | per-request timeout in milliseconds (covers headers + body). a per-call `timeoutMs` overrides this. |

---

## api reference

all methods return a `Promise` that resolves to the parsed json response, or rejects with a [`CrawlbruleeError`](#errors)
subclass.

every method accepts an optional second argument with per-call overrides:

```ts
crawlbrulee.scrape(request, {
  signal: AbortSignal, // cancel the request
  timeoutMs: 30_000, // override the constructor timeout
})
```

### scraping

#### `crawlbrulee.scrape(request, options?)`

scrape a url synchronously. the request blocks until the server is done.

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

the response carries the extracted content alongside structured `metadata` (the parsed `<head>` tags — `title`,
`description`, OG/Twitter fields, …) and a `response_meta` envelope:

```ts
page.metadata?.title // structured <head> metadata (when extract.metadata, on by default)

page.response_meta.usage.credits // credits charged — 0 on a fully cached result
page.response_meta.usage.proxy // the resolved proxy tier actually used: 'basic' | 'advanced' (never 'auto')
page.response_meta.usage.cache_hit // true when the result was served from cache
```

notes:

- **`proxy`**: defaults to `auto` when omitted — it starts at the basic tier and escalates to advanced on failure,
  billed at the delivered tier. pass `'basic'` or `'advanced'` to pin a tier. on the response,
  `response_meta.usage.proxy` reports the tier we resolved and used — never `'auto'`. see
  [proxies & location](https://crawlbrulee.com/docs/proxies) for what each tier does.
- **`screenshot`**: custom `viewport.width`/`height` are integers in `[16, 10000]` and `device_scale_factor` is in
  `[1, 3]`; out-of-range values are rejected with a `400`. full capture options:
  [screenshots](https://crawlbrulee.com/docs/scrape/screenshots).
- **`extract.images`**: urls preserve their query string and resolve document-relative `src`s against the full page url
  (browser parity) — the same rules as `links`. every extract field is documented under
  [extraction](https://crawlbrulee.com/docs/scrape/extraction).
- **`warnings`**: when we complete a scrape but something is worth flagging, the codes land on `page.warnings`. each one
  means you got output, capped: `screenshot_truncated` (a long page exceeded the scrolling-screenshot height cap),
  `links_truncated` (more than 30 000 links), `inline_images_truncated` (more than 10 000 inline images),
  `raw_html_truncated` (more than 10 000 000 characters of body html), and `metadata_truncated` (more than 2 000 000
  characters of `<head>` html, so some metadata may be missing). they're stable, so you can switch on them — the union is
  exported as `ScrapeWarningCode`. fresh scrapes only; cache hits omit warnings.
- **`unsupported_fields`**: if you request an extract that doesn't apply to the content type (e.g. `markdown` of a pdf),
  that field name comes back on `page.unsupported_fields` and the rest of your payload is still returned.

see [`ScrapeRequest`](src/types/scrape.ts) and [`ScrapeResponse`](src/types/scrape.ts) for every field, with inline
documentation — and the [scrape endpoint](https://crawlbrulee.com/docs/scrape) reference for the api-side contract those
types mirror.

#### `crawlbrulee.scrapeAsync(request, options?)`

submit a scrape job in the background. returns immediately with a `job_id`.

```ts
const { job_id } = await crawlbrulee.scrapeAsync({ url: 'https://example.com' })
```

pass a `webhook` to be notified on completion instead of polling — see [webhooks](#webhooks).

#### `crawlbrulee.getScrapeStatus(jobId, options?)`

look up the current state of an async job — `pending`, `running`, `done`, or `failed`. the response carries `job_id` and
`created_at` (snake_case, straight off the wire). once the job is `done`, it also carries usage accounting on
`response_meta.usage` (`credits`, `proxy`, `cache_hit`).

#### `crawlbrulee.getScrapeResult(jobId, options?)`

fetch the result of a completed async job. throws if the job hasn't finished yet.

#### `crawlbrulee.waitForScrape(jobId, options?)`

poll an async job until it reaches a terminal state, then return the scrape result.

```ts
const { job_id } = await crawlbrulee.scrapeAsync({ url: 'https://example.com' })

const page = await crawlbrulee.waitForScrape(job_id, {
  intervalMs: 2000, // poll every 2 s (default)
  timeoutMs: 5 * 60 * 1000, // give up after 5 min (default; 0 to wait forever)
})
```

throws a `CrawlbruleeError` with `errorName: 'job_failed'` if the job ends in `failed`, or `errorName: 'request_timeout'`
if the wait expires. the job lifecycle itself — states, retention, and when to prefer async over sync — is documented
under [async scrape](https://crawlbrulee.com/docs/scrape/async).

### mapping

#### `crawlbrulee.map(request, options?)`

build (or return a cached) link map for a website. combines sitemap discovery with the freshest cached homepage scrape
when available.

```ts
const result = await crawlbrulee.map({
  url: 'https://example.com',
  sitemap_only: false,
  types: { internal: true, internal_subdomains: false, external: false },
  max_urls: 5_000,
  page: 1,
  limit: 1_000,
})

console.log(result.links.length, 'urls on page 1 of', result.response_meta.pagination.total_pages)
console.log(result.response_meta.usage.credits, 'credits charged') // usage accounting, alongside pagination + truncation
```

`result.response_meta` carries `usage` (credits / resolved `proxy` / `cache_hit`) alongside the map-specific `pagination`
and `truncation` blocks. see the [map endpoint](https://crawlbrulee.com/docs/map) for discovery rules and pagination
semantics.

### account

#### `crawlbrulee.usage(options?)`

return the current billing-cycle snapshot — `total_credits`, `used_credits`, `available_credits`, `used_quota_percent`,
`max_concurrency`, and the `usage_reset` timestamp.

#### `crawlbrulee.whoami(options?)`

return the organization name and token identity behind the api key (`organization_name`, `token_name`, and a
safe-to-display `token_preview`). use it to confirm which key is in play before a destructive operation.

what a call costs, and how credits are counted, is documented under
[credits & pricing](https://crawlbrulee.com/docs/credits-and-pricing).

---

## webhooks

when an async scrape job finishes, crawlbrulee can `POST` a `scrape.complete` webhook to your configured endpoint. the
sdk ships two helpers for it.

the delivery contract and payload shape live under [webhooks](https://crawlbrulee.com/docs/scrape/webhooks); the
signature scheme is specified in [webhook verification](https://crawlbrulee.com/docs/webhook-verification). what follows
is how this sdk helps you consume them.

### triggering a webhook (`scrapeAsync`)

pass a `webhook` to `scrapeAsync` to have us deliver a single signed `scrape.complete` `POST` when the job reaches a
terminal state. this is **async-only** — the synchronous `scrape()` response _is_ the notification, so it does not accept
a `webhook`.

```ts
const { job_id } = await crawlbrulee.scrapeAsync({
  url: 'https://example.com',
  webhook: {
    // Endpoint that receives the signed POST. HTTPS is required in production.
    url: 'https://hooks.example.com/crawlbrulee',
    // Opaque correlation object — echoed back verbatim in the webhook payload's
    // `data.metadata`. Must serialize to at most 2048 bytes.
    metadata: { tenant: 'acme', batch_id: 7 },
  },
})
```

configure the signing secret used for these deliveries in the dashboard (**account → webhooks**). there is no per-request
secret - when the delivery arrives, verify it with [`verifyWebhookSignature`](#verifywebhooksignatureoptions) and read your `metadata` back from
`webhook.data.metadata`. the delivery also carries usage accounting on `webhook.data.response_meta.usage` (`credits`,
`proxy`, `cache_hit`). see [`AsyncScrapeWebhook`](src/types/scrape.ts) for the full field documentation.

### `verifyWebhookSignature(options)`

a standalone, network-free helper (built on Web Crypto, so it runs on Node.js 22+, browsers, Bun, Deno, and edge) that
verifies the `X-Cwbl-Signature` header. **it returns a result object rather than throwing** — a failed verification is
normal control flow.

```ts
import { verifyWebhookSignature } from '@crawlbrulee/sdk'

const result = await verifyWebhookSignature({
  payload: rawBody, // the RAW request body (string or Uint8Array) — never re-serialized JSON
  headers: req.headers, // a fetch `Headers` instance OR a plain (lowercased) object
  secret: process.env.CRAWLBRULEE_WEBHOOK_SECRET!, // your current whsec_… secret
  toleranceSeconds: 300, // optional; default 300, replay-protection window. Pass 0 to disable.
})

if (result.verified) {
  console.log('signed with', result.signedWith) // 'primary' | 'rotated'
} else {
  console.warn('rejected:', result.reason) // 'missing_signature' | 'malformed_signature' | 'timestamp_out_of_tolerance' | 'signature_mismatch'
}
```

during a **signing-secret rotation grace window** we send a second `X-Cwbl-Signature-Rotated` header signed with the
previous secret. `verifyWebhookSignature` tries your `secret` against the primary header first, then the rotated one,
and reports which matched via `signedWith` — so verification keeps working whether you still hold the old secret or have
already rotated to the new one.

### `crawlbrulee.fetchScrapeResultFromWebhook(webhook, options?)`

given a verified `scrape.complete` body, fetch the scrape result. returns `getScrapeResult(job_id)` for a `success` job;
throws a `CrawlbruleeError` for `failed` (carrying the failure message) or `cancelled` jobs.

```ts
import { Crawlbrulee, verifyWebhookSignature, type ScrapeCompleteWebhook } from '@crawlbrulee/sdk'

const crawlbrulee = Crawlbrulee.fromEnv()

// Express / edge handler — read the RAW body, verify, then act.
app.post('/webhooks/crawlbrulee', async (req, res) => {
  const result = await verifyWebhookSignature({
    payload: req.rawBody,
    headers: req.headers,
    secret: process.env.CRAWLBRULEE_WEBHOOK_SECRET!,
  })
  if (!result.verified) return res.status(400).end()

  const webhook = JSON.parse(req.rawBody) as ScrapeCompleteWebhook
  const page = await crawlbrulee.fetchScrapeResultFromWebhook(webhook)
  console.log(page.markdown)

  res.status(200).end()
})
```

always verify the signature **before** parsing or trusting the body. the `X-Cwbl-Event-Id` header (also
`webhook.event_id`) is a stable id you can use to de-duplicate deliveries.

---

## errors

every failure raised by the sdk extends [`CrawlbruleeError`](src/errors.ts). typed subclasses are exported for the most actionable
cases:

| class                     | when it's raised                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `AuthenticationError`     | 401 / 403 responses (missing, invalid, or unauthorized api key).                                     |
| `RateLimitError`          | 429 responses. exposes `retryAfterMs` and `limitedBy` when the server provided them.                 |
| `UsageAllocationError`    | the org's plan limit was hit. exposes `reason` (`credit_limit`, `concurrency_limit`, …) and `usage`. |
| `ValidationError`         | 4xx caused by a bad request (`invalid_url`, `url_too_long`, `blocked_url`, …).                       |
| `NotFoundError`           | 404 responses (e.g. unknown async `jobId`).                                                          |
| `ServiceUnavailableError` | 503 responses (`service_unavailable`). the api is temporarily unavailable — transient, retry it.     |
| `TransportError`          | network failures, aborts, non-json responses, request body read failures.                            |
| `CrawlbruleeError`        | base class — used for any other api error. always has `status`, `errorName`, `message`.              |

```ts
import { Crawlbrulee, RateLimitError, UsageAllocationError } from '@crawlbrulee/sdk'

const crawlbrulee = new Crawlbrulee({ apiKey: 'cwbl_…' })
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

`RateLimitError` (429) and `ServiceUnavailableError` (503) are the two transient ones — both are worth retrying with
backoff, and a 429 carries a `retryAfterMs` hint when the server sent one. a 503 means our side couldn't serve the
request for a moment; it says nothing about your credentials, so it is **not** a reason to rotate your api key. a key
that is genuinely missing, invalid, or expired comes back as a 401 and raises `AuthenticationError` instead.

for exhaustive branching, switch on `err.errorName` — the literal-typed union is exported as `ApiErrorName`. the
`isCrawlbruleeError(err)` type guard narrows an `unknown` to the base error. the api docs carry the canonical
[error reference](https://crawlbrulee.com/docs/errors) — every `errorName`, what causes it, and how to recover.

## cancellation and timeouts

every method accepts an `AbortSignal`:

```ts
const controller = new AbortController()
const page = crawlbrulee.scrape({ url: 'https://slow.example.com' }, { signal: controller.signal })

setTimeout(() => controller.abort(), 5_000)
```

the per-call `timeoutMs` and the caller's signal are composed — whichever fires first wins. a fired timeout surfaces as
a `TransportError` with `errorName: 'request_timeout'`; an aborted signal as `errorName: 'client_closed_request'`.

---

## development

```bash
pnpm install
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm build        # tsup → dist/
```

the sdk has zero runtime dependencies on purpose. please keep it that way when contributing.

## part of the crawlbrulee toolkit

one api, many ways to call it:

- **[js/ts sdk](https://github.com/crawlbrulee/crawlbrulee-js)** — `@crawlbrulee/sdk` (this one)
- **[python sdk](https://github.com/crawlbrulee/crawlbrulee-py)** — `crawlbrulee` on pypi
- **[cli](https://github.com/crawlbrulee/crawlbrulee-cli)** — `npx crawlbrulee`
- **[mcp server](https://github.com/crawlbrulee/crawlbrulee-mcp)** — `@crawlbrulee/mcp`, for ai agents
- **[agent skills](https://github.com/crawlbrulee/crawlbrulee-skills)** — for skills-aware coding agents

docs: [crawlbrulee.com/docs](https://crawlbrulee.com/docs) · dashboard: [dashboard.crawlbrulee.com](https://dashboard.crawlbrulee.com)

## license

[AGPL-3.0-only](./LICENSE)
