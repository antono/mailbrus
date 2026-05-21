## 1. Backend — MIME extraction (mailbrus-server)

- [ ] 1.1 Extend `parse_message_body` to expose both representations: `text` (from `text/plain` part) and `html` (from `text/html` part), plus a `has_plain: bool` and `has_html: bool`
- [ ] 1.2 Collect `cid:` inline parts (multipart/related) into a per-message map: `cid → part index + content-type`
- [ ] 1.3 Add `format=flowed` (RFC 3676) detection on the `text/plain` part; record the flag in the JSON response

## 2. Backend — Sanitization pipeline

- [ ] 2.1 Add deps: `ammonia`, `html2text`, `lol_html`
- [ ] 2.2 Implement `sanitize_html(html) -> String` with the email allowlist (design Decision 4): allowed tags/attrs, drop `script/iframe/object/embed/applet/form/input/button/meta/link/base`, strip all `on*` and `id`/`name`
- [ ] 2.3 Restrict `a[href]` to `http`/`https`/`mailto`; drop `javascript:`/`vbscript:`/`data:` hrefs
- [ ] 2.4 Implement CSS `style` attribute filtering: allowlist safe properties, block `position:fixed/absolute`, `@import`, remote `url()`, `expression()` (or strip `style` entirely behind a flag)
- [ ] 2.5 `lol_html` pass: rewrite `cid:X` → `/api/messages/:id/cid/X`; rewrite remote `src`/`background` → `data-mb-src` (neutralized) and return a `has_remote` count
- [ ] 2.6 Implement `html_to_text(html) -> String` via `html2text` with footnote-style link preservation and word wrap (Simple mode)
- [ ] 2.7 Unit tests: known XSS vectors (script, on*, javascript:, malformed/entity-encoded, DOM-clobbering) all neutralized; cid rewrite correct; remote neutralized

## 3. Backend — Endpoints

- [ ] 3.1 `GET /api/messages/:id?mode=text|simple|html` returns the requested representation (text raw / html2text / sanitized html) + `has_remote`, `has_plain`, `has_html`
- [ ] 3.2 `GET /api/messages/:id/cid/:cid` — serve the inline part bytes with its content-type; validate `cid` belongs to `:id`; unpredictable/scoped lookup
- [ ] 3.3 (Optional) `GET /api/proxy?url=` — fetch remote resource server-side: scheme allowlist, block private/loopback/link-local IPs (SSRF guard), enforce timeout + max size, strip referrer, no redirects to private targets
- [ ] 3.4 Add `tracing::debug!` logs under `[render]` prefix for sanitization (tags dropped, remote count) and cid/proxy requests

## 4. Frontend — Reader rendering modes (Reader.svelte)

- [ ] 4.1 Add mode state to the reader: `'text' | 'simple' | 'html'`; resolve default (plain present → text; html-only → simple; never auto-html)
- [ ] 4.2 Add the header mode toggle (segmented control `[ Aa │ ≈ │ </> ]`) alongside the existing `sub-icon` buttons; keyboard-accessible
- [ ] 4.3 TEXT mode: keep current `{parts.main}` escaped DOM rendering; apply `format=flowed` unwrapping when flagged
- [ ] 4.4 SIMPLE mode: render the `html2text` output as escaped DOM text
- [ ] 4.5 HTML mode: render sanitized html inside `<iframe sandbox="" srcdoc={html}>` with the `<meta>` CSP injected (design Decision 5); size the iframe to content height
- [ ] 4.6 `text/plain` linkification: escape-first-then-linkify; restrict to `http`/`https`/`mailto`

## 5. Frontend — Remote content gating

- [ ] 5.1 When `has_remote > 0` in HTML mode, show a "This message has remote content — Load" banner above the iframe
- [ ] 5.2 On "Load", re-render with remote `data-mb-src` restored to real `src` (direct or via `/api/proxy`)
- [ ] 5.3 Persist the per-message/per-sender "load remote" decision (settings store / `idb:settings`)

## 6. Frontend — Mode preference persistence

- [ ] 6.1 Add a global default-mode setting (`text` default) to the settings store
- [ ] 6.2 (Optional) per-sender mode override map; resolve sender override before global default
- [ ] 6.3 Restore the resolved mode when a message opens; update on toggle

## 7. Tauri hardening (src-tauri)

- [ ] 7.1 Set a restrictive app CSP in `tauri.conf.json`
- [ ] 7.2 Verify the email iframe (null origin) cannot access `window.__TAURI__` or the parent `window` — add an automated assertion/test
- [ ] 7.3 Confirm `cid:`/remote resources route only through the HTTP API; no `asset:`/custom protocol exposure to email content

## 8. Tests & docs

- [ ] 8.1 Backend: corpus test of real-world HTML emails (newsletter, marketing, signed/plain) through all three modes
- [ ] 8.2 Frontend: rendering-mode switching, remote-content banner, iframe sandbox attributes present
- [ ] 8.3 Security regression suite: sanitizer bypass vectors stay neutralized; CSP present in iframe; `window.__TAURI__` undefined in iframe
- [ ] 8.4 Document the security model (link RESEARCH.md) and the debug logging (`RUST_LOG=mailbrus_server=debug`)
