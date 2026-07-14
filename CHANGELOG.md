# Changelog

All notable changes to `@crawlbrulee/sdk` are documented here.

This project follows [Semantic Versioning](https://semver.org). While on `0.x`, minor versions may include breaking changes.

## 0.6.0 (2026-07-14)

### Changed

- **Screenshots.** In the rare case a screenshot can't be captured, the rest of your requested outputs are still returned and the `screenshot` field is simply left out. `ScrapeResponse.screenshot` stays optional (`ScreenshotResult | undefined`); guard with `page.screenshot?.url`.
- **Screenshot custom viewport is now bounded.** `viewport.width`/`height` are integers in `[16, 10000]` and `device_scale_factor` is in `[1, 4]` (fractional allowed, defaults to 1). Out-of-range values are rejected with a `400`. Docstring-only — the SDK forwards the viewport unchanged.
- **`extract.images` output.** Image URLs now preserve their query string and resolve document-relative `src`s against the full page URL (browser parity), matching the links extractor. Visible output change for consumers; no type change.

### Changed (docs)

- Documented per-plan rate limits with separate sync/async buckets (Free 50/100, Starter 100/300, Pro 350/1000, Advanced 1000/3000). Sync `scrape` and `map` share the sync bucket; async submit has its own.
- Clarified that `proxy` defaults to `auto` (starts at basic, escalates to advanced on failure; billed at the delivered tier) in the `ProxyTier` docstring.

## 0.5.0 (2026-07-13)

### Fixed

- **Async status response field names now match the API (`job_id`, `created_at`).** `AsyncJobStatusResponse` previously declared the pre-June camelCase wire format (`jobId`, `createdAt`), leaving those fields `undefined` against the live snake_case API. The SDK now mirrors the snake_case wire format 1:1.

### Changed (docs)

- Default proxy tier is now `auto` (tries the basic tier first, escalates to advanced on failure; billed at the delivered tier). Docstring-only — the SDK still omits the field when unset and lets the server apply the default.
- API token prefix is now `cwbl_` (was `cble_`) in all docstring and README examples.

## 0.4.0 (2026-07-03)

### Added

- **`response_meta.usage` envelope.** Scrape responses and the map response now carry usage accounting at `response_meta.usage`: `{ credits, proxy, cache_hit }` — `credits` is the credits charged (`0` on a cache hit), `proxy` is the resolved proxy tier actually used (`'none' | 'basic' | 'advanced'`, never `'auto'`), and `cache_hit` indicates whether the result was served from cache.
  - `ScrapeResponse.response_meta` (required).
  - `MapResponse.response_meta.usage` (sibling to the existing `pagination` and `truncation`).
  - `AsyncJobStatusResponse.response_meta` (optional; present only when the job is in the terminal `done` state).
  - `ScrapeCompleteWebhookData.response_meta` (delivered on every `scrape.complete` webhook).
- New exported types: `Usage`, `ResponseMeta`, `ResolvedProxyTier`, and `MapResponseMeta`.
