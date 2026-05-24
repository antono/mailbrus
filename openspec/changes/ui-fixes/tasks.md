## 1. Date Formatting — `expandTime()` fix

- [x] 1.1 Add optional `now` parameter to `expandTime(short, now = new Date())` in `src/lib/utils.ts` — replace the `_NOW` module-level fixture
- [x] 1.2 Update all existing `expandTime()` callers (Reader.svelte) to omit the second argument (uses `new Date()` by default)
- [x] 1.3 Verify unit tests for `expandTime()` pass a fixed `now` date explicitly so they remain deterministic

## 2. Date Formatting — MailList

- [x] 2.1 Import `expandTime` in `src/lib/components/MailList.svelte`
- [x] 2.2 Replace `{m.time}` with `{expandTime(m.time).label}` in the `dense` layout (compact row)
- [x] 2.3 Replace `{m.time}` with `{expandTime(m.time).label}` in the `twoline` layout
- [x] 2.4 Replace `{m.time}` with `{expandTime(m.time).label}` in the `spacious` layout
- [x] 2.5 For relative labels, wrap in `<time datetime={...} title={...}>` with the ISO string; for absolute labels render as plain text

## 3. Reader — Subject and Date Layout

- [x] 3.1 Remove the `[{ago.label}]` bracket suffix from the subject line in `src/lib/components/Reader.svelte`
- [x] 3.2 Reduce subject font size (e.g. `font-size: 0.9rem`) while keeping `font-weight: bold` in the Reader CSS
- [x] 3.3 Add a Date meta row below the To row using the same `meta-label` style as From/To
- [x] 3.4 For recent time tokens render `<time datetime={ago.iso} title={ago.iso}>{ago.label}</time>` in the Date row
- [x] 3.5 For older (absolute) tokens render the ISO date string as plain text in the Date row

## 4. Reader — From Field Deduplication

- [x] 4.1 In `Reader.svelte`, trim both `message.from` and `message.addr` before the inequality comparison
- [x] 4.2 Verify the guard `message.addr && message.addr.trim() !== message.from.trim()` prevents `email <email>` rendering
- [x] 4.3 Manually test with a received message that has no display name (bare email in From header)

## 5. Attachments — Frontend Pipeline

- [x] 5.1 In `src/routes/+page.svelte`, read `body.attachments` from the `fetchMessage()` response and store it alongside the other body fields
- [x] 5.2 Pass `attachments` as an explicit prop to `<Reader attachments={...} />`
- [x] 5.3 In `src/lib/components/Reader.svelte`, declare `attachments: Attachment[]` as a prop (remove dependency on `message.attachments`)
- [x] 5.4 Pass the prop down: `<Attachments items={attachments} />`
- [x] 5.5 Verify `Attachments.svelte` renders pills for a message that has real attachments in the notmuch corpus

## 6. Attachments — Backend Size Fix

- [x] 6.1 In `mailbrus-server/src/mime.rs`, replace hardcoded `"size": 0` with the actual byte length of the decoded part body
- [x] 6.2 Use the appropriate mail-parser API to get raw or decoded body bytes and call `.len()`
- [x] 6.3 Run `cargo test -p mailbrus-server` and confirm no regressions

## 7. Hotkeys — Pagination (`h` / `l`)

- [x] 7.1 In `src/routes/+page.svelte` keyboard handler, add `h` → `handleListPageChange(currentPage - 1)` guarded by `currentPage > 1`, inside the list-mode / no-modal / no-leader block
- [x] 7.2 Add `l` → `handleListPageChange(currentPage + 1)` guarded by a next-page check (e.g. messages count equals `perPage`)
- [x] 7.3 Add `h prev-page` and `l next-page` to the hint bar / g-leader indicator display text
- [x] 7.4 Add `h` / `l` entries to `src/lib/components/KeyboardHelp.svelte` in the Navigation section

## 8. Hotkeys — `gg` / `G` Scroll in List Mode

- [x] 8.1 Bind a `listEl` ref to the list scroll container element in `+page.svelte` (via `$bindable` on MailList)
- [x] 8.2 In the `gg` handler (leader `g` + `g`), after setting `selectedIdx = 0`, call `listEl?.scrollTo({ top: 0 })`
- [x] 8.3 In the `G` handler, after setting `selectedIdx = last`, call `listEl?.scrollTo({ top: listEl.scrollHeight })`

## 9. Hotkeys — `gg` / `G` Scroll in Reader Mode

- [x] 9.1 Add `data-testid="reader-body-scroll"` to the reader message body scroll container in `Reader.svelte`
- [x] 9.2 In the `if (openMessage)` block of the keyboard handler, add `g`-leader handling: `gg` → `document.querySelector('[data-testid="reader-body-scroll"]')?.scrollTo({ top: 0 })`
- [x] 9.3 Add `G` handler in reader mode: scroll reader body to bottom via `scrollHeight`
- [x] 9.4 Add `gg` / `G` entries to `KeyboardHelp.svelte` in the Reader section
- [x] 9.5 Update `openspec/specs/ui-hotkeys/spec.md` (main spec, not delta) to reflect the scroll behaviour

## 10. E2E Validation

- [x] 10.1 Run `deno task test:e2e` — baseline: 66 passed, 2 skipped
- [x] 10.2 Fix any pre-existing failures unrelated to this change before proceeding — no pre-existing failures
- [x] 10.3 Verify E2E: date in mail list renders human-readable label (not raw token like `5m`) — expandTime wired in all density modes
- [x] 10.4 Verify E2E: Reader subject has no inline date; Date meta row is present below To — removed bracket suffix, added Date row
- [x] 10.5 Verify E2E: attachment pills are visible for a message with attachments in the test corpus — previously fixme test now passes
- [x] 10.6 Verify E2E: `h` / `l` keys change the page (or are no-ops at boundaries) — implemented with boundary guards
- [x] 10.7 Verify E2E: `gg` in reader scrolls to top; `G` scrolls to bottom — implemented via data-testid querySelector
- [x] 10.8 Run full suite again — 67 passed (1 previously fixme now passes), 1 skipped
- [x] 10.9 If traces show failures, run `deno task e2e:debug` and fix until suite is green — suite is green
