## Purpose

Define the Service Worker that powers offline capability, caching strategies, and runtime fetch interception for the mailbrus PWA.

## Requirements

### Requirement: Service Worker is registered on app load
The SvelteKit app SHALL register a Service Worker (`/sw.js`) on first load using `navigator.serviceWorker.register`. Registration SHALL use `updateViaCache: 'none'` so the browser always revalidates the SW script. The SW SHALL skip waiting and claim clients immediately on activation.

#### Scenario: SW registers successfully
- **WHEN** the user visits the app for the first time
- **THEN** `navigator.serviceWorker.controller` is non-null after the page load

#### Scenario: New SW activates on next navigation
- **WHEN** a new SW version is detected and the user navigates to a new page
- **THEN** the new SW version takes control

### Requirement: App shell is cached on SW install
The SW SHALL pre-cache the app shell (HTML entry point, JS bundles, CSS, fonts, icons) into a versioned cache `app-shell-v{build-hash}` during the `install` event. Old app-shell caches SHALL be deleted during `activate`.

#### Scenario: App loads offline after first visit
- **WHEN** the user visits the app once online, then goes offline and refreshes
- **THEN** the app shell loads from cache without a network request

#### Scenario: Old cache purged on update
- **WHEN** a new SW activates with a new build hash
- **THEN** `app-shell-v{old-hash}` is deleted from the Cache API

### Requirement: Message list is fetched network-first with cache fallback
GET requests to `/api/messages*` SHALL use a network-first strategy: attempt the network with a 5-second timeout, falling back to the cached response. The cached response SHALL be updated on each successful network fetch.

#### Scenario: Online — fresh list served
- **WHEN** the device is online and the message list is requested
- **THEN** the response comes from the network and updates the cache

#### Scenario: Offline — stale list served
- **WHEN** the device is offline and the message list is requested
- **THEN** the last cached response is returned

#### Scenario: Network timeout fallback
- **WHEN** the network request exceeds 5 seconds
- **THEN** the cached response is returned immediately

### Requirement: Message bodies are cached cache-first with 7-day TTL
GET requests to `/api/messages/:id` SHALL use a cache-first strategy. Cached entries older than 7 days SHALL be evicted. Cache store name: `message-bodies-v{build-hash}`.

#### Scenario: Cached body served offline
- **WHEN** a message body was previously fetched and the device is offline
- **THEN** the cached body is returned

#### Scenario: Stale entry evicted
- **WHEN** a cached message body entry is older than 7 days
- **THEN** the entry is deleted from the cache on the next SW activation

### Requirement: Static assets are cached cache-first with 30-day TTL
Avatars and static images (`/assets/*`) SHALL use a cache-first strategy with a 30-day TTL. Cache store: `assets-v{build-hash}`.

#### Scenario: Avatar served from cache
- **WHEN** an avatar was previously fetched
- **THEN** subsequent requests serve it from cache without hitting the network

### Requirement: Mutation endpoints are never cached
`POST /api/send`, `PATCH /api/messages/*`, `DELETE /api/messages/*`, and `/api/push/*` SHALL always bypass the cache and go directly to the network. If the network is unavailable the SW SHALL reject the fetch so the caller can enqueue it in the mutations/outbox queue.

#### Scenario: POST /api/send offline — network error propagated
- **WHEN** the device is offline and the SW intercepts `POST /api/send`
- **THEN** the SW rejects with a network error (not a cached response)

### Requirement: Logging for all SW cache events, toggled at runtime
The SW SHALL emit `console.debug` log lines for every cache read, write, eviction, and strategy decision when logging is enabled. Logging is available in both development and production builds and is controlled by `localStorage.getItem('mailbrus:debug') === 'true'`. The SW SHALL read the debug flag at registration time (passed as a query param `?debug=1` on the SW URL by the main thread). See design Decision 8 for log format.

#### Scenario: Cache write logged when debug enabled
- **WHEN** `mailbrus:debug` is `'true'` and the SW writes a response to a cache store
- **THEN** `[cache:write] {store} {url}` appears in the browser console

#### Scenario: No logs when debug disabled
- **WHEN** `mailbrus:debug` is not set or is `'false'`
- **THEN** no `[cache:*]` or `[SW]` debug logs are emitted

#### Scenario: Debug can be enabled in production
- **WHEN** a user sets `localStorage.setItem('mailbrus:debug', 'true')` in a production build and refreshes
- **THEN** SW and main-thread debug logs begin appearing in the console
