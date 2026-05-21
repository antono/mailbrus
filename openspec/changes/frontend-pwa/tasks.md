## 1. Manifest & Installation

- [x] 1.1 Create `static/manifest.webmanifest` with name, short_name, icons (192×192 + 512×512), display, start_url, theme_color, background_color
- [x] 1.2 Add `<link rel="manifest">` and `<meta name="theme-color">` to `app.html`
- [x] 1.3 Generate and add PWA icons (192px and 512px PNG) to `static/icons/`
- [x] 1.4 Declare `Compose` and `Inbox` shortcuts in manifest
- [x] 1.5 Add `share_target` to manifest (accepts text, url, files → `/compose`)
- [x] 1.6 Implement `beforeinstallprompt` handler in layout — store deferred event, show install button
- [x] 1.7 Hide install button when `display-mode: standalone` is detected

## 2. Service Worker — Registration & Lifecycle

- [x] 2.1 Create `src/sw.ts` (compiled to `static/sw.js` by Vite)
- [x] 2.2 Register SW in `+layout.svelte` `onMount` with `updateViaCache: 'none'`, browser-only guard
- [x] 2.3 Implement SW `install` event: pre-cache app shell into `app-shell-v{hash}`; call `skipWaiting()`
- [x] 2.4 Implement SW `activate` event: delete old `app-shell-v*` and `message-bodies-v*` caches; call `clients.claim()`

## 3. Service Worker — Caching Strategies

- [x] 3.1 Intercept `GET /api/messages*`: network-first with 5s timeout, cache fallback, update cache on success
- [x] 3.2 Intercept `GET /api/messages/:id`: cache-first from `message-bodies-v{hash}`, fetch+cache on miss
- [x] 3.3 Implement 7-day TTL eviction for `message-bodies-v{hash}` on SW activate
- [x] 3.4 Intercept `GET /assets/*`: cache-first from `assets-v{hash}`, 30-day TTL eviction on activate
- [x] 3.5 Pass through `POST /api/send`, `PATCH /api/messages/*`, `DELETE /api/messages/*` network-only; reject on network error (do not return cached response)

## 4. IndexedDB — Foundation

- [x] 4.1 Create `src/lib/idb.ts`: open `mailbrus` database, define `onupgradeneeded` creating stores: `outbox`, `mutations`, `messages`, `frecency`, `settings`
- [x] 4.2 Export typed CRUD helpers: `idbGet`, `idbPut`, `idbDelete`, `idbGetAll` for each store
- [x] 4.3 Add `__DEV__` logging wrapper around all IDB operations (stripped by Vite `define` in production)

## 5. Settings Persistence

- [x] 5.1 Implement `src/lib/settings.ts`: load all keys from `idb:settings` into Svelte store on boot
- [x] 5.2 Subscribe to settings store changes; write through to IDB on each change
- [x] 5.3 Mirror `theme` key to `localStorage` on write; read `localStorage.theme` on init for pre-JS flash prevention
- [x] 5.4 Add `last_folder`, `search_history` (MRU, max 50), `sort_order`, `push_subscription` keys with defaults
- [x] 5.5 Integrate `last_folder` — restore on boot; update on folder navigation
- [x] 5.6 Integrate `sort_order` — restore on boot; persist on change
- [x] 5.7 Integrate `search_history` — prepend on search submit, deduplicate, cap at 50; show in search dropdown

## 6. Offline Message Cache (idb:messages)

- [x] 6.1 After each successful `/api/messages` fetch, upsert message metadata into `idb:messages` (keyed by UID + folder)
- [x] 6.2 On folder open, read from `idb:messages` first (instant render), then update when network responds
- [x] 6.3 Expose `getLocalMessages(folder)` in the data layer, used by the message list component

## 7. Outbox Queue ("Not Sent")

- [x] 7.1 Implement `src/lib/outbox.ts`: `enqueue(draft)` writes to `idb:outbox` with `status: 'queued'`; `flushOutbox()` processes queue
- [x] 7.2 On send failure (network error from SW), call `outbox.enqueue` instead of surfacing error
- [x] 7.3 SW: handle `sync` event for tag `outbox-sync` — call shared flush logic
- [x] 7.4 Main thread fallback: register `window.addEventListener('online', flushOutbox)` and `visibilitychange` handler
- [x] 7.5 Merge `idb:outbox` entries into message list view (Outbox/Sent folder); render "Not sent" badge for `status: 'queued' | 'failed'`
- [x] 7.6 SW posts `outbox-updated` message to all clients after flush; main thread refreshes message list on receipt
- [x] 7.7 Add dev console logging: enqueue, flush start, per-entry sent/failed

