## ADDED Requirements

### Requirement: Three selectable rendering modes per message
The reader SHALL support three body rendering modes — **Text**, **Simple**, and **HTML** — selectable per message from a segmented control (`[ Aa │ ≈ │ </> ]`) in the reader header. The default mode SHALL be resolved as: Text when a `text/plain` part exists, otherwise Simple. HTML mode SHALL NEVER be selected automatically; it SHALL only be entered by explicit user action.

#### Scenario: Plain-text message defaults to Text mode
- **WHEN** a message containing a `text/plain` part is opened
- **THEN** it renders in Text mode by default

#### Scenario: HTML-only message defaults to Simple mode
- **WHEN** a message with only a `text/html` part (no `text/plain`) is opened
- **THEN** it renders in Simple mode by default, not HTML mode

#### Scenario: HTML mode is opt-in only
- **WHEN** a message is opened
- **THEN** HTML mode is entered only after the user selects it from the header toggle

---

### Requirement: Mode preference persistence
The Text and Simple mode selections SHALL be persisted as a global default in the settings store (`idb:settings`) and restored when the next message opens. HTML mode SHALL NOT be persisted as a global default; it applies to the current message only and resets when a new message is opened.

#### Scenario: Text/Simple selection persists across messages
- **WHEN** the user selects Text or Simple mode for a message
- **THEN** the next message opens in that mode by default

#### Scenario: HTML selection does not persist
- **WHEN** the user selects HTML mode for a message, then opens another message
- **THEN** the next message opens in the previously persisted Text or Simple mode, not HTML mode

---

### Requirement: Text mode renders escaped plain text
Text mode SHALL render the `text/plain` part as escaped text in the normal DOM with no HTML parsing. Plain-text bodies SHALL be linkified after escaping (escape-first, then linkify), restricting to `http`, `https`, and `mailto` schemes only. When the part declares `format=flowed` (RFC 3676), soft line breaks SHALL be unwrapped before display.

#### Scenario: Markup in plain text is not interpreted
- **WHEN** a `text/plain` body contains the literal characters `<script>alert(1)</script>`
- **THEN** those characters are displayed verbatim and no script executes

#### Scenario: format=flowed is unwrapped
- **WHEN** a `text/plain; format=flowed` body contains soft-wrapped lines
- **THEN** continuation lines are joined into paragraphs for display

#### Scenario: Plain-text URLs become clickable links
- **WHEN** a `text/plain` body contains `https://example.com`
- **THEN** it is rendered as a clickable anchor that opens externally

---

### Requirement: Simple mode converts HTML to readable text
Simple mode SHALL convert the `text/html` part to readable plain text server-side (via `html2text`), preserving link URLs in footnote style, and render the result as escaped DOM text. Simple mode SHALL NOT use an iframe and SHALL NOT load any remote resources.

#### Scenario: HTML email becomes readable text
- **WHEN** an HTML-only marketing email is rendered in Simple mode
- **THEN** its text content and link URLs are readable and no remote resource is requested

#### Scenario: No executable content survives Simple mode
- **WHEN** an HTML body containing `<script>` and `on*` handlers is rendered in Simple mode
- **THEN** no script executes and no event handler is present in the DOM

---

### Requirement: HTML is sanitized server-side before rendering
HTML bodies SHALL be sanitized in `mailbrus-server` (via `ammonia`) before being sent to the client, using an allowlist of tags and attributes. The sanitizer SHALL remove `script`, `noscript`, `iframe`, `object`, `embed`, `applet`, `form`, `input`, `button`, `meta`, `link`, and `base` elements, all `on*` event-handler attributes, all `id`/`name` attributes, and SHALL restrict `href` to `http`/`https`/`mailto` schemes. The `style` attribute SHALL be stripped.

The sanitized HTML SHALL then pass through a `lol_html` rewrite pass that:
- rewrites `cid:X` in `src` attributes → `/api/messages/:id/cid/X`
- rewrites remote (`http`/`https`) `src` attributes → `data-mb-src` (neutralized), incrementing a `has_remote` count

#### Scenario: Dangerous elements stripped
- **WHEN** an HTML body containing `<script>`, `<iframe>`, and `<form>` is sanitized
- **THEN** none of those elements appear in the sanitized output

#### Scenario: javascript: URLs removed
- **WHEN** an anchor has `href="javascript:alert(1)"`
- **THEN** the sanitized anchor has no `javascript:` href

