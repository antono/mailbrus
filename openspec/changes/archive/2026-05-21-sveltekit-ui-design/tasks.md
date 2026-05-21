## Reference files

All Claude Design prototype files are at `reference/`. Consult these during implementation:
- `reference/screens.jsx` — React source for every component
- `reference/app.jsx` — state machine and keyboard handler
- `reference/tweaks-panel.jsx` — Tweaks panel
- `reference/colors_and_type.css` + `reference/styles.css` — copy verbatim
- `reference/data.js` — sample data to port
- `reference/REQUIREMENTS.md` — product requirements (resolve ambiguities here)

## 1. Stylesheets and global assets

- [x] 1.1 Copy `reference/colors_and_type.css` → `src/lib/styles/colors_and_type.css`
- [x] 1.2 Copy `reference/styles.css` → `src/lib/styles/styles.css`
- [x] 1.3 Import both stylesheets in `src/app.css` (global)
- [x] 1.4 Copy `reference/assets/mark.svg` → `src/lib/assets/mark.svg`
- [x] 1.5 Verify Geist font loads via Google Fonts CDN in browser

## 2. Sample data and utilities
<!-- reference/data.js, reference/screens.jsx (top: expandTime, initials, _fmtBytes, _attExt, splitSignature, buildHeaders, _buildContacts) -->

- [x] 2.1 Create `src/lib/data.ts` — typed TypeScript port of `reference/data.js` (accounts, folders, messages, bodies)
- [x] 2.2 Create `src/lib/utils.ts` — port `expandTime`, `initials`, `_fmtBytes`, `_attExt` from `reference/screens.jsx` lines 38–84
- [x] 2.3 Add `resolveGravatar` async function (SHA-256 via Web Crypto, module-level Map cache) — port from `reference/screens.jsx` lines 9–34
- [x] 2.4 Add `splitSignature` and `buildHeaders` functions — port from `reference/screens.jsx` lines 981–1033
- [x] 2.5 Add `buildContacts` function — port from `reference/screens.jsx` lines 687–704

## 3. Shared primitive components
<!-- reference/screens.jsx: Wordmark (114–120), Avatar (86–109), Breadcrumbs (128–145) -->

- [x] 3.1 Create `src/lib/components/Wordmark.svelte` — port `Wordmark` from `reference/screens.jsx:114`
- [x] 3.2 Create `src/lib/components/Avatar.svelte` — port `Avatar` from `reference/screens.jsx:86`
- [x] 3.3 Create `src/lib/components/Breadcrumbs.svelte` — port `Breadcrumbs` from `reference/screens.jsx:128`

## 4. Palette and pickers
<!-- reference/screens.jsx: Palette (150–276), AccountPicker (281–301), FolderPicker (306–325), CommandPalette (330–353) -->

- [x] 4.1 Create `src/lib/components/Palette.svelte` — port `Palette` from `reference/screens.jsx:150`
- [x] 4.2 Create `src/lib/components/AccountPicker.svelte` — port `AccountPicker` from `reference/screens.jsx:281`
- [x] 4.3 Create `src/lib/components/FolderPicker.svelte` — port `FolderPicker` from `reference/screens.jsx:306`
- [x] 4.4 Create `src/lib/components/CommandPalette.svelte` — port `CommandPalette` from `reference/screens.jsx:330`

## 5. Mail list screen
<!-- reference/screens.jsx: Paperclip (358–365), MailList (367–490) -->

- [x] 5.1 Create `src/lib/components/Paperclip.svelte` — port `Paperclip` SVG from `reference/screens.jsx:358`
- [x] 5.2 Create `src/lib/components/MailList.svelte` — port `MailList` from `reference/screens.jsx:367`; density variants in `reference/styles.css` (`.dens-dense`, `.dens-twoline`, `.dens-spacious`)
- [x] 5.3 Implement inline search bar (`/` key, real-time filter, Esc clears) — see `reference/screens.jsx:414`
- [x] 5.4 Implement mouse hover → cursor sync in message rows — see `reference/screens.jsx:441`
- [x] 5.5 Implement scroll-selected-into-view on cursor change — see `reference/screens.jsx:379`

## 6. Hint bar
<!-- reference/screens.jsx: HintBar (1266–1306), app.jsx (248–260) -->

- [x] 6.1 Create `src/lib/components/HintBar.svelte` — port `HintBar` from `reference/screens.jsx:1266`
- [x] 6.2 Wire hint bar visibility to `hintBar` tweak and list phase — see `reference/app.jsx:248`

