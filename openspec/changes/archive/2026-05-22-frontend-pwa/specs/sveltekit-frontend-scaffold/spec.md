## ADDED Requirements

### Requirement: Service Worker is registered in the SvelteKit app layout
The root SvelteKit layout (`+layout.svelte` or `+layout.ts`) SHALL register the Service Worker at `onMount` using `navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })`. Registration SHALL only run in browser context (guarded by `typeof navigator !== 'undefined'`).

#### Scenario: SW registered on first app mount
- **WHEN** the SvelteKit app mounts in a browser
- **THEN** `navigator.serviceWorker.register` is called with `/sw.js`

#### Scenario: SW registration skipped during SSR/prerender
- **WHEN** the app runs in a server-side or prerender context
- **THEN** no Service Worker registration is attempted

---

### Requirement: Web App Manifest is linked in the HTML head
The SvelteKit `app.html` (or `<svelte:head>`) SHALL include `<link rel="manifest" href="/manifest.webmanifest">`. The manifest file SHALL be placed in the `static/` directory.

#### Scenario: Manifest linked in document head
- **WHEN** any page of the app is rendered
- **THEN** the HTML `<head>` contains a `<link rel="manifest" href="/manifest.webmanifest">`

---

### Requirement: Theme color meta tag matches manifest theme_color
`app.html` SHALL include `<meta name="theme-color" content="{theme_color}">` matching the manifest `theme_color` value so the browser toolbar color is consistent.

#### Scenario: Theme color meta present
- **WHEN** any page is loaded
- **THEN** `<meta name="theme-color">` is present in the `<head>`
