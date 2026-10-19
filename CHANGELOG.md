# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-19

### Added

- `CaptchaNo API` credential (API key, sent as `Authorization: Bearer cn-...`) with a
  connection test against `GET /v1/balance`.
- `CaptchaNo` node, usable in regular workflows and as an AI Agent tool (`usableAsTool`).
  - **Captcha → Solve** for `recaptcha_v2`, `recaptcha_v3`, `recaptcha_enterprise`,
    `turnstile`, `datadome` and `image`, with per-type fields, a server-side wait of up to
    120 s and an optional "Poll Until Ready" fallback (polls `GET /v1/task/{id}` every 5 s).
    Output is the full task JSON plus top-level `token` / `cookie` / `text` shortcuts.
  - **Captcha → Get Result** by task ID.
  - **Account → Get Balance**.
  - Every API error code mapped to a clear `NodeApiError`; full `Continue On Fail` support.
- Example workflow `examples/solve-recaptcha-v2.json`.
