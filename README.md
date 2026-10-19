# n8n-nodes-captchano

This is an [n8n](https://n8n.io/) community node for [CaptchaNo](https://captchano.com), a
captcha-solving API. It lets your workflows and AI agents solve **reCAPTCHA v2, v3 and
Enterprise**, **Cloudflare Turnstile**, **DataDome** and **image** captchas, fetch results by
task ID, and check your account balance.

Solves run on CaptchaNo's own solving infrastructure. Failed solves are never billed.

> **Authorised automation only.** Use this node only on websites you own, or where you have
> explicit permission to automate (for example QA and testing of your own forms, or
> accessibility tooling). Respect each site's terms of service and applicable law.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Usage](#usage)
- [Example workflow](#example-workflow)
- [Compatibility](#compatibility)
- [Resources](#resources)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/):

1. In n8n, open **Settings → Community Nodes**.
2. Select **Install**.
3. Enter `n8n-nodes-captchano` and confirm.

The node then appears in the nodes panel as **CaptchaNo**.

## Credentials

1. Create an API key at [captchano.com/dashboard/keys](https://captchano.com/dashboard/keys).
   Keys start with `cn-`.
2. In n8n, create a new **CaptchaNo API** credential and paste the key.
3. Select **Test** — n8n calls `GET /v1/balance` to confirm the key works.

The key is sent as `Authorization: Bearer cn-...` to `https://api.captchano.com`.

## Operations

### Captcha → Solve

Submits a captcha and returns the solution. Fields depend on the **Captcha Type**:

| Captcha Type | Required fields | Optional (Additional Fields) | Returns |
| --- | --- | --- | --- |
| reCAPTCHA V2 | Page URL, Site Key | Invisible, Proxy, User Agent | `token` |
| reCAPTCHA V3 | Page URL, Site Key | Action, Min Score (0.1–0.9), Proxy, User Agent | `token` |
| reCAPTCHA Enterprise | Page URL, Site Key | Action, Proxy, User Agent | `token` |
| Turnstile | Page URL, Site Key | Action, cData, Page Data, Proxy, User Agent | `token` |
| DataDome | Page URL, Challenge URL, Proxy | User Agent | `cookie` |
| Image | Image (Base64 string or binary field) | User Agent | `text` |

Proxies use the form `scheme://user:pass@host:port` with `http`, `socks4` or `socks5`.

**Options**

- **Wait (Seconds)** — default `60`, max `120`. The API holds the request open until the
  captcha is solved or the wait elapses. `0` returns immediately with a task ID.
- **Poll Until Ready** — default on. If the task is still `solving` after the wait, the node
  polls `GET /v1/task/{id}` every 5 seconds.
- **Poll Timeout (Seconds)** — default `180`. How long to keep polling before giving up with
  an error that includes the task ID (you can then use **Get Result**).

**Output** — the full task object plus convenience fields at the top level:

```json
{
  "id": "…",
  "type": "recaptcha_v2",
  "status": "ready",
  "solution": { "token": "03AFcWeA…" },
  "cost": "…",
  "billedFrom": "…",
  "solveTime": 0,
  "createdAt": "…",
  "token": "03AFcWeA…"
}
```

`token` is set for reCAPTCHA / Turnstile, `cookie` for DataDome and `text` for image captchas.

### Captcha → Get Result

Fetches a task by ID (`GET /v1/task/{id}`). Solutions stay retrievable for 10 minutes. The
task is returned as-is, including `status: "solving"` or `status: "failed"`.

### Account → Get Balance

Returns `{ "balance": "12.3400", "currency": "USD" }` (`GET /v1/balance`).

### Errors and Continue On Fail

Every API error code is turned into a clear n8n error message with a hint on how to fix it:
`invalid_api_key`, `insufficient_balance`, `unsupported_type`, `invalid_sitekey`,
`proxy_required`, `proxy_unreachable`, `score_not_met`, `unsolvable`, `capacity_unavailable`,
`rate_limited`, `task_not_found`, `upstream_error`.

With **Settings → On Error → Continue** enabled, a failed item is passed through with
`error` (message), `errorDescription` and, for failed solves, the full task plus the original
`apiError` object, so you can branch on it with an IF node.

## Usage

1. Find the captcha's **site key** on the target page (the `data-sitekey` attribute, or the
   `render=` parameter of the reCAPTCHA v3 script) and the **page URL**.
2. Add a **CaptchaNo** node, choose **Captcha → Solve**, select the type and fill in the fields.
3. Use `{{ $json.token }}` in a following node — for example as the `g-recaptcha-response`
   (reCAPTCHA) or `cf-turnstile-response` (Turnstile) form field in an HTTP Request node, or
   set `{{ $json.cookie }}` as the `datadome` cookie.

### As an AI Agent tool

The node sets `usableAsTool`, so you can attach it to an **AI Agent** node as a tool. Let the
model fill fields such as Page URL and Site Key with `$fromAI()`; the tool returns the task
JSON with the `token` / `cookie` / `text` at the top level.

## Example workflow

[`examples/solve-recaptcha-v2.json`](examples/solve-recaptcha-v2.json) solves the reCAPTCHA v2
on Google's public demo page (`https://www.google.com/recaptcha/api2/demo`, site key
`6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-`) and maps the token into a Set node.

To use it: in n8n select **⋯ → Import from File**, choose the JSON, then open the
**Solve reCAPTCHA v2** node and select your CaptchaNo credential.

## Compatibility

- Built with [`@n8n/node-cli`](https://www.npmjs.com/package/@n8n/node-cli) 0.52 against
  `n8n-workflow` 2.x (`n8nNodesApiVersion: 1`, strict mode).
- No runtime dependencies; all HTTP calls go through n8n's built-in
  `httpRequestWithAuthentication` helper.
- Works on self-hosted n8n with community nodes enabled. On older self-hosted versions, using a
  community node as an AI Agent tool may require `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`.

## Development

```bash
npm install
npm run build
npm run lint
npm run dev        # starts a local n8n with this node linked
```

`scripts/smoke-test.mjs` runs the credential test, Get Balance and a reCAPTCHA v2 solve
through the built node (`CAPTCHANO_TEST_API_KEY=cn-... node scripts/smoke-test.mjs`). It is not
included in the published package.

## Resources

- [CaptchaNo API documentation](https://captchano.com/captcha-solver-api)
- [CaptchaNo website](https://captchano.com)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- Support: [support@captchano.com](mailto:support@captchano.com)

## License

[MIT](LICENSE) © DishIs Technologies LLC
