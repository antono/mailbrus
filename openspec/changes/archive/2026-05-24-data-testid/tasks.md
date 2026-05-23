## 1. Palette component — add curtainTestId prop

- [x] 1.1 Add `curtainTestId: string` prop to `Palette.svelte` and apply as `data-testid` on the curtain `<div>`
- [x] 1.2 Add `data-testid="palette.input"` to the filter input in `Palette.svelte`
- [x] 1.3 Add `data-testid="palette.row"` to each row `<div>` in `Palette.svelte`
- [x] 1.4 Pass `curtainTestId="accounts.curtain"` from `AccountPicker.svelte`
- [x] 1.5 Pass `curtainTestId="folders.curtain"` from `FolderPicker.svelte`
- [x] 1.6 Pass `curtainTestId="commands.curtain"` from `CommandPalette.svelte`

## 2. Breadcrumbs

- [x] 2.1 Add `data-testid="breadcrumbs.home-btn"` to the wordmark/home button
- [x] 2.2 Add `data-testid="breadcrumbs.account-btn"` to the account button
- [x] 2.3 Add `data-testid="breadcrumbs.folder-btn"` to the folder button

## 3. MailList

- [x] 3.1 Add `data-testid="mail-list.container"` to the list root element
- [x] 3.2 Add `data-testid="mail-list.message-row"` to each message row `<div>`
- [x] 3.3 Add `data-testid="mail-list.search-input"` to the search input
- [x] 3.4 Add `data-testid="mail-list.prev-btn"` to the previous page button
- [x] 3.5 Add `data-testid="mail-list.next-btn"` to the next page button

## 4. Reader

- [x] 4.1 Add `data-testid="reader.container"` to the reader root element
- [x] 4.2 Add `data-testid="reader.headers-btn"` to the headers toggle button
- [x] 4.3 Add `data-testid="reader.unsubscribe-btn"` to the unsubscribe button

## 5. Compose and RecipientInput

- [x] 5.1 Add `data-testid="compose.container"` to the compose form root
- [x] 5.2 Add `data-testid="compose.to-input"` to the To `RecipientInput`
- [x] 5.3 Add `data-testid="compose.subject-input"` to the subject input
- [x] 5.4 Add `data-testid="compose.body"` to the body textarea
- [x] 5.5 Add `data-testid="compose.add-cc-btn"` and `data-testid="compose.add-bcc-btn"` to the toggle buttons
- [x] 5.6 Add `data-testid="compose.cc-input"` and `data-testid="compose.bcc-input"` to the conditional Cc/Bcc `RecipientInput` fields
- [x] 5.7 Add `data-testid="recipient-input.suggestion-row"` to each suggestion row in `RecipientInput.svelte`

## 6. TweaksPanel

- [x] 6.1 Add `data-testid="tweaks.fab"` to the FAB button
- [x] 6.2 Add `data-testid="tweaks.panel"` to the panel container
- [x] 6.3 Add `data-testid="tweaks.dark-toggle"` to the dark mode toggle
- [x] 6.4 Add `data-testid="tweaks.accent-select"` to the accent `<select>`
- [x] 6.5 Add `data-testid="tweaks.font-radio"` to each font radio button
- [x] 6.6 Add `data-testid="tweaks.density-radio"` to each density radio button
- [x] 6.7 Add `data-testid="tweaks.hints-toggle"` to the hints bar toggle
- [x] 6.8 Add `data-testid="tweaks.notifications-toggle"` to the notifications toggle
- [x] 6.9 Add `data-testid="tweaks.close-btn"` to the close button

## 7. Modals and overlays

- [x] 7.1 Add `data-testid="about.dialog"` to the About dialog container and `data-testid="about.close-btn"` to its close button
- [x] 7.2 Add `data-testid="headers-popover.container"` to the HeadersPopover root and `data-testid="headers-popover.close-btn"` to its close button
- [x] 7.3 Add `data-testid="keyboard-help.dialog"` to the KeyboardHelp dialog container
- [x] 7.4 Add `data-testid="hint-bar.overflow-btn"` to the HintBar overflow button

## 8. E2E page object updates

- [x] 8.1 Update `AccountsPage.ts` — replace `.mb-curtain .mb-row` with `getByTestId('accounts.curtain').getByTestId('palette.row')`
- [x] 8.2 Update `MailboxPage.ts` — replace `.mb-mail-list .mb-msg` with `getByTestId('mail-list.message-row')`, pagination buttons with `getByTestId('mail-list.next-btn')` / `getByTestId('mail-list.prev-btn')`
- [x] 8.3 Update `MessagePage.ts` — replace `.mb-reader` with `getByTestId('reader.container')`, unsubscribe button with `getByTestId('reader.unsubscribe-btn')`
