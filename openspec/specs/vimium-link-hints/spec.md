# vimium-link-hints Specification

## Purpose
TBD - created by archiving change vimium-hints-ux-polish. Update Purpose after archive.
## Requirements
### Requirement: f key activates hint overlay in list mode
When the message list is the active view (no reader, no modal, focus not in a text input), pressing `f` SHALL render a single-letter badge overlaid on each visible message row. The app SHALL wait for one more keypress; pressing a letter matching a badge SHALL open the corresponding message; pressing `Escape` or any unrecognised key SHALL cancel hint mode without opening a message.

#### Scenario: f activates hints on list
- **WHEN** the message list is visible, no modal is open, focus is not in an input, and the user presses `f`
- **THEN** each visible message row displays a lettered badge (a, b, c … in order of appearance)

#### Scenario: Letter press opens message
- **WHEN** hint mode is active on the list and the user presses a letter that matches a badge
- **THEN** the corresponding message opens in the reader and hint mode ends

#### Scenario: Escape cancels hint mode on list
- **WHEN** hint mode is active on the list and the user presses `Escape`
- **THEN** all badges are removed and no message is opened

#### Scenario: Unrecognised key cancels hint mode on list
- **WHEN** hint mode is active on the list and the user presses a key that does not match any badge label
- **THEN** all badges are removed and no message is opened

#### Scenario: Hint count capped at 26
- **WHEN** more than 26 message rows are visible and the user presses `f`
- **THEN** only the first 26 rows receive badges (a–z); rows beyond index 25 have no badge

---

### Requirement: f key activates hint overlay in reader mode — links
When the reader is the active view (no modal, focus not in a text input, not in HTML iframe mode), pressing `f` SHALL render a single-letter badge near each hyperlink rendered in the message body. Pressing the matching letter SHALL open the link in a new browser tab; pressing `Escape` or an unrecognised key SHALL cancel.

#### Scenario: f activates link hints in reader
- **WHEN** the reader is open in text or simple mode, no modal is active, and the user presses `f`
- **THEN** each `.mb-link` anchor in the body receives a lettered badge

#### Scenario: Letter press follows link
- **WHEN** hint mode is active in the reader and the user presses the letter matching a link badge
- **THEN** the link's `href` opens in a new tab (`target="_blank"`, `rel="noopener noreferrer"`) and hint mode ends

#### Scenario: f hint mode suppressed in HTML iframe mode
- **WHEN** the reader is displaying the HTML iframe (mode = html) and the user presses `f`
- **THEN** hint mode does NOT activate (the keypress may be captured by the iframe)

#### Scenario: Escape cancels link hints
- **WHEN** link hint mode is active in the reader and the user presses `Escape`
- **THEN** all badges are removed and no link is opened

---

### Requirement: f key activates hint overlay in reader mode — attachments
When reader hint mode activates, attachment chips (if any) SHALL also receive badges alongside link badges, sharing the same letter sequence. Pressing the matching letter SHALL trigger the attachment's primary action (download or preview).

#### Scenario: Attachment chips receive badges
- **WHEN** the reader has attachments and the user presses `f`
- **THEN** each attachment chip receives a badge letter, continuing the sequence after the last link badge

#### Scenario: Letter press triggers attachment action
- **WHEN** hint mode is active and the user presses the letter matching an attachment badge
- **THEN** the attachment's primary action is triggered and hint mode ends

---

### Requirement: Hint badge visual style
Hint badges SHALL be small square elements (monospace font, ~14 px tall, ~18 px wide) positioned at the top-left corner of their target element using `position: fixed` coordinates from `getBoundingClientRect()`. In light mode the badge SHALL use a yellow/amber background with dark text. In dark mode the badge SHALL use a dark background with light text. Badges SHALL be rendered above all other content (high `z-index`).

#### Scenario: Badge visible in light mode
- **WHEN** hint mode is active and the OS/app is in light mode
- **THEN** badges display with a yellow/amber background (#fbbf24 or equivalent) and dark (#111) text

#### Scenario: Badge visible in dark mode
- **WHEN** hint mode is active and the OS/app is in dark mode
- **THEN** badges display with a dark background and light text, remaining clearly readable

#### Scenario: Badge does not obscure target text excessively
- **WHEN** badges are displayed
- **THEN** each badge is positioned at the leading edge of the target and does not cover the full target element

---

### Requirement: HintOverlay component API
A reusable `HintOverlay.svelte` component SHALL accept `targets: HintTarget[]` and `onCancel: () => void` props, where `HintTarget = { el: HTMLElement; label: string; onActivate: () => void }`. It SHALL render all badges, handle keydown events at the window level, call `onActivate` on match, and call `onCancel` on `Escape` or unrecognised key. It SHALL unmount itself (via parent state change) after any activation or cancellation.

#### Scenario: Component renders correct number of badges
- **WHEN** HintOverlay is mounted with N targets
- **THEN** N badge elements are rendered, each displaying its `label`

#### Scenario: Component cleans up event listeners on unmount
- **WHEN** hint mode ends and HintOverlay unmounts
- **THEN** no stale `keydown` listener remains on `window`

