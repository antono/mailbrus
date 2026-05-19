## ADDED Requirements

### Requirement: SvelteKit project scaffold at workspace root
The project root SHALL contain `svelte.config.js`, `vite.config.js`, `deno.json`, and `src/` with a minimal SvelteKit app (at least one route at `src/routes/+page.svelte`).

#### Scenario: Dev server starts
- **WHEN** user runs `deno task dev`
- **THEN** Vite dev server starts and serves the SvelteKit app on a local port

#### Scenario: Frontend builds to static output
- **WHEN** user runs `deno task build`
- **THEN** `build/` directory is produced containing `index.html` and static assets

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
