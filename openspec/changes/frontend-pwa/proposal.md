## Why

The mailbrus SvelteKit frontend runs in a browser tab with no offline capability, no OS integration, and no background activity. PWA features unlock installability, offline reading, and background sync — making the web frontend a first-class alternative to the Tauri desktop app on platforms where it isn't available (Linux web, mobile).

## What Changes

- Add Web App Manifest enabling "Install" prompts on desktop and mobile
- Register a Service Worker for caching and background tasks
- Implement Cache API strategies: app-shell (stale-while-revalidate) and message-body cache (cache-first with TTL)
- Implement Background Sync to retry outbox sends when connectivity returns
- Add Web Push Notification support for new mail alerts
- Add Badging API support to show unread count on installed app icon
- IndexedDB used by `frontend-data-layer` for offline message metadata and draft persistence

## Capabilities

### New Capabilities

- `pwa-manifest`: Web App Manifest — app name, icons, theme, display mode, shortcuts (Compose, Inbox), `share_target` for receive-file-attach flow
- `pwa-service-worker`: Service Worker registration, lifecycle management, and caching strategies (app-shell cache, message-body cache, avatar/asset cache)
- `pwa-background-sync`: Background Sync API for queuing outbox sends when offline and retrying on reconnect; foreground-sync fallback for unsupported browsers (Firefox, Safari)
- `pwa-push-notifications`: Web Push (VAPID) integration — subscribe, receive, display notifications with Reply/Archive actions; service worker notification handler
- `pwa-badging`: Badging API to reflect unread count on the installed PWA icon; graceful no-op on unsupported browsers

### Modified Capabilities

- `sveltekit-frontend-scaffold`: Service Worker registration and Web App Manifest wiring into the SvelteKit app layout
- `frontend-data-layer`: Add IndexedDB-backed offline storage for message metadata, drafts, and sync tokens (currently in-memory only)

## Impact

- **Frontend**: `src/` — manifest.json, service-worker.ts, push subscription flow, badge update calls
- **Backend (mailbrus-server)**: VAPID key generation and Web Push endpoint for push subscription management
- **Offline**: Cached messages remain readable without network; outbox queue survives offline periods
- **Browser support**: Core features (install, cache, SW) work in all modern browsers; Background Sync is Chromium-only (progressive enhancement); Badging is Chromium-only (progressive enhancement)