## 8. Mutations Queue (Read State & Deletions)

- [x] 8.1 Implement `src/lib/mutations.ts`: `enqueueMutation(op, message_id, folder, args?)` writes to `idb:mutations` and applies optimistically to `idb:messages`
- [x] 8.2 Replace direct API calls for mark-read, mark-unread, delete with `enqueueMutation` + optimistic IDB update
- [x] 8.3 SW: handle `sync` event for tag `mutations-sync` — compact queue then flush
- [x] 8.4 Implement compaction: last read-state op wins per `message_id`; `delete` drops all prior read-state mutations for that message
- [x] 8.5 On flush: `PATCH /api/messages/:id` for read-state ops; `DELETE /api/messages/:id` for deletions
- [x] 8.6 On server 404/conflict: mark mutation `failed`, revert `idb:messages` to server state, post `mutations-conflict` to clients
- [x] 8.7 Main thread: show non-blocking "Some changes could not be applied" notice on `mutations-conflict` message
- [x] 8.8 Add fallback triggers: `online` event and `visibilitychange` flush mutations queue (shared with outbox flush)
- [x] 8.9 Add dev console logging: enqueue, compact result, per-entry applied/conflict
- [x] 8.10 Server: add `tracing::debug!` logs under `[pwa]` prefix for `PATCH /api/messages/:id` and `DELETE /api/messages/:id`

## 9. Frecency

- [x] 9.1 Implement `src/lib/frecency.ts`: `recordVisit(store, key)` appends timestamp to ring buffer (max 20) in `idb:frecency`
- [x] 9.2 Implement `getRanked(store, prefix?)`: compute Mozilla bucket frecency score per item, return sorted descending
- [x] 9.3 Wire `recordVisit('folders', path)` on every folder navigation
- [x] 9.4 Wire folder picker to use `getRanked('folders')` as default order
- [x] 9.5 Wire `recordVisit('contacts', email)` on every recipient added in compose
- [x] 9.6 Wire contact/recipient autocomplete to use `getRanked('contacts', prefix)` for suggestions
- [x] 9.7 Wire `recordVisit('searches', query)` on search submit; wire search history dropdown to `getRanked('searches')`
- [x] 9.8 Add dev console logging: `recordVisit` with resulting score

## 10. Push Notifications

- [x] 10.1 Add VAPID key generation to `mailbrus-server` startup (generate + persist to config if missing)
- [x] 10.2 Implement `POST /api/push/subscribe` — store subscription JSON against account
- [x] 10.3 Implement `DELETE /api/push/subscribe` — remove subscription for account
- [x] 10.4 Implement server-side push trigger: on new mail (polling or IMAP IDLE), send Web Push to subscribed accounts
- [x] 10.5 Add `tracing::debug!` logs for all `/api/push/*` endpoints under `[pwa]` prefix
- [x] 10.6 SW: handle `push` event — parse payload, `showNotification` with subject/sender + Reply/Archive actions
- [x] 10.7 SW: handle `notificationclick` — `clients.openWindow` to thread URL on body click; fire `PATCH` archive on Archive action
- [x] 10.8 Frontend: implement "Enable notifications" toggle in settings — call `PushManager.subscribe` with VAPID key, POST to server, save to `idb:settings`
- [x] 10.9 Frontend: implement notification disable — `PushManager.unsubscribe`, DELETE to server, clear `idb:settings`
- [x] 10.10 Add dev console logging for push events and subscription changes

## 11. Badging

- [x] 11.1 Implement `src/lib/badge.ts`: `setBadge(n)` calls `navigator.setAppBadge(n)` if available, `clearBadge()` calls `navigator.clearAppBadge()`; no-op if API unavailable
- [x] 11.2 Subscribe to unread count derived store; call `setBadge` / `clearBadge` on change
- [x] 11.3 Ensure badge updates use optimistic unread count from `idb:messages` (reflects offline mark-read immediately)
- [x] 11.4 Add dev console logging: `[badge] set {n}` and `[badge] clear`

## 12. Logging Infrastructure

- [x] 12.1 Implement `src/lib/pwa-log.ts`: `pwaLog(namespace, ...args)` — calls `console.debug` only when `localStorage.getItem('mailbrus:debug') === 'true'`; available in all builds
- [x] 12.2 Pass debug flag to SW at registration time via query param (`/sw.js?debug=1`) so SW can enable logging without localStorage access
- [x] 12.3 Implement SW-side `pwaLog` that reads the `debug` query param from `self.location.search`
- [x] 12.4 Document in README: enable debug logging with `localStorage.setItem('mailbrus:debug', 'true')` + refresh (works in production)
