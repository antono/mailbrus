## Why

mailbrus currently renders message bodies as escaped plain text only: `mailbrus-server::parse_message_body` extracts `text/plain` parts and the SvelteKit `Reader.svelte` interpolates them via `{parts.main}`, which Svelte auto-escapes. This is safe by *abstinence* — no HTML parser ever touches email content — but it means HTML-only mail (most marketing, newsletters, and modern correspondence) renders as nothing useful, or as raw markup.

The moment we render real `text/html` bodies, the full hostile-content threat surface opens: stored XSS via `<script>`/`on*` handlers/`javascript:` URLs, CSS overlay and exfiltration attacks, tracking pixels and remote-resource privacy leaks, and — uniquely for mailbrus — the risk that email JavaScript reaches the app's own origin (which can read the entire mailbox via the API) or, in the Tauri build, the native IPC bridge (`window.__TAURI__`).

This change defines a layered, defense-in-depth security model for rendering both `text/plain` and `text/html` email across both targets (browser PWA and Tauri webview), built around a user-facing 3-mode rendering model that keeps the safe path the default.

## What Changes

- **3-mode rendering model**, selectable per message from a toggle in the reader header:
  - **Text** — prefer the `text/plain` MIME part; render escaped in the normal DOM (today's behavior). Default whenever a plain-text part exists.
  - **Simple** — when there is no `text/plain` part, convert the HTML to readable text with `html2text` (or, optionally, a strict `ammonia`-minimal HTML subset) and render it in the normal DOM. No iframe — nothing executable survives. Default for HTML-only mail.
  - **HTML** — full-fidelity render of sanitized HTML inside a null-origin sandboxed `<iframe>` with a strict Content-Security-Policy and remote-content gating. **Never auto-selected**; always an explicit user opt-in.
- **Server-side sanitization in Rust** (`mailbrus-server`) using `ammonia` (allowlist) + `lol_html` (streaming attribute rewriting for `cid:`/`src`/`href`). Sanitization is the primary wall; the iframe is the load-bearing isolation backstop.
- **Remote-content blocking by default** with a per-message "load remote content" action; inline `cid:` images resolved to a same-origin attachment endpoint and shown by default.
- **Tauri hardening** so email content cannot reach the Tauri IPC bridge or custom protocols.
- **Safe `text/plain` handling**: escape-then-linkify ordering, `format=flowed` (RFC 3676) unwrapping.

## Capabilities

### New Capabilities

- `email-rendering`: the 3-mode body rendering model, server-side sanitization pipeline, iframe isolation + CSP, remote-content gating, `cid:` resolution, and safe plain-text rendering.

### Modified Capabilities

- `mailbrus-server-crate`: `parse_message_body` extended to expose both `text/plain` and sanitized `text/html` representations, a `cid:` attachment endpoint, and an optional remote-resource proxy endpoint.
- `sveltekit-frontend-scaffold`: `Reader.svelte` gains the mode toggle, the sandboxed-iframe HTML view, and the remote-content banner.

## Impact

- **Backend (`mailbrus-server`)**: new deps `ammonia`, `html2text`, `lol_html`; sanitization pipeline; `GET /api/messages/:id/cid/:cid`; optional `GET /api/proxy`.
- **Frontend (`src/`)**: `Reader.svelte` mode toggle + sandboxed iframe; remote-content banner; per-sender/global mode preference (persisted via the `frontend-pwa` settings store).
- **Tauri (`src-tauri`)**: app CSP and confirmation that injected IPC is not exposed to the email iframe.
- **Security posture**: even a sanitizer bypass is contained — worst case in HTML mode is a visually broken email, not mailbox exfiltration. Default path (Text/Simple) performs no executable parsing at all.
