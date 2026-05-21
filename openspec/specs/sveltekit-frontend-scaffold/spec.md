## Purpose

Define the SvelteKit frontend scaffold that provides the web interface for the mailbrus desktop application.
## Requirements
### Requirement: SvelteKit project scaffold at workspace root
The project root SHALL contain `svelte.config.js`, `vite.config.js`, `deno.json`, and `src/` with the full Mailbrus SvelteKit application. `src/routes/+page.svelte` SHALL be the full app shell (account → folder → list → reader / compose state machine), not a placeholder. `src/lib/` SHALL contain all component and utility modules. `src/app.css` SHALL import the Mailbrus design-system stylesheets.

`svelte.config.js` SHALL set `paths.base = ''` and `paths.relative = false` so that all asset URLs are root-relative (`/`) and resolve correctly when the compiled `build/` directory is served by `mailbrus-server` from any bind address.

#### Scenario: Dev server starts
- **WHEN** user runs `deno task dev`
- **THEN** Vite dev server starts and serves the full Mailbrus UI on a local port

#### Scenario: Frontend builds to static output
- **WHEN** user runs `deno task build`
- **THEN** `build/` directory is produced containing `index.html` and static assets with root-relative asset URLs

#### Scenario: Built frontend served by mailbrus-server
- **WHEN** `mailbrus-server --frontend-dist ./build` is running and browser requests `GET /`
- **THEN** `build/index.html` is served and all asset references (`/assets/*.js`, `/assets/*.css`) resolve correctly

### Requirement: SvelteKit uses static adapter
`svelte.config.js` SHALL configure `@sveltejs/adapter-static` so the build output is a self-contained static site consumable by Tauri's `frontendDist`.

#### Scenario: Build output is static HTML
- **WHEN** `deno task build` completes
- **THEN** `build/index.html` exists and contains no server-side rendering markers

### Requirement: deno.json declares tasks matching cerbo convention
`deno.json` SHALL declare at minimum `dev`, `build`, and `preview` tasks.

#### Scenario: Tasks are present
- **WHEN** user runs `deno task` with no arguments
- **THEN** `dev`, `build`, and `preview` are listed

### Requirement: deno.lock is committed for hermetic Nix builds
`deno.lock` SHALL be committed to the repository so the Nix frontend derivation can reproduce the build without network access.

#### Scenario: Nix frontend build uses lockfile
- **WHEN** `nix build .#mailbrus-frontend` is run without network access
- **THEN** build completes using deps resolved from `deno.lock`

### Requirement: Service Worker is registered in the SvelteKit app layout
The root SvelteKit layout (`+layout.svelte` or `+layout.ts`) SHALL register the Service Worker at `onMount` using `navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })`. Registration SHALL only run in browser context (guarded by `typeof navigator !== 'undefined'`).

#### Scenario: SW registered on first app mount
- **WHEN** the SvelteKit app mounts in a browser
- **THEN** `navigator.serviceWorker.register` is called with `/sw.js`

#### Scenario: SW registration skipped during SSR/prerender
- **WHEN** the app runs in a server-side or prerender context
- **THEN** no Service Worker registration is attempted

### Requirement: Web App Manifest is linked in the HTML head
The SvelteKit `app.html` (or `<svelte:head>`) SHALL include `<link rel="manifest" href="/manifest.webmanifest">`. The manifest file SHALL be placed in the `static/` directory.

#### Scenario: Manifest linked in document head
- **WHEN** any page of the app is rendered
- **THEN** the HTML `<head>` contains a `<link rel="manifest" href="/manifest.webmanifest">`

### Requirement: Theme color meta tag matches manifest theme_color
`app.html` SHALL include `<meta name="theme-color" content="{theme_color}">` matching the manifest `theme_color` value so the browser toolbar color is consistent.

#### Scenario: Theme color meta present
- **WHEN** any page is loaded
- **THEN** `<meta name="theme-color">` is present in the `<head>`

