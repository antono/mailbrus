## Why

The current TweaksPanel is a floating draggable widget (⚙ FAB) that mixes UI preferences with notification settings and has no keyboard-first access path. Moving everything into a proper settings panel makes the app feel more intentional and opens room for account management in the same place.

## What Changes

- Remove the `TweaksPanel.svelte` floating FAB and draggable panel
- Add a `SettingsPanel.svelte` modal with tabbed navigation (UI tab to start)
- Add "Open settings…" command to `CommandPalette.svelte` (opens the panel)
- **UI tab** — migrate all current tweaks: dark mode, accent, font family, density, hintBar toggle, push notifications; add new **font size selector** (xs / sm / md / lg)
- Merge `mailbrus-tweaks` localStorage key into `settings.ts` IDB store so all preferences survive on the same persistence layer
- Apply `--font-size-app` CSS variable from the font size setting alongside existing `--font-app`

## Capabilities

### New Capabilities
- `settings-panel`: Settings modal — UI preferences (theme, typography, layout); opened via command palette

### Modified Capabilities
- `sveltekit-ui`: TweaksPanel FAB is removed; UI preference application (dark class, accent attr, font/size CSS vars) moves to the new panel's persistence path

## Impact

- `src/lib/components/TweaksPanel.svelte` — deleted
- `src/lib/components/SettingsPanel.svelte` — new
- `src/lib/components/CommandPalette.svelte` — adds `open-settings` command item
- `src/routes/+page.svelte` — replace `<TweaksPanel>` with `<SettingsPanel>`, wire `open-settings` action
- `src/lib/settings.ts` — add `ui_prefs` key (dark, accent, font, fontSize, density, hintBar) to `Settings` interface; migrate from localStorage on first load
