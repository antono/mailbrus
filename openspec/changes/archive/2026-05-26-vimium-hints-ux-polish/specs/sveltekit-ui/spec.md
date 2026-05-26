## ADDED Requirements

### Requirement: Reader sticky header animates on collapse and expand
When the reader scroll position crosses the threshold that triggers the `is-compact` state, the `.meta` section (From / To / Date rows) SHALL animate out with a smooth transition rather than disappearing instantly. The animation SHALL use CSS transitions on `max-height` and `opacity`. Expanding (scrolling back to top) SHALL animate in with the same transitions.

#### Scenario: Header collapses with animation on scroll
- **WHEN** the user scrolls the reader body past the threshold (scrollTop > 4 px)
- **THEN** the meta rows fade out and slide up over ~200 ms instead of disappearing instantly

#### Scenario: Header expands with animation on scroll back to top
- **WHEN** the user scrolls the reader body back above the threshold
- **THEN** the meta rows fade in and slide down over ~200 ms

#### Scenario: Animation does not cause layout reflow on subsequent messages
- **WHEN** the user opens a new message (scrollTop resets to 0)
- **THEN** the meta section is immediately visible with no lingering transition artifact

---

### Requirement: Plain-text part is preferred on first open
When a message is opened for the first time (no per-sender override and no global mode preference set), and the message has a `text/plain` part (`has_plain = true`), the app SHALL display the message in `text` mode regardless of the server's default render mode. If the message does NOT have a plain part, the existing fallback (server default → `simple`) SHALL apply unchanged.

#### Scenario: Plain part present, no preference set — shows text mode
- **WHEN** a message with `has_plain = true` is opened and no sender override or global mode preference exists
- **THEN** the reader displays the message in text mode (mode toggle shows "Aa" as active)

#### Scenario: No plain part — falls back to server default
- **WHEN** a message with `has_plain = false` is opened and no preference exists
- **THEN** the server's returned mode is used (typically `simple`)

#### Scenario: Sender override still respected
- **WHEN** a message is opened and a per-sender mode override exists
- **THEN** the override takes precedence over the plain-text-first default

#### Scenario: Global mode preference still respected
- **WHEN** a message with `has_plain = true` is opened and a global `email_mode` of `simple` is set
- **THEN** `simple` mode is used (explicit global preference overrides the default)

---

### Requirement: About dialog displays logo
The About dialog (`About.svelte`) SHALL display the Mailbrus logo image above the wordmark. The logo SHALL be rendered at a fixed size (64 × 64 px) with `object-fit: contain`, centered horizontally, with appropriate spacing between the logo and the wordmark below it.

#### Scenario: Logo visible in about dialog
- **WHEN** the user opens the About dialog
- **THEN** the `mailbrus.svg` logo is displayed at 64 × 64 px above the wordmark text

#### Scenario: Logo centered
- **WHEN** the about dialog is open
- **THEN** the logo is horizontally centered within the dialog card
