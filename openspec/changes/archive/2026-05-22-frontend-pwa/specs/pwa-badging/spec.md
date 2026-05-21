## ADDED Requirements

### Requirement: Installed app icon badge reflects unread count
When the app is installed and `navigator.setAppBadge` is available, the app SHALL call `navigator.setAppBadge(unreadCount)` whenever the total unread count changes. When unread count reaches zero, the app SHALL call `navigator.clearAppBadge()`.

#### Scenario: Badge set on unread messages
- **WHEN** the unread message count is greater than zero
- **THEN** the installed app icon displays the unread count as a numeric badge

#### Scenario: Badge cleared on all-read
- **WHEN** all messages are marked read
- **THEN** the badge is cleared from the app icon

---

### Requirement: Badge gracefully degrades when unsupported
When `navigator.setAppBadge` is not available (Firefox, Safari, non-installed), the app SHALL NOT throw or display an error. The unread count SHALL remain visible within the app UI regardless of badge support.

#### Scenario: No error on unsupported browser
- **WHEN** the app runs in a browser that does not support the Badging API
- **THEN** no JavaScript error is thrown and the in-app unread indicator is still shown

---

### Requirement: Badge is updated from the main thread on unread count changes
Badge updates SHALL be triggered from the main thread's unread count store subscription, not from the Service Worker. The badge SHALL update immediately when the user reads or deletes messages (i.e., reflects the optimistic local state from `idb:messages`).

#### Scenario: Badge decrements on mark-read
- **WHEN** the user marks a message as read while online
- **THEN** the badge count decrements by 1 immediately

#### Scenario: Badge reflects optimistic offline state
- **WHEN** the user marks messages as read while offline (optimistic update)
- **THEN** the badge count decrements immediately without waiting for server sync

---

### Requirement: Logging for badge updates, toggled at runtime
The app SHALL emit `console.debug` for every badge set and clear operation when `localStorage.getItem('mailbrus:debug') === 'true'`. Logging is available in both development and production builds.

#### Scenario: Badge set logged in dev
- **WHEN** `navigator.setAppBadge` is called in a dev build
- **THEN** `[badge] set {n}` appears in the console
