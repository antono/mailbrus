## 1. Settings persistence

- [ ] 1.1 Add `UiPrefs` interface to `src/lib/settings.ts` (dark, accent, font, fontSize, density, hintBar)
- [ ] 1.2 Add `ui_prefs` key to `Settings` interface with defaults (dark:false, accent:'indigo', font:'sans', fontSize:'md', density:'twoline', hintBar:true)
- [ ] 1.3 Implement one-time migration in `loadSettings()`: read `mailbrus-tweaks` from localStorage, merge into `ui_prefs` defaults, write to IDB, delete localStorage key

## 2. SettingsPanel component

- [ ] 2.1 Create `src/lib/components/SettingsPanel.svelte` — modal overlay with backdrop, header (title + close button), body
- [ ] 2.2 Add dark mode toggle row
- [ ] 2.3 Add accent color select (indigo/violet/blue/green/rose/amber/mono)
- [ ] 2.4 Add font family segmented control (sans/mono/serif)
- [ ] 2.5 Add font size segmented control (xs/sm/md/lg)
- [ ] 2.6 Add density segmented control (dense/twoline/spacious)
- [ ] 2.7 Add hintBar toggle row
- [ ] 2.8 Add push notifications toggle row (hidden when unsupported; migrate push logic from TweaksPanel)
- [ ] 2.9 Close on Esc keydown and backdrop click
- [ ] 2.10 Add `data-testid="settings.*"` attributes to all interactive elements

## 3. Wire into +page.svelte

- [ ] 3.1 Add `settingsOpen` state and replace `<TweaksPanel>` with `<SettingsPanel>`
- [ ] 3.2 Load `ui_prefs` from `loadSettings()` result and expose as `uiPrefs` state
- [ ] 3.3 Update `$effect` that applies dark class, `data-accent`, `--font-app` to also apply `--font-size-app` from `uiPrefs.fontSize`
- [ ] 3.4 On `onPrefsChange` from SettingsPanel, update `uiPrefs` state and call `writeSetting('ui_prefs', ...)`
- [ ] 3.5 Handle `open-settings` action in the command action dispatcher (set `settingsOpen = true`)
- [ ] 3.6 Handle `⌘,` / `Ctrl+,` keyboard shortcut to open settings

## 4. Command palette

- [ ] 4.1 Add `{ key: 'open-settings', primary: 'Open settings…', secondary: 'UI preferences', meta: ',' }` to items in `CommandPalette.svelte`

## 5. Remove TweaksPanel

- [ ] 5.1 Delete `src/lib/components/TweaksPanel.svelte`
- [ ] 5.2 Remove TweaksPanel import and `<TweaksPanel>` usage from `+page.svelte`

## 6. Update tests

- [ ] 6.1 Update Playwright selectors from `tweaks.*` testids to `settings.*`
- [ ] 6.2 Add e2e test: open settings via command palette, change font size, verify `--font-size-app` CSS var
- [ ] 6.3 Add e2e test: change prefs, reload, verify values are restored from IDB
