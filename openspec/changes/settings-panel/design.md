## Context

Currently UI preferences (dark mode, accent, font family, density, hintBar) live in `TweaksPanel.svelte` behind a floating ⚙ FAB, persisted in `localStorage` under `mailbrus-tweaks`. App-level settings (theme, sort order, search history, push subscription) live in IndexedDB via `settings.ts`. These two stores are separate and have overlapping concerns (both handle "theme"). There is no keyboard path to open tweaks and no place to inspect account state.

The goal is a single settings surface: a keyboard-accessible modal with tabs, backed by one persistence layer.

## Goals / Non-Goals

**Goals:**
- Replace TweaksPanel with a `SettingsPanel` modal opened via command palette (`open-settings`)
- Single tab (UI): all current tweaks + font size selector
- Single persistence: all UI prefs move into `settings.ts` IDB store under a `ui_prefs` key
- One-time migration from `mailbrus-tweaks` localStorage on first load
- Keyboard navigation: `Escape` closes, arrow keys or `Tab` switch tabs

**Non-Goals:**
- Account configuration (handled outside the settings panel)
- Per-account UI overrides
- Settings sync across devices

## Decisions

### 1. Modal overlay, not a route

**Decision**: `SettingsPanel` is a modal (`<dialog>` or fixed overlay), not `/settings` route.

**Rationale**: Opening settings via command palette mid-session should not navigate away from the current message list. A modal matches the existing pattern used by `Palette.svelte`, `KeyboardHelp`, and `About`.

**Alternative considered**: SvelteKit route with `+page.svelte`. Rejected — adds navigation complexity and breaks the "open without losing context" requirement.

### 2. Merge ui_prefs into settings.ts IDB store

**Decision**: Add `ui_prefs: UiPrefs` to the `Settings` interface in `settings.ts`. On first load, if `mailbrus-tweaks` exists in localStorage, migrate its values into IDB and delete the key.

**Rationale**: One persistence layer is simpler. IDB survives private-browsing edge cases better than localStorage and is already the source of truth for all other settings. Having one `writeSetting` path also makes future sync easier.

**Alternative considered**: Keep localStorage for tweaks, add IDB only for new prefs. Rejected — two stores with overlapping semantics (both have a "theme/dark" concept) is confusing.

**UiPrefs shape**:
```ts
interface UiPrefs {
  dark: boolean;
  accent: string;       // 'indigo' | 'violet' | 'blue' | 'green' | 'rose' | 'amber' | 'mono'
  font: string;         // 'sans' | 'mono' | 'serif'
  fontSize: string;     // 'xs' | 'sm' | 'md' | 'lg'
  density: string;      // 'dense' | 'twoline' | 'spacious'
  hintBar: boolean;
}
```

### 3. CSS application stays in +page.svelte $effect

**Decision**: The `$effect` that sets `data-accent`, `--font-app`, `dark` class remains in `+page.svelte`. It reads from a `uiPrefs` state derived from settings. Add `--font-size-app` alongside.

**Rationale**: TweaksPanel currently calls `onTweakChange` to push state up to the page for DOM application. Moving the same logic into `SettingsPanel` would couple it to the DOM root. Keeping it in `+page.svelte` maintains the existing unidirectional data flow.

**Font size CSS var values**:
| value | `--font-size-app` |
|-------|------------------|
| xs    | 11px             |
| sm    | 12px             |
| md    | 13px (default)   |
| lg    | 15px             |

### 4. SettingsPanel component structure

```
SettingsPanel.svelte
  props: open (bindable), uiPrefs: UiPrefs
  emits: onPrefsChange(UiPrefs)

  <dialog> (or fixed overlay matching Palette style)
    <header> — title + close button
    <section>
      — dark mode toggle
      — accent select
      — font segmented control (sans / mono / serif)
      — font size segmented control (xs / sm / md / lg)  ← new
      — density segmented control (dense / twoline / spacious)
      — hintBar toggle
      — push notifications toggle (if supported)
```

The component does not write to IDB directly — it calls `onPrefsChange` and the parent (`+page.svelte`) calls `writeSetting('ui_prefs', ...)`.

### 5. Command palette entry

Add one item to `CommandPalette.svelte`:
```ts
{ key: 'open-settings', primary: 'Open settings…', secondary: 'UI preferences and accounts', meta: ',' }
```

Handle `open-settings` action in `+page.svelte` by setting `settingsOpen = true`. Bind `⌘,` / `Ctrl+,` as the keyboard shortcut (standard across macOS apps).

## Risks / Trade-offs

- **Migration data loss** → On migrate, spread IDB defaults first, then overlay localStorage values. If parse fails, silently use defaults. Log via `pwaLog`.
- **`settings.ts` `_loaded` cache** → Migration must run before `_loaded` is set to `true`, otherwise the first `loadSettings()` call returns stale defaults. Integrate migration inside `loadSettings()`.
- **Push subscription key conflict** → `settings.ts` already has `push_subscription`. `TweaksPanel` handles push independently via `Notification` API. The push toggle moves into `SettingsPanel` UI tab — no structural change needed, just relocation.
- **Existing e2e tests reference `tweaks.*` testids** → All `data-testid="tweaks.*"` attributes must be updated to `settings.*` equivalents. Playwright suite will need corresponding selector updates.

## Migration Plan

1. In `loadSettings()`, after reading IDB rows, check `localStorage.getItem('mailbrus-tweaks')`.
2. If present, parse and merge into `ui_prefs` defaults, then call `idbPut('settings', { key: 'ui_prefs', value })` and `localStorage.removeItem('mailbrus-tweaks')`.
3. Delete `TweaksPanel.svelte`.
4. Ship `SettingsPanel.svelte` — on first open the migrated prefs are already in IDB.

**Rollback**: Re-add `TweaksPanel.svelte`, revert `settings.ts` and `+page.svelte`. No data loss — IDB `ui_prefs` key is additive; old code ignores unknown keys.
