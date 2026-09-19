# changelog

all notable changes to `@crawlbrulee/sdk` are documented here.

this project follows [Semantic Versioning](https://semver.org). while on `0.x`, minor versions may include breaking changes.

## 0.16.0 (2026-09-17)

### changed (breaking)

- **the `http` engine replaces `text`.** `response_meta.usage.engine` now reports `http` when the
  plain fetch engine delivered the result (no JavaScript ran). it used to report `text`.
  `BillingEngine` is now `'http' | 'browser' | 'screenshot' | 'cache'` and `MapBillingEngine` is
  `'http' | 'cache'`. the credit base is unchanged (1 credit before the proxy multiplier). update
  any code that compares `engine` to `'text'`.

## 0.15.0 (2026-09-13)

### changed

- **map defaults are smaller.** `max_urls` now defaults to `5000` (was `100000`) and `limit` to
  `5000` (was `10000`); both maximums are unchanged (`100000` and `10000`). discovery itself stops
  at `max_urls`, so a smaller value is a cheaper and faster crawl, not just a shorter answer. the
  sdk sends only the fields you pass, so this is a server-side default change — nothing to update
  in your code unless you were relying on the old implicit values.
- **`MapTruncation.response_capped` means less than it used to.** because discovery stops at
  `max_urls`, a map that ran into that limit returns exactly `max_urls` links with
  `response_capped: false`. use `discovery_cap_reason` to tell whether more pages exist.

### added

- **three new fields on `MapTruncation`** (`response_meta.truncation`):
  - `discovery_capped: boolean` — sitemap discovery stopped before reading every sitemap file it
    found; when `true` the site has more pages than the map lists.
  - `sitemaps_skipped: number` — how many sitemap files were skipped or only partly read.
  - `discovery_cap_reason: MapDiscoveryCapReason | null` — which limit stopped discovery first,
    `null` when nothing did. only `max_urls` is actionable from the request.
- **`MapDiscoveryCapReason`** — new exported type,
  `'max_urls' | 'time' | 'file_budget' | 'depth' | 'file_size'`.

- **`AntibotBlockedError`** — a `403` with `name: 'antibot_blocked'` (the target site's bot
  protection blocked the request) now raises its own class instead of `AuthenticationError`,
  so callers can branch on it (raise the proxy tier, or skip the site) without mistaking it
  for a credentials problem. returned by both `scrape` and `map`. a `403` with an
  unrecognized name still falls back to `AuthenticationError`.
- **`TooManyRedirectsError`** — a `422` with `name: 'too_many_redirects'` (the target site
  redirected the request in a loop, or through more hops than the api follows) raises its own
  class. target-side like `AntibotBlockedError`: not a key problem and not a bad request, so it
  is neither `AuthenticationError` nor `ValidationError`. returned by both `scrape` and `map`.
- **`PageTooLargeError`** — a `422` with `name: 'page_too_large'` (the page's html was too large
  to process) raises its own class. about the page, not your request, so it is neither
  `AuthenticationError` nor `ValidationError`. it is terminal: the same url fails the same way,
  so do not retry it. returned by `scrape`.

## 0.13.1 (2026-09-03)

### fixed

- commonjs consumers now resolve the matching `index.d.cts` declarations instead of the esm
  `index.d.ts` file, preventing `TS1479` in projects that compile imports to `require()`.

## 0.13.0 (2026-09-02)

### changed (breaking)

- **map usage no longer exposes `screenshot_slices`.** the exported `MapUsage` type now
  contains only `credits`, `engine`, and `proxy`; scrape, async, and webhook usage retain the
  slice field. `MapUsage.engine` is narrowed to `text | cache`.

## 0.12.0 (2026-08-30)

### changed (breaking)

- **`response_meta.usage` now mirrors engine-aware billing.** `Usage.cache_hit` is removed.
  use `usage.engine === 'cache'` to identify a cache hit. every successful scrape, map,
  terminal async status, and successful completion webhook now reports
  `{ credits, engine, proxy, screenshot_slices }`.
- **credits reflect the delivered engine.** `engine` is `text` (1-credit base), `browser`
  (3), `screenshot` (5), or `cache` (0). the resolved `advanced` proxy tier multiplies
  that base by 5. `screenshot_slices` is `1` when this request produced slices and adds
  one flat credit outside the proxy multiplier; otherwise it is `0`.

## 0.11.1 (2026-08-17)

### changed (docs)

- improved the `advanced` proxy tier description to focus on its higher retrieval success rate.
  no request behavior, type, or response shape changed.

## 0.11.0 (2026-08-14)

### added

- **`service_unavailable` joined the `ApiErrorName` union, with a matching `ServiceUnavailableError` class.**
  the api now answers `503 service_unavailable` when it can't serve an authenticated request because of a
  transient failure on our side. it used to come back as `401 invalid_credentials`, which read as "your key
  is bad" and invited a pointless key rotation. the sdk maps it by name and by status, so a `503` with an
  unexpected body still raises `ServiceUnavailableError`. treat it as retryable — back off and try again;
  a genuinely missing, invalid, or expired key still raises `AuthenticationError` on a `401`.
- **four new `warnings` codes: `links_truncated`, `inline_images_truncated`, `raw_html_truncated`, and
  `metadata_truncated`**, alongside the existing `screenshot_truncated`. they say you got output, capped —
  a page is limited to 30 000 links, 10 000 inline images, 10 000 000 characters of body html, and
  2 000 000 characters of `<head>` html. the codes are now enumerated as the exported `ScrapeWarningCode`
  union; `ScrapeResponse.warnings` keeps accepting any `string`, so this is not a breaking change.
- **three `*_unavailable` warning codes: `links_unavailable`, `inline_images_unavailable`, and
  `metadata_unavailable`.** where the `*_truncated` codes mean you got output that was capped, these
  mean that section's extraction failed outright, so the field comes back omitted or empty while the
  rest of the scrape succeeds. that distinction is the point: an empty `links` array carrying
  `links_unavailable` is not a page without links, it's a page whose links we couldn't read. the page
  body has no such code — if it can't be extracted the scrape fails rather than returning a hollow
  `200`, and isn't billed. they join `ScrapeWarningCode`; `warnings` stays widened to `string`.

### changed (docs)

- **`screenshot.viewport.device_scale_factor` is capped at `3`, not `4`.** raster and stitch memory scale
  with the square of the ratio, so a `4` cost ~16× the pixels of a `1` for no gain in machine-readability.
  values above `3` are rejected with a `400`. the type was already `number`; only the documented range moved.
- **`warnings` is no longer described as fresh-scrapes-only.** it used to be: the api computed warnings on
  the sync scrape path and dropped them everywhere else. they are now stored with the result, so cache hits
  and async result fetches report the same codes, filtered to the outputs you requested —
  `raw_html_truncated` always surfaces, since a truncated body also feeds `markdown` and `cleaned_html`.
  the `*_unavailable` codes are the exception: they only ever reach the request they were produced for.

## 0.10.0 (2026-08-03)

### removed (breaking)

- **`overage_hard_cap` is no longer part of `UsageAllocationReason`.** the api used to return two
  reason codes for one condition: `credit_limit` when a plan had no headroom, `overage_hard_cap`
  when it did. they were mutually exclusive by plan — no org could ever see both — and meant the
  same thing to you: no credits left, refused until the cycle resets, same status and same remedy.
  they are now reported as `credit_limit` for every plan.

  if you branch on `overage_hard_cap`, fold that branch into your `credit_limit` case. exhaustive
  `switch` statements over `UsageAllocationReason` will stop type-checking against the removed
  member, which is the intended prompt to look.

## 0.9.0 (2026-07-28)

### added

- **`ScrapeResponse.requested_url`** — the url you requested, echoed verbatim, before any redirects.
  present on both the sync scrape response and the async result. it sits alongside `url`, which is
  now documented precisely: the url that was actually scraped, after any redirects, in normalised
  form — the base that `links`, `images`, and `internal` labels are computed against.
- **`unsupported_screenshot_output`** joined the `ApiErrorName` union. the sdk maps it to
  `ValidationError`, alongside `unsupported_content`.

### changed (docs)

- **screenshot-only requests.** when a screenshot can't be captured and you also requested other
  outputs, those are still returned and the `screenshot` field is left out — unchanged. a
  screenshot-only request that can't deliver now fails instead of returning an empty response:
  a `422` with `unsupported_screenshot_output` when the content type can't be screenshotted, a
  `500` when the capture itself failed — and isn't billed.
- **cache billing wording.** `response_meta.usage.credits` is `0` on a fully cached result — only
  parts we still had to compute fresh (e.g. a newly produced screenshot-slice variant) are charged.
- **links.** `PageLink.href` is the url as written on the page, resolved to an absolute url —
  verbatim otherwise (query string, fragment, and duplicates preserved; non-http(s) hrefs are
  dropped). `PageLink.internal` means same domain, with `www` and the bare domain equivalent;
  other subdomains are external.

## 0.8.0 (2026-07-27)

### removed

- **`ScrapeCache.ignore_query_params` is gone**, because the api no longer accepts it — `cache` is
  strict, so a request carrying the field is rejected. `max_age` is now the only cache control.
  if you were setting it, drop it and send the url you actually want cached:
  `https://example.com/page` and `https://example.com/page?ref=x` are separate entries.

### changed

- the `url` field is documented more precisely: known tracking parameters are removed before the page
  is fetched, so they reach neither the target site nor the cache. every other query parameter is kept
  verbatim.

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

- **`response_meta.usage` object.** scrape responses and the map response now carry usage accounting at
  `response_meta.usage`: `{ credits, proxy, cache_hit }` — `credits` is the credits charged (`0` on a cache hit), `proxy`
  is the resolved proxy tier actually used (`'basic' | 'advanced'`, never `'auto'`), and `cache_hit` indicates
  whether the result was served from cache.
  - `ScrapeResponse.response_meta` (required).
  - `MapResponse.response_meta.usage` (sibling to the existing `pagination` and `truncation`).
  - `AsyncJobStatusResponse.response_meta` (optional; present only when the job is in the terminal `done` state).
  - `ScrapeCompleteWebhookData.response_meta` (delivered on every `scrape.complete` webhook).
- new exported types: `Usage`, `ResponseMeta`, `ResolvedProxyTier`, and `MapResponseMeta`.