## 7. Reader screen
<!-- reference/screens.jsx: HeadersPopover (1035–1067), Attachments (1081–1100), Reader (1102–1264) -->

- [x] 7.1 Create `src/lib/components/HeadersPopover.svelte` — port `HeadersPopover` from `reference/screens.jsx:1035`
- [x] 7.2 Create `src/lib/components/Attachments.svelte` — port `Attachments` from `reference/screens.jsx:1081`
- [x] 7.3 Create `src/lib/components/Reader.svelte` — port `Reader` from `reference/screens.jsx:1102`; signature dimming in `reference/styles.css` (`.mb-sig`)

## 8. Compose screen
<!-- reference/screens.jsx: RecipientInput (706–830), Compose (835–978) -->

- [x] 8.1 Create `src/lib/components/RecipientInput.svelte` — port `RecipientInput` from `reference/screens.jsx:706`
- [x] 8.2 Create `src/lib/components/Compose.svelte` — port `Compose` from `reference/screens.jsx:835`

## 9. Overlay dialogs
<!-- reference/screens.jsx: About (495–559), KeyboardHelp (564–684) -->

- [x] 9.1 Create `src/lib/components/About.svelte` — port `About` from `reference/screens.jsx:495`
- [x] 9.2 Create `src/lib/components/KeyboardHelp.svelte` — port `KeyboardHelp` from `reference/screens.jsx:564`

## 10. Tweaks panel
<!-- reference/tweaks-panel.jsx (full file), reference/app.jsx:8–14 (TWEAK_DEFAULTS) -->

- [x] 10.1 Create `src/lib/components/TweaksPanel.svelte` — port from `reference/tweaks-panel.jsx` (draggable, dark/accent/font/density/hintBar controls)
- [x] 10.2 Implement `localStorage` persistence — mirrors `useTweaks` hook in `reference/tweaks-panel.jsx`

## 11. App shell and state machine
<!-- reference/app.jsx (full file) → +page.svelte -->

- [x] 11.1 Rewrite `src/routes/+page.svelte` as Mailbrus app shell — port state declarations from `reference/app.jsx:44–57`
- [x] 11.2 Implement phase state machine — port from `reference/app.jsx:209–325`
- [x] 11.3 Apply `data-accent` and `.dark` to `document.documentElement` — see `reference/app.jsx:36–41`
- [x] 11.4 Apply `--font-app` CSS custom property on font tweak change — see `reference/app.jsx:16–19`

## 12. Keyboard handler
<!-- reference/app.jsx:108–207 (onKey handler) -->

- [x] 12.1 Add single `window` keydown listener — port `onKey` structure from `reference/app.jsx:108`
- [x] 12.2 Implement j/k/↑/↓ list navigation with clamp — `reference/app.jsx:176`
- [x] 12.3 Implement Enter (open reader), Esc (go back), / (search), c (compose) — `reference/app.jsx:186`
- [x] 12.4 Implement g-leader with 1.2 s timeout: g-i, g-a, g-s, g-d, g-f, g-A, g-g, G — `reference/app.jsx:155`
- [x] 12.5 Implement ⌘K / Ctrl+K command palette toggle — `reference/app.jsx:116`
- [x] 12.6 Implement ? keyboard help toggle — `reference/app.jsx:123`
- [x] 12.7 Implement j/k in reader (cycle messages), Esc in reader (close) — `reference/app.jsx:133`
- [x] 12.8 Add g-leader indicator overlay — see `reference/app.jsx:327`; styles in `reference/styles.css` (`.mb-leader`)

## 13. Visual verification
<!-- Open reference/Mailbrus.html in a browser as the pixel reference -->

- [x] 13.1 Open `reference/Mailbrus.html` in a browser to use as the pixel reference baseline
- [x] 13.2 Run `deno task dev` and verify AccountPicker matches `reference/Mailbrus.html`
- [x] 13.3 Verify FolderPicker and MailList (all three density modes) against `reference/Mailbrus.html`
- [x] 13.4 Verify Reader (signature dimming, headers popover, attachment pills) against `reference/Mailbrus.html`
- [x] 13.5 Verify Compose (autocomplete, word count, ⌘↵) against `reference/Mailbrus.html`
- [x] 13.6 Verify dark mode and all seven accent colors against `reference/Mailbrus.html`
- [x] 13.7 Verify all keyboard shortcuts work as specified in `reference/REQUIREMENTS.md` §5
- [x] 13.8 Run `deno task build` and confirm no build errors
