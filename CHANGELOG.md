# changelog

all notable changes to `@crawlbrulee/sdk` are documented here.

this project follows [Semantic Versioning](https://semver.org). while on `0.x`, minor versions may include breaking changes.

## 1.3.0 (2026-10-09)

### added

- **`extract.elements`**: read named values from the page by CSS selector. new request types `ScrapeElements`,
  `ScrapeElementSpec`, `ScrapeElementFieldSpec`, `ScrapeElementNestedFieldSpec`, `ScrapeElementLeafSpec` and
  `ScrapeElementOutput`, `elements` on `ScrapeResponse` (typed as `ScrapeElementValue` and `ScrapeElementObject`), and
  `elements_truncated` in `ScrapeWarningCode`. see [elements](https://crawlbrulee.com/docs/scrape/elements).
- **`screenshot_unavailable`** in `ScrapeWarningCode`: a screenshot was asked for, but the page came back without one.

### changed

- **docs only.** `cleanup.exclude_selectors` no longer skips the cache: a cached result is reused for a request that
  removes the same selectors. the type comments say so.
- **`metadata_truncated` is deprecated** in `ScrapeWarningCode`. metadata no longer has a size limit
  of its own, so new scrapes never send it; results stored before that change can still carry it.

## 1.2.1 (2026-10-07)

### changed

- **docs only.** screenshot and slice `url`s are signed links that expire 24 hours after the scrape (for an async
  scrape, 24 hours after it was submitted), so download the image and keep the file, not the link. an async job's
  status and result are available for 24 hours after you submit it; after that `getScrapeStatus()` and
  `getScrapeResult()` throw `NotFoundError`. the type comments and the readme say so. no code changes.

## 1.2.0 (2026-10-05)

### added

- **zero data retention.** `zero_data_retention` on `scrape`, `scrapeAsync` and `map`, `zero_data_retention_credit_cost` on `Usage` and `MapUsage` (optional, like the other cost parts), and `ZeroDataRetentionNotEnabledError` for the `403` (not an `AuthenticationError`; `'zero_data_retention_not_enabled'` is added to `ApiErrorName`). it keeps the result out of the shared cache and must be enabled for your organization. see [zero data retention](https://crawlbrulee.com/docs/zero-data-retention).
- the totals now include it: `total_credit_cost = ( engine_credit_cost × proxy_multiplier ) + screenshot_slicing_credit_cost + zero_data_retention_credit_cost` for a scrape, and without the slicing part for a map.

### removed

- **`credits` and `screenshot_slices`** are gone from `Usage`, and `credits` from `MapUsage`. they were deprecated in
  1.1.0. read `total_credit_cost` and `screenshot_slicing_credit_cost`, which always had the same values.

## 1.1.0 (2026-09-30)

### added

- **`page_status_code` on scrape results.** the http status the target site answered with for the final page, after
  redirects. it is on `ScrapeResponse` (from `scrape()`, `getScrapeResult()` and `waitForScrape()`) and on the
  `scrape.complete` webhook `data` for `success` deliveries. it is optional in the types, because older api versions do
  not send it.
- **`TargetUnreachableError`** — a `502` with `name: 'target_unreachable'` raises its own class. we could not reach the
  target site at all, so there is no page and you are not charged. the message is always "Could not reach the target
  site." and there are no `details`. retrying later may help; the sdk does not retry for you. returned by both `scrape`
  and `map`. `'target_unreachable'` is added to `ApiErrorName`. a `502` with any other name still raises the base
  `CrawlbruleeError`.
- **the usage breakdown.** `response_meta.usage` now explains its own price:
  `total_credit_cost = engine_credit_cost × proxy_multiplier + screenshot_slicing_credit_cost`.
  - `Usage` (scrape, async status, webhook) gains `total_credit_cost`, `engine_credit_cost`, `proxy_multiplier` and
    `screenshot_slicing_credit_cost`.
  - `MapUsage` gains `total_credit_cost`, `engine_credit_cost` and `proxy_multiplier` (a map makes no screenshots, so
    there is no slicing part).
  - all of them are optional in the types, because older api versions do not send them. to read the total either way,
    use `usage.total_credit_cost ?? usage.credits`.

### changed

- **a page with an error status is a result, not an error.** when the site answers with a 404, 410, 401, 503 or any other
  page, the api returns that page with its status in `page_status_code`, and `scrape()` resolves instead of throwing.
  this comes from the api, so it reaches every sdk version once the api ships it; this release adds the field and the
  docs. check `page_status_code` if your code relied on an error for a missing page.
- **what is billed follows the page's status.** 2xx and 4xx pages are billed, except 403, 407, 408, 429 and 451; 5xx
  pages are never billed. an unbilled page reports `0` in every cost field.
- **`NotFoundError` only means something on our side was not found**, like an unknown async job id. it never means the
  target page was not found.

### deprecated

- **`Usage.credits`** — use `total_credit_cost`, which always has the same value.
- **`Usage.screenshot_slices`** — use `screenshot_slicing_credit_cost`, which always has the same value. despite its
  name it is a 0/1 charge, not a count of slices.
- **`MapUsage.credits`** — use `total_credit_cost`.

the api still sends these fields and the types still have them. they will be removed in a future version.

## 1.0.1 (2026-09-21)

### changed

- **readme and package description rewritten.** they now lead with what crawlbrulee is: EU-native web
  scraping for AI agents & developers. new npm keywords. no code or api changes.

## 1.0.0 (2026-09-21)

### changed

- **first stable release.** no code or api changes since 0.16.1. from here on, breaking changes
  only come in a new major version.
- **license: Apache-2.0.** this package moves from AGPL-3.0-only to Apache-2.0. no code or api
  changes.
- **readme: the beta status note is gone.** the sdk is stable.

## 0.16.1 (2026-09-20)

### added

- **`unread_files` is a sixth `MapDiscoveryCapReason`.** `response_meta.truncation.discovery_cap_reason`
  can report `unread_files` when a sitemap file the site publishes could not be read at all this
  time — the request for it failed or was rate limited, or the file was not a readable sitemap.
  the api can return it; the type was missing it. unlike `time`, `file_budget`, `depth` and
  `file_size`, this one is often temporary, so asking again later can return a fuller map.

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
