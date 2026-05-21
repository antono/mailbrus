## MODIFIED Requirements

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
