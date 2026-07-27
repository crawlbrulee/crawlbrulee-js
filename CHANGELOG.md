# changelog

all notable changes to `@crawlbrulee/sdk` are documented here.

this project follows [Semantic Versioning](https://semver.org). while on `0.x`, minor versions may include breaking changes.

## 0.8.0 (2026-07-27)

### removed

- **`ScrapeCache.ignore_query_params` is gone**, because the api no longer accepts it — `cache` is
  strict, so a request carrying the field is rejected. `max_age` is now the only cache control.
  if you were setting it, drop it and send the url you actually want cached: every non-tracking
  query parameter is part of the cache key, so `https://example.com/page` and
  `https://example.com/page?ref=x` are separate entries.

### changed

- the `url` field is documented more precisely: known tracking parameters (`utm_*`, `mtm_*`, `ga_*`,
  `pk_*`, `gclid`, `fbclid`, `msclkid`, and more) are removed before the page is fetched, so they
  reach neither the target site nor the cache key. every other query parameter is kept verbatim.

## 0.7.1 (2026-07-19)

### changed

- internal: the package is now built with tsdown (previously tsup) on TypeScript 6. no api changes —
  the exported types and runtime behaviour are identical, and the published files are unchanged.

## 0.7.0 (2026-07-15)

### changed

- **proxy tier types now match the supported API surface.** `ProxyTier` is `'basic' | 'advanced' | 'auto'`
  and `ResolvedProxyTier` is `'basic' | 'advanced'`. this is a type-only change — no runtime behaviour is affected,
  and any value outside these was already rejected by the api.

### fixed

- the `User-Agent` header now reports the real package version (it had drifted behind the release).

## 0.6.0 (2026-07-14)

### changed

- **screenshots.** in the rare case a screenshot can't be captured, we still return the rest of your requested outputs
  and leave out the `screenshot` field. `ScrapeResponse.screenshot` stays optional (`ScreenshotResult | undefined`); guard
  with `page.screenshot?.url`.

### changed (docs)

- clarified that `proxy` defaults to `auto` (starts at basic, escalates to advanced on failure; billed at the delivered tier)
  in the `ProxyTier` docstring.

## 0.5.0 (2026-07-13)

### fixed

- **async status response field names now match the api (`job_id`, `created_at`).** `AsyncJobStatusResponse` previously
  declared the pre-June camelCase wire format (`jobId`, `createdAt`), leaving those fields `undefined` against the live
  snake_case api. the sdk now mirrors the snake_case wire format 1:1.

### changed (docs)

- default proxy tier is now `auto` (tries the basic tier first, escalates to advanced on failure; billed at the delivered tier).
  docstring-only — the sdk still omits the field when unset and lets the server apply the default.
  ""

## 0.4.0 (2026-07-03)

### added

- **`response_meta.usage` envelope.** scrape responses and the map response now carry usage accounting at
  `response_meta.usage`: `{ credits, proxy, cache_hit }` — `credits` is the credits charged (`0` on a cache hit), `proxy`
  is the resolved proxy tier actually used (`'basic' | 'advanced'`, never `'auto'`), and `cache_hit` indicates
  whether the result was served from cache.
  - `ScrapeResponse.response_meta` (required).
  - `MapResponse.response_meta.usage` (sibling to the existing `pagination` and `truncation`).
  - `AsyncJobStatusResponse.response_meta` (optional; present only when the job is in the terminal `done` state).
  - `ScrapeCompleteWebhookData.response_meta` (delivered on every `scrape.complete` webhook).
- new exported types: `Usage`, `ResponseMeta`, `ResolvedProxyTier`, and `MapResponseMeta`.
