# Changelog

All notable changes to `@crawlbrulee/sdk` are documented here.

This project follows [Semantic Versioning](https://semver.org). While on `0.x`, minor versions may include breaking changes.

## 0.4.0 (2026-07-03)

### Added

- **`response_meta.usage` envelope.** Scrape responses and the map response now carry usage accounting at `response_meta.usage`: `{ credits, proxy, cache_hit }` — `credits` is the credits charged (`0` on a cache hit), `proxy` is the resolved proxy tier actually used (`'none' | 'basic' | 'advanced'`, never `'auto'`), and `cache_hit` indicates whether the result was served from cache.
  - `ScrapeResponse.response_meta` (required).
  - `MapResponse.response_meta.usage` (sibling to the existing `pagination` and `truncation`).
  - `AsyncJobStatusResponse.response_meta` (optional; present only when the job is in the terminal `done` state).
  - `ScrapeCompleteWebhookData.response_meta` (delivered on every `scrape.complete` webhook).
- New exported types: `Usage`, `ResponseMeta`, `ResolvedProxyTier`, and `MapResponseMeta`.
