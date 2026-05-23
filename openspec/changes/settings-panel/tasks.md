## 1. Settings persistence

- [x] 1.1 Add `UiPrefs` interface to `src/lib/settings.ts` (dark, accent, font, fontSize, density, hintBar)
- [x] 1.2 Add `ui_prefs` key to `Settings` interface with defaults (dark:false, accent:'indigo', font:'sans', fontSize:'md', density:'twoline', hintBar:true)
- [x] 1.3 Implement one-time migration in `loadSettings()`: read `mailbrus-tweaks` from localStorage, merge into `ui_prefs` defaults, write to IDB, delete localStorage key

## 2. SettingsPanel component

- [x] 2.1 Create `src/lib/components/SettingsPanel.svelte` — modal overlay with backdrop, header (title + close button), body
- [x] 2.2 Add dark mode toggle row
- [x] 2.3 Add accent color select (indigo/violet/blue/green/rose/amber/mono)
- [x] 2.4 Add font family segmented control (sans/mono/serif)
- [x] 2.5 Add font size segmented control (xs/sm/md/lg)
- [x] 2.6 Add density segmented control (dense/twoline/spacious)
- [x] 2.7 Add hintBar toggle row
- [x] 2.8 Add push notifications toggle row (hidden when unsupported; migrate push logic from TweaksPanel)
- [x] 2.9 Close on Esc keydown and backdrop click
- [x] 2.10 Add `data-testid="settings.*"` attributes to all interactive elements

## 3. Wire into +page.svelte

- [x] 3.1 Add `settingsOpen` state and replace `<TweaksPanel>` with `<SettingsPanel>`
- [x] 3.2 Load `ui_prefs` from `loadSettings()` result and expose as `uiPrefs` state
- [x] 3.3 Update `$effect` that applies dark class, `data-accent`, `--font-app` to also apply `--font-size-app` from `uiPrefs.fontSize`
- [x] 3.4 On `onPrefsChange` from SettingsPanel, update `uiPrefs` state and call `writeSetting('ui_prefs', ...)`
- [x] 3.5 Handle `open-settings` action in the command action dispatcher (set `settingsOpen = true`)
- [x] 3.6 Handle `⌘,` / `Ctrl+,` keyboard shortcut to open settings

## 4. Command palette

- [x] 4.1 Add `{ key: 'open-settings', primary: 'Open settings…', secondary: 'UI preferences', meta: ',' }` to items in `CommandPalette.svelte`

## 5. Remove TweaksPanel

- [x] 5.1 Delete `src/lib/components/TweaksPanel.svelte`
- [x] 5.2 Remove TweaksPanel import and `<TweaksPanel>` usage from `+page.svelte`

## 6. Update tests

- [x] 6.1 Update Playwright selectors from `tweaks.*` testids to `settings.*`
- [x] 6.2 Add e2e test: open settings via command palette, change font size, verify `--font-size-app` CSS var
- [x] 6.3 Add e2e test: change prefs, reload, verify values are restored from IDB
