# Mailbrus — Requirements

A keyboard-friendly, **ultra-minimal, "zen"** email client. Operates on top of
**maildir** folders with filters. This document captures all product
requirements discussed so far. Treat it as the source of truth — when adding a
feature, update this file as part of the same change.

---

## 1. Product positioning

- **Name:** Mailbrus.
- **Wordmark:** `mailbrus` lowercase with a single dot at the baseline as the
  only ornament. The dot is brand-accent colored and scales relative to its
  font size (em-based, never a fixed pixel value).
- **Aesthetic:** zen, minimal, calm. No icons unless they earn their place
  (mail flags, the small reader toolbar, scrollbar grippers). No emoji.
- **Mental model:** mutt/aerc fluency with modern visual polish. Keyboard
  first; mouse is a fallback.

---

## 2. Launch flow (state machine)

The client moves through three phases on startup, gated by modal palettes:

1. **Account picker** — `⌘K`-style palette. Lists all configured maildir
   accounts. No prior account is selected.
2. **Folder picker** — palette scoped to the chosen account. Lists default
   maildir folders: `INBOX`, `Sent`, `Drafts`, `Archive`, `Spam`, `Trash`.
3. **Message list** — minimal one-line-per-message list of the chosen folder.

`Esc` walks the user back one step:

- Esc on list → folder picker
- Esc on folder picker → account picker (when no folder is yet picked) or back
  to list (when one already exists, so the picker behaves like a switch)
- Esc on account picker → returns to current list if one exists; otherwise stays

A fourth screen — **Compose** (§7) — overlays the list on demand. It is not
part of the launch flow.

---

## 3. Modal palettes (account / folder / command)

All three pickers share a single **Palette** component:

- **Style:** ⌘K command-palette look — centered card, search input on top,
  numbered rows below, key-hint footer.