#### Scenario: Event handlers removed
- **WHEN** an element has `onload`/`onerror`/`onclick` attributes
- **THEN** the sanitized element has no `on*` attributes

---

### Requirement: HTML mode renders inside a sandboxed iframe
HTML mode SHALL render the sanitized HTML inside an `<iframe srcdoc>` whose `sandbox` attribute includes `allow-popups allow-popups-to-escape-sandbox` but omits both `allow-same-origin` and `allow-scripts`. This gives the content a null origin, no script execution, and allows links to open in the system browser as normal (non-sandboxed) tabs. The iframe document SHALL carry an injected `<meta http-equiv="Content-Security-Policy">` of at least `default-src 'none'; img-src * data:; style-src 'unsafe-inline'; script-src 'none'`. The iframe SHALL inject `<base target="_blank" rel="noopener noreferrer">` so all links open externally without requiring per-link `target` attributes. The iframe SHALL force `color-scheme: light` to ensure email content is legible regardless of the app's dark-mode setting.

#### Scenario: iframe sandbox blocks scripts and same-origin
- **WHEN** a message is rendered in HTML mode
- **THEN** the iframe's `sandbox` attribute contains `allow-popups` and `allow-popups-to-escape-sandbox` but neither `allow-scripts` nor `allow-same-origin`

#### Scenario: Links open in the system browser
- **WHEN** the user clicks a link inside the HTML email iframe
- **THEN** it opens in a new browser tab outside the sandboxed iframe context

#### Scenario: CSP present on email document
- **WHEN** the email HTML document is rendered
- **THEN** it includes a CSP with `default-src 'none'` and `script-src 'none'`

#### Scenario: email content cannot reach the app origin
- **WHEN** sanitized HTML attempts to access the parent window or app cookies
- **THEN** the access is blocked by the null-origin sandbox

#### Scenario: iframe renders with white background in dark mode
- **WHEN** the app is in dark mode and a message is rendered in HTML mode
- **THEN** the iframe document has a white background and dark text, matching email authoring assumptions

---

### Requirement: Remote content is blocked by default with per-message opt-in
Remote resources (images, fonts, stylesheets referenced by absolute `http(s)` URLs) SHALL be neutralized during sanitization so they do not load automatically. When a message contains remote resources (`has_remote > 0`), the reader SHALL surface a "load remote content" banner above the iframe. Loading remote content SHALL be an explicit per-message user action. The load decision SHALL be persisted per message ID in `idb:settings` and restored when the message is reopened.

#### Scenario: Tracking pixel does not load by default
- **WHEN** an HTML email containing a remote `<img>` is opened in HTML mode
- **THEN** no request is made to the remote URL and a "load remote content" banner is shown

#### Scenario: User loads remote content
- **WHEN** the user activates "load remote content"
- **THEN** the remote resources load and the banner is dismissed

#### Scenario: Load decision persists on reopen
- **WHEN** the user loaded remote content for a message, then closes and reopens it
- **THEN** remote content loads immediately without showing the banner again

---

### Requirement: Inline cid: resources resolve to a same-origin endpoint
Inline `cid:` references SHALL be rewritten to a same-origin endpoint (`/api/messages/:id/cid/:cid`) that serves the corresponding embedded part. Inline `cid:` images SHALL be shown by default (they are embedded, not remote). The endpoint SHALL validate that the requested `cid` belongs to the requested message.

#### Scenario: Inline image displays without remote fetch
- **WHEN** an HTML email references `<img src="cid:logo@x">` with a matching embedded part
- **THEN** the image is served from the same-origin cid endpoint and displayed by default

#### Scenario: cid not belonging to the message is rejected
- **WHEN** a cid endpoint request references a cid that is not part of the message
- **THEN** the request is rejected

---

### Requirement: Open original HTML in system browser
The reader SHALL provide an action in HTML mode to save the message's original (pre-sanitization) `text/html` body to `~/.cache/mailbrus/html/<id>.html` (respecting `$XDG_CACHE_HOME`) and open it in the system browser via the OS file-open mechanism. This allows the user to view full-fidelity rendering outside the sandboxed iframe when desired.

#### Scenario: Original HTML opens in system browser
- **WHEN** the user clicks "Open in browser" in HTML mode
- **THEN** the server writes the raw HTML part to the cache directory and opens it in the default browser

#### Scenario: File is scoped to the message
- **WHEN** the cache file is written
- **THEN** it is named after the message ID and stored in `~/.cache/mailbrus/html/`
