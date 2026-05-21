## ADDED Requirements

### Requirement: Push subscription can be created and stored
The app SHALL expose a "Enable notifications" control in settings. When the user consents, the app SHALL call `PushManager.subscribe` with the server's VAPID public key, then `POST /api/push/subscribe` with the resulting `PushSubscription` JSON. The subscription SHALL be persisted in `idb:settings` under `push_subscription`.

#### Scenario: User enables notifications
- **WHEN** the user grants notification permission and activates the enable-notifications control
- **THEN** a push subscription is created and sent to the server, and stored in `idb:settings`

#### Scenario: Permission denied — no subscription attempt
- **WHEN** the user denies the notification permission prompt
- **THEN** no subscription is created and the control shows a "Permission denied" state

---

### Requirement: Push subscription can be revoked
When the user disables notifications, the app SHALL call `PushManager.unsubscribe` and `DELETE /api/push/subscribe`. The `push_subscription` entry in `idb:settings` SHALL be cleared.

#### Scenario: User disables notifications
- **WHEN** the user toggles off notifications in settings
- **THEN** the subscription is removed from the server and cleared locally

---

### Requirement: Server exposes VAPID push endpoints
`mailbrus-server` SHALL expose:
- `POST /api/push/subscribe` — accepts `PushSubscription` JSON, associates it with the authenticated account, persists it
- `DELETE /api/push/subscribe` — removes the subscription for the authenticated account
- (Internal) sends a Web Push message when new mail arrives

#### Scenario: Subscription stored server-side
- **WHEN** `POST /api/push/subscribe` is called with a valid subscription
- **THEN** the server responds 200 and the subscription is persisted

#### Scenario: Push sent on new mail
- **WHEN** new mail arrives for an account with an active subscription
- **THEN** the server sends a Web Push message to that subscription within 60 seconds

---

### Requirement: Service Worker handles push events and shows notifications
The SW SHALL handle the `push` event, parse the payload, and call `self.registration.showNotification` with the message subject as title, sender as body, and two actions: `reply` and `archive`.

#### Scenario: Notification shown on push
- **WHEN** the SW receives a `push` event
- **THEN** a system notification appears with subject, sender, and Reply/Archive actions

#### Scenario: Notification click opens app at thread
- **WHEN** the user clicks the notification body (not an action)
- **THEN** `clients.openWindow` navigates to or focuses the app at the relevant message thread

#### Scenario: Archive action from notification
- **WHEN** the user taps the Archive notification action
- **THEN** a `PATCH /api/messages/:id` (move to Archive) request is sent without opening the app

---

### Requirement: Logging for push events, toggled at runtime
The SW and main thread SHALL emit `console.debug` logs for push received, notification shown, and subscription changes when `localStorage.getItem('mailbrus:debug') === 'true'`. Logging is available in both development and production builds. Server SHALL log at `DEBUG` under the `[pwa]` prefix for all `/api/push/*` endpoints (enabled via `RUST_LOG=mailbrus_server::pwa=debug`).

#### Scenario: Push received logged
- **WHEN** the SW `push` event fires in a dev build
- **THEN** `[push] received` appears in the SW console

#### Scenario: Server logs subscription
- **WHEN** `POST /api/push/subscribe` is called with `RUST_LOG=mailbrus_server::pwa=debug`
- **THEN** `[pwa] push/subscribe account={acct}` appears in server logs
