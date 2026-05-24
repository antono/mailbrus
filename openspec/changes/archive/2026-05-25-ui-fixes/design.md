# Design: ui-fixes

## Context

The backend sends pre-formatted short time strings (`5m`, `2h`, `today`, `Mon`, `Mar 15`) rather than raw timestamps. `expandTime()` in `utils.ts` converts them to human labels and ISO strings, but uses a hardcoded `_NOW` fixture (`2026-05-20T15:30:00`) instead of `new Date()` — making all computed timestamps wrong in production.

`MailList` renders `m.time` raw. `Reader` expanded it but embedded the result inside the subject line. `Attachments.svelte` exists and is rendered in `Reader`, but `+page.svelte` never forwards the `attachments` array from the API response. The backend computes attachment metadata but hardcodes `size: 0`. The keyboard handler in `+page.svelte` has `gg`/`G` for list selection only, and no pagination hotkeys.

## Goals / Non-Goals

**Goals:**
- Human-readable dates everywhere, with hover tooltip for relative labels
- Reader header: subject visually distinct, date as a separate metadata row
- From field shows name + address without duplication
- Attachments visible in Reader (frontend pipeline + backend size fix)
- `h`/`l` paginate the mail list; `gg`/`G` scroll viewport in both list and reader mode

**Non-Goals:**
- Changing the server's short-format time protocol (stays as-is)
- Adding time-of-day to older dates where the backend doesn't supply it
- Attachment download / open actions (just display metadata for now)
- Refactoring the keyboard handler into a separate module

## Decisions

### 1. Fix `_NOW` → `new Date()`

Replace the fixture constant with `new Date()` at call time. The fixture exists for unit tests only; tests should inject a date via a parameter instead of relying on the module-level constant. All date arithmetic in `expandTime()` immediately becomes correct.

### 2. Relative / absolute threshold in `expandTime()`

| Backend token | Display rule |
|---|---|
| `Nm`, `Nh`, `now`, `today`, `yesterday` | Relative label + hover ISO tooltip |
| Weekday name (`Mon` … `Sun`) | Relative label (≤7 days ago) + hover ISO tooltip |
| `Mon DD` or `MMM DD` | Absolute ISO `YYYY-MM-DD` (no hover needed; already readable) |

Tokens in the first two rows are "recent" by definition of the server's encoding. The third row always represents ≥8 days ago. No threshold constant is needed — the token shape determines the display mode.

The `iso` value computed for weekday/today/yesterday tokens uses an approximate time (existing logic in `expandTime()`). For absolute dates the backend doesn't include time, so only `YYYY-MM-DD` is shown.

### 3. Hover tooltip markup

Use a `<time>` element with `title` and `datetime` attributes only for relative labels:

```svelte
<time datetime={ago.iso} title={ago.iso}>{ago.label}</time>
```

Absolute ISO strings render as plain text — they are already the tooltip content.

### 4. Reader header layout

Remove `[{ago.label}]` suffix from the subject line. Add a fourth metadata row after To:

```
From   Alice <alice@example.com>
To     me@example.com
Date   <time …>3 hours ago</time>
```

Subject font: reduce from current size by one step (e.g. `1rem` → `0.9rem`) while keeping `font-weight: bold`.

### 5. From field deduplication

Current guard: `message.addr && message.addr !== message.from`. This correctly suppresses `<addr>` when addr equals the from string. The reported duplication is `email <email>` — occurs when the server sets both `from` and `addr` to the bare email (no display name). Guard is already correct; investigate whether the server ever sends duplicate values and add a trim/normalise step if so.

Decision: keep existing guard, add a trim on both sides before comparison.

### 6. Attachments — frontend

`fetchMessage()` returns `MessageBody` which includes `attachments: Attachment[]`. In `+page.svelte` the returned body is stored in `openMessageBody`. The `<Reader>` component receives `message` (a `Message`) plus individual body fields. Attachments should be added as a separate prop:

```svelte
<Reader … attachments={openMessageBody?.attachments ?? []} />
```

`Reader.svelte` already passes `message.attachments` to `<Attachments>` — this prop path is wrong. Change `Reader` to accept an explicit `attachments` prop and pass it to `<Attachments>`.

### 7. Attachments — backend size

In `mime.rs`, `msg.parts[pid]` is a `MessagePart` from mail-parser. The decoded body is accessible via `part.get_body_raw()` or the encoding-decoded equivalent. Use `.len()` in bytes as the size. If decoding is not available at that call site, fall back to the raw encoded length (acceptable approximation).

### 8. Hotkeys — `h` / `l` pagination

Add inside the list-mode block (no `openMessage`, no leader active):

```
h → handleListPageChange(currentPage - 1)   // no-op if currentPage === 0
l → handleListPageChange(currentPage + 1)   // no-op if no next page
```

`currentPage` is already tracked in component state. Boundary check before calling.

### 9. Hotkeys — `gg` / `G` scroll

**List mode**: `gg` and `G` currently mutate `selectedIdx`. Extend each to also call `scrollTo(0, 0)` / `scrollTo(0, document.body.scrollHeight)` on the list scroll container. Identify the container via a bound element ref (`let listEl: HTMLElement`) in `+page.svelte` rather than a querySelector.

**Reader mode**: Add `gg` and `G` handling inside the `if (openMessage)` block. Reader body scroll container is the element with class `mb-reader-body` (or equivalent); bind a ref in `Reader.svelte` exposed via a Svelte action or forwarded via callback. Simpler alternative: `document.querySelector('.mb-reader-body')?.scrollTo(...)` — acceptable given there is only ever one reader open.

Decision: use `querySelector` for reader scroll to avoid prop-drilling a ref; use a bound `listEl` ref for the list container since `+page.svelte` owns it directly.

### 10. KeyboardHelp and hotkeys spec updates

Add the new bindings to `KeyboardHelp.svelte` in the navigation section and update `openspec/specs/ui-hotkeys/spec.md` to reflect the new requirements.

## Risks / Trade-offs

- **Approximate times for relative tokens** — `today` displays as e.g. `2026-05-24 09:30` in the hover ISO, not the actual send time. Acceptable given the backend format; a proper fix requires the backend to emit full ISO timestamps. → Mitigation: note in UI tooltip or leave as-is; the approximation is within the day.

- **`querySelector` for reader scroll** — fragile if the class name changes. → Mitigation: add a `data-testid="reader-body-scroll"` attribute and query by that; more stable.

- **`h`/`l` conflict with future vim-style navigation** — `h`/`l` are vi motions for left/right character movement, unusual as page keys. User explicitly chose them. → No mitigation needed.

- **`expandTime()` test fixture removal** — existing unit tests rely on `_NOW`. → Mitigation: convert `expandTime(short, now = new Date())` to accept an optional `now` parameter; tests pass a fixed date, production omits it.

## Open Questions

- Should `today` and `yesterday` labels keep showing "today" / "yesterday" or switch to the ISO date? (Current proposal keeps them as relative since they are < 24 h.)
- What is the correct `mb-reader-body` scroll container class? Confirm in `Reader.svelte` before implementing.