- **Search:** fuzzy filter on the primary + secondary text of each row.
- **Numbered rows:** rows 1–9 are tappable by pressing the corresponding
  number key (only when the search input is empty, so it doesn't trap typing).
- **Navigation:** `↑/↓` and `Ctrl+N/P` move selection. `j/k` also work when
  the search input is empty.
- **Selection:** `Enter` confirms; `Esc` cancels.
- **Footer hints:** the kbd legend renders inside the palette.
- **Maildir context surfaces in the secondary line** — accounts show their
  maildir path + host; folders show `<maildir>/<folder-id>`.

**Account picker** items: address (primary), maildir + host (secondary),
unread count or total (meta).

**Folder picker** items: folder name (primary), full maildir path
(secondary), `unread / total` or just `total` (meta).

**Command palette** (`⌘K` from the list): quick actions like *Switch
account…*, *Switch folder…*, *Go to inbox*, *Go to archive*, *Compose*,
*Search this folder*, *Toggle dark mode*, *Mark all read*. Right-aligned
shortcut hints next to each.

---

## 4. Message list

The default screen once an account + folder are picked.

### Layout

- **Breadcrumb status line** at top: `mailbrus / <account> / <folder>` on the
  left, counts on the right (`N unread · M / T`). Each breadcrumb crumb is
  **clickable**:
  - **mailbrus** → opens an About dialog (logo placeholder, philosophy
  tagline, GitHub link, license, version).
  - **address** → opens the account picker.
  - **folder name** → opens the folder picker.
- **Mail list** fills the rest of the viewport.
- **Hint bar** at the bottom (toggleable, see Tweaks).

### Density (Tweak — configurable)

- **dense** — one line per message: from · subject · time. No preview text.
- **twoline** *(default)* — line 1: from + time; line 2: subject + preview.
- **spacious** — from / subject / preview / time, with a gravatar on the
  left.

### Row semantics

- Unread rows render `from` and `subject` in semibold, with a brand-colored
  bullet in the flag column.
- Read rows show their flag letter (`R` for read, `D` for draft, etc.) in the
  flag column.
- Active row (keyboard cursor) is tinted with `--brand-subtle` and gets a
  2px brand left-border.
- Hovering with the mouse moves the selection cursor onto that row (mouse
  follows keyboard).

### Search bar

- `/` opens an inline search bar above the list (terminal-style `/` prompt
  in brand color).
- Filters in real time across `from / addr / subject / preview`.
- `Enter` blurs the field (commits the filter), `Esc` closes it and clears
  the query.

---

## 5. Keyboard interactions

Global (when on the list and no modal is up):

- `j` / `↓` — next message
- `k` / `↑` — previous message
- `Enter` — open the selected message in the reader
- `Esc` — go back (list → folder picker; reader → list)
- `/` — open search-in-folder
- `c` — open compose (§7)
- `g` is a **leader key** with a 1.2s timeout and an on-screen indicator
  showing the available follow-ups:
  - `g i` — Inbox
  - `g a` — Archive
  - `g s` — Sent
  - `g d` — Drafts
  - `g f` — folder picker (current account)
  - `g A` — account picker
  - `g g` — top of list
- `G` — bottom of list
- `⌘K` / `Ctrl+K` — command palette
- `1`–`9` — jump in palette modals only

Inside palettes — see §3. Inside compose — see §7. Inside the reader —
see §8.

Inside the reader — `j/k` cycle to next/previous message; `Esc` closes the
reader and returns to the list at the same cursor position.

---

## 7. Compose

Triggered by `c` from the message list, or the *Compose new message* command
in the `⌘K` palette. Overlays the list as a full screen.

### Layout

- **Breadcrumb status line** at top — same component as list/reader. The
  third crumb reads **Compose**; clicking it returns to the list. The
  right-side meta shows live `N words · M chars · esc discard · ⌘↵ send`.
- **Field stack** below:
  - `from` — static line, shows the active account (mono mute label, sans
    value in muted-foreground color so the user reads it as fixed).
  - `to` — free-text input, auto-focused on mount.
  - `+ Cc` / `+ Bcc` — small mono adder buttons in the To row’s right
    gutter. Clicking promotes them to real `cc:` / `bcc:` rows.
  - `subject` — one step larger (`text-lg`, weight 500) so it visually
    dominates the headers like a real subject.
  - 1px `--border` underline between rows; no input chrome (no boxes).
- **1px divider** separates the header block from the body.
- **Body textarea** fills the rest of the viewport. No resize handle, no
  border. Same Mac-style overlay scrollbar as the reader (§8.3).

### Keys inside compose

- `⌘↵` / `Ctrl+↵` — send (stub closes the screen).
- `⌘S` — save draft (stub closes the screen).
- `Esc` — discard. If any field is non-empty, prompts to confirm.
- Breadcrumb crumbs remain clickable for navigation.
- Tab/Shift+Tab move through fields naturally.

### Not yet built

- Real send/draft persistence — both shortcuts currently just close.
- Recipient autocomplete from the address book / prior messages.
- Attachments.
- Reply / Reply-all / Forward entry points (compose-from-message). These
  should prefill `to`, `subject` (`Re: …`), and quote the body.
- Signature insertion — the composer should append the account’s signature
  block (with the `-- ` separator) automatically.

---

## 8. Reader

Triggered by `Enter` on a list row. Renders fullscreen over the list.

### Layout

- **Breadcrumb status line** at the very top (fixed; same component as the
  list). Right-side meta reads `reading · esc back`. Crumbs remain
  clickable.
- **Scroll container** below — owns the only scrollbar on the page.
- Inside the scroll container, in order:
  1. **Subject row** — `text-xl` (20px), semibold, tight tracking.
     - The relative time tag `[2 mins ago]` sits **at the end of the
       subject** in the same font and size, muted color, with a dotted
       underline. Hover shows full ISO timestamp like `2026-05-20 15:28`.
     - At the **right edge of the subject row**, vertically centered:
       - **Padlock icon** (always shown):
         - **Closed lock + brand color** when the body contains a signature
           block.
         - **Open lock + dim** when there is no signature.
         - Hover tooltip explains state.
       - **Unsubscribe icon** (envelope with an `X`) — only present when the
         message has a `List-Unsubscribe` header. Hover shows the
         destination.
       - **Headers icon** (three stacked lines) — toggles the raw-headers
         popover (see §8.2).
  2. **Meta block** — `From` and `To` on separate lines, mono labels.
     - When the sender's display name equals its email address, the
       angle-bracketed `<addr>` is suppressed (no `addr <addr>`).
     - The folder is *not* repeated here — it's already in the breadcrumb.
  3. **Message body** — `pre-wrap`. Default 24/32/60px padding so the
     scrollbar sits flush at the viewport's right edge.

### 8.1 Signature dimming

Anything from the standard separator line `-- ` (dash-dash-space, per
**RFC 3676 §4.3**) onward renders at 75% opacity in muted-foreground
color. The body before that line keeps full weight.

### 8.2 Headers popover

- Anchored under the subject row, right-aligned, 640px wide, max 60vh tall.
- Contains realistic RFC 5322 headers synthesized from the message + account:
  `Return-Path`, multiple `Received:`, `Authentication-Results`,
  `DKIM-Signature`, `From`, `To`, `Subject`, `Date`, `Message-ID`,
  `MIME-Version`, `Content-Type`, `Content-Transfer-Encoding`, `X-Mailer`,
  `X-Mailbrus-Folder` (the maildir path), `X-Mailbrus-Flags`, and
  `List-Unsubscribe` (only for digest/newsletter senders).
- Mono font, two-column grid: right-aligned keys, word-broken values.
- Scrollable; uses the same Mac-style overlay scrollbar.
- `Esc` or click-outside closes it.

### 8.3 Reader scrollbar

The reader uses the **standard `.mb-scroll` utility** (see §11). It looks
exactly like every other scrolling region in the app — no per-component
overrides.

### 8.4 Attachments

If a message has attachments, they render as a single-line pill row between
the meta block (From / To) and the message body.

- Pill anatomy: small **extension badge** (e.g. `PDF`, `PNG`, `ZIP`) in
  mono on a chip, **filename** (truncated to ~280px with ellipsis if
  longer), **size** in mono with `tabular-nums` (B / KB / MB / GB).
- Hover tints the pill in `--brand-subtle` and warms the border toward the
  brand color.
- Click is a stub — no download flow wired yet.
- Row uses `overflow-x: auto` with the shared `.mb-scroll` utility, so
  many attachments scroll horizontally rather than wrapping or being
  clipped. Single line always.
- The row is hidden entirely when `message.attachments` is empty/absent.

Message data carries `attachments: [{ name, size, mime }]` on a per-message
basis. Sample data ships a varied mix (none / 1 / 2 / 4 attachments) so the
visual scales are easy to see.

---

## 9. Avatars

- Resolved via **Gravatar**: SHA-256 of the trimmed, lowercased email →
  `https://www.gravatar.com/avatar/<hash>?d=identicon&s=128`. Web Crypto's
  `crypto.subtle.digest("SHA-256", …)` is used.
- On image error or missing email, fall back to **initials** drawn over a
  `--brand-subtle` circle in `--brand-700` color. Initials skip leading
  reply/forward prefixes (`To:`, `Re:`, `Fwd:`).
- Used in the **spacious** list density (32px) **only**. The reader header
  used to show one but it was removed — the From line is enough. The
  compose screen does not show an avatar for the sender.
- Hash results are cached in a module-level `Map` so the digest only runs
  once per address per session.

---

## 10. Tweaks panel (configurable preferences)

Lives bottom-right, draggable, toggled by the host's Tweaks toolbar button.
Persists changes via the host's `__edit_mode_set_keys` protocol so they
survive reload.

| Key       | Default   | Options                                            |
|-----------|-----------|----------------------------------------------------|
| `dark`    | `false`   | toggle                                             |
| `accent`  | `indigo`  | indigo / violet / blue / green / rose / amber / mono |
| `font`    | `sans`    | sans / mono / serif (also covers the three aesthetic directions: editor-zen / terminal-zen / paper-zen) |
| `density` | `twoline` | dense / twoline / spacious                         |
| `hintBar` | `true`    | show/hide the keyboard hint bar                    |

**Dark-mode accent contract:** every accent must define a properly **dark**
`--brand-subtle` (~`oklch(0.30 … <hue>)`) so the near-white foreground stays
readable on selected rows. Light-only subtle tints break contrast in dark
mode.

---

## 11. Theming foundation

- Built on the **shadcn** design system (`colors_and_type.css` from the
  shared design system).
- Typography: Geist Sans / Geist Mono by default. Serif option uses a system
  serif stack (Iowan Old Style → Charter → Georgia).
- Spacing follows the shadcn scale (4px grid).
- Radius: shadcn base `0.625rem` with the standard `--radius-sm/md/lg/xl`
  derivatives.
- Shadows + motion tokens (`--ease-out`, `--duration-fast/base/slow`) are
  inherited unchanged.

The single brand layer:

- Light mode: `oklch(0.58 0.19 270)` (Shadcn Indigo) as default
  `--brand`. Switchable via the accent Tweak.
- Dark mode: each accent has a matched lighter brand and a dark
  `--brand-subtle` (~`0.30 0.05 <hue>`).

### 11.1 Scrollbars

Modeled after shadcn's `scroll-area`. **Every scrolling region in the app
must use the `.mb-scroll` utility class.** No per-component scrollbar
styling. The utility reads design tokens defined on `:root`:

| Token                       | Default                                                    |
|-----------------------------|------------------------------------------------------------|
| `--scrollbar-size`          | `10px` (track width)                                       |
| `--scrollbar-padding`       | `3px` (transparent border around the thumb)                |
| `--scrollbar-thumb-radius`  | `9999px` (pill)                                            |
| `--scrollbar-thumb`         | `color-mix(in oklab, var(--foreground) 22%, transparent)`  |
| `--scrollbar-thumb-hover`   | `color-mix(in oklab, var(--foreground) 45%, transparent)`  |

Dark mode drops the opacities to 18% / 40% so the thumb doesn't glow on a
dark surface.

Visual rules:

- The thumb is **always slightly visible** when the region overflows (no
  fade-to-invisible). On hover, the thumb darkens to
  `--scrollbar-thumb-hover`.
- Up/down arrow buttons are hidden (`::-webkit-scrollbar-button { display:
  none }`) so Linux Chromium doesn't render arrows.
- Track and corner are transparent.

The utility applies to: palette item list, mail list, reader scroll, compose
scroll, compose textarea, headers popover body, keyboard-help grid, and the
recipient-autocomplete dropdown.

---

## 12. Accounts & folders (sample data)

The prototype ships with two accounts for `antono.vasiljev`:

- `antono.vasiljev@gmail.com` — IMAP, `~/Maildir/gmail`
- `antono.vasiljev@proton.me` — Proton Bridge on localhost, `~/Maildir/proton`

Both accounts share the default maildir folder set: `INBOX`, `Sent`,
`Drafts`, `Archive`, `Spam`, `Trash`. No custom user folders in the demo.

---

## 13. Open questions / not yet built

These are explicitly known gaps from the conversation:

- **Maildir filters as a first-class UI concept** — how filters surface
  (sidebar of saved filters? `:filter` query bar at the top of the list?
  virtual folders inside the folder picker?) is undecided. Folders currently
  use the default IMAP/maildir set only.
- **Composer enhancements** — the screen exists (§7) but is missing real
  send/draft persistence, recipient autocomplete, attachments, signature
  insertion, and reply/reply-all/forward entry points.
- **Threading** — list is flat; no thread collapsing.
- **Per-message bodies** — every opened message currently renders the same
  sample body (which includes a signature block to demo §8.1).
- **Tablet / mobile layout** — desktop-only; small viewports untested.
- **Real maildir I/O** — this is a mockup; no actual filesystem reads.
- **PGP/cryptographic signature verification** — the padlock currently
  reflects the presence of a `-- ` signature block, not crypto verification.

---

## 14. Non-goals

- Web design tropes: no left-sidebar nav, no toolbar of bulk-action icons,
  no read/unread toggle pills, no "Inbox Zero" celebration.
- Onboarding screens, tours, splash screens.
- Visible scrollbars at rest anywhere on the page (use the `.mb-scroll`
  utility — never a default browser scrollbar).
- Marketing copy or filler content.
