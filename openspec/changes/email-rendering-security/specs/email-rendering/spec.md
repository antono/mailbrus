## ADDED Requirements

### Requirement: Three selectable rendering modes per message
The reader SHALL support three body rendering modes — **Text**, **Simple**, and **HTML** — selectable per message from a control in the reader header. The default mode SHALL be resolved as: Text when a `text/plain` part exists, otherwise Simple. HTML mode SHALL NEVER be selected automatically; it SHALL only be entered by explicit user action.

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

### Requirement: Text mode renders escaped plain text
Text mode SHALL render the `text/plain` part as escaped text in the normal DOM with no HTML parsing. When the part declares `format=flowed` (RFC 3676), soft line breaks SHALL be unwrapped before display.

#### Scenario: Markup in plain text is not interpreted
- **WHEN** a `text/plain` body contains the literal characters `<script>alert(1)</script>`
- **THEN** those characters are displayed verbatim and no script executes

#### Scenario: format=flowed is unwrapped
- **WHEN** a `text/plain; format=flowed` body contains soft-wrapped lines
- **THEN** continuation lines are joined into paragraphs for display

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
HTML bodies SHALL be sanitized in `mailbrus-server` (via `ammonia`) before being sent to the client, using an allowlist of tags and attributes. The sanitizer SHALL remove `script`, `noscript`, `iframe`, `object`, `embed`, `applet`, `form`, `input`, `button`, `meta`, `link`, and `base` elements, all `on*` event-handler attributes, all `id`/`name` attributes, and SHALL restrict `href` to `http`/`https`/`mailto` schemes.

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

### Requirement: HTML mode renders inside a null-origin sandboxed iframe
HTML mode SHALL render the sanitized HTML inside an `<iframe>` whose `sandbox` attribute omits both `allow-same-origin` and `allow-scripts`, giving the content a null origin and no script execution. The iframe document SHALL carry a Content-Security-Policy of at least `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'none'`.

#### Scenario: iframe sandbox blocks scripts and same-origin
- **WHEN** a message is rendered in HTML mode
- **THEN** the iframe's `sandbox` attribute contains neither `allow-scripts` nor `allow-same-origin`

#### Scenario: CSP present on email document
- **WHEN** the email HTML document is rendered
- **THEN** it includes a CSP with `default-src 'none'` and `script-src 'none'`

#### Scenario: email content cannot reach the app origin
- **WHEN** sanitized HTML attempts to access the parent window or app cookies
- **THEN** the access is blocked by the null-origin sandbox

---

### Requirement: Remote content is blocked by default with per-message opt-in
Remote resources (images, fonts, stylesheets referenced by absolute `http(s)` URLs) SHALL be neutralized during sanitization so they do not load automatically. When a message contains remote resources, the reader SHALL surface a "load remote content" action. Loading remote content SHALL be an explicit per-message user action.

#### Scenario: Tracking pixel does not load by default
- **WHEN** an HTML email containing a remote `<img>` is opened in HTML mode
- **THEN** no request is made to the remote URL and a "load remote content" affordance is shown

#### Scenario: User loads remote content
- **WHEN** the user activates "load remote content"
- **THEN** the remote resources load (directly or via the server proxy)

---

### Requirement: Inline cid: resources resolve to a same-origin endpoint
Inline `cid:` references SHALL be rewritten to a same-origin endpoint (`/api/messages/:id/cid/:cid`) that serves the corresponding embedded part. Inline `cid:` images SHALL be shown by default (they are embedded, not remote). The endpoint SHALL validate that the requested `cid` belongs to the requested message.

#### Scenario: Inline image displays without remote fetch
- **WHEN** an HTML email references `<img src="cid:logo@x">` with a matching embedded part
- **THEN** the image is served from the same-origin cid endpoint and displayed by default

#### Scenario: cid not belonging to the message is rejected
- **WHEN** a cid endpoint request references a cid that is not part of the message
- **THEN** the request is rejected
