## Reference

The Claude Design handoff is preserved in full at `reference/`:

| File | Role |
|------|------|
| `reference/REQUIREMENTS.md` | Authoritative product requirements (source of truth for all specs) |
| `reference/Mailbrus.html` | Entry point — loads all scripts and styles |
| `reference/app.jsx` | App shell + state machine (React) |
| `reference/screens.jsx` | All screen components: Palette, MailList, Reader, Compose, About, KeyboardHelp, HintBar |
| `reference/tweaks-panel.jsx` | Tweaks panel component |
| `reference/colors_and_type.css` | shadcn design-system tokens (copy verbatim) |
| `reference/styles.css` | Mailbrus component styles (copy verbatim) |
| `reference/data.js` | Sample accounts, folders, messages, bodies |
| `reference/assets/mark.svg` | Brand mark SVG |

## Why

The SvelteKit frontend is currently a two-line placeholder. The design handoff from Claude Design (see `reference/`) delivers a complete, pixel-specified UI for Mailbrus — account/folder pickers, mail list (three density modes), reader, compose, and all palette modals — that needs to be ported from the React prototype into the actual Tauri/SvelteKit codebase.

## What Changes

- Replace `src/routes/+page.svelte` placeholder with the full Mailbrus app shell
- Port all screen components (AccountPicker, FolderPicker, CommandPalette, MailList, Reader, Compose) from React to Svelte
- Bring in the design-system CSS (`colors_and_type.css`, `styles.css`) as the global stylesheet foundation
- Wire sample data (`data.js`) as a Svelte store for state management during prototype/demo phase
- Implement the full keyboard state machine: account → folder → list → reader / compose phases
- Implement Gravatar avatar resolution with SHA-256 via Web Crypto
- Implement the Tweaks panel (dark mode, accent, font, density, hint bar toggles)
- Implement the g-leader key sequence with 1.2 s timeout indicator

## Capabilities

### New Capabilities

- `sveltekit-ui`: Full Mailbrus UI — app shell, state machine, all screens (list, reader, compose), all palette modals (account, folder, command, about, keyboard-help), hint bar, tweaks panel, and the complete keyboard interaction model

### Modified Capabilities

- `sveltekit-frontend-scaffold`: The scaffold is now replaced by real application code; routing stays the same but the page component is fully implemented

## Impact

- **Files created/changed**: `src/routes/+page.svelte`, `src/lib/` (component modules), `src/app.css` (global styles), `src/lib/data.ts` (sample data store)
- **Assets**: `colors_and_type.css` and `styles.css` integrated (possibly via `app.css`)
- **No Rust changes**: pure frontend — no Tauri command API calls in this phase (sample data only)
- **Dependencies**: No new npm packages beyond what SvelteKit provides; Geist font via Google Fonts CDN

## Non-goals

- Real maildir I/O or Tauri command integration in this phase
- PGP verification (padlock reflects signature-block presence only)
- Mobile / tablet layout
- Real send/draft persistence in Compose
- Thread collapsing
