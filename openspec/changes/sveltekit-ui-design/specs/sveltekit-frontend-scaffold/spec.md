## Reference

- **`reference/Mailbrus.html`** — the entry-point HTML that loads all prototype scripts and styles; the target output of `deno task build` should reproduce this visual result inside Tauri

## MODIFIED Requirements

### Requirement: SvelteKit project scaffold at workspace root
The project root SHALL contain `svelte.config.js`, `vite.config.js`, `deno.json`, and `src/` with the full Mailbrus SvelteKit application. `src/routes/+page.svelte` SHALL be the full app shell (account → folder → list → reader / compose state machine), not a placeholder. `src/lib/` SHALL contain all component and utility modules. `src/app.css` SHALL import the Mailbrus design-system stylesheets.

#### Scenario: Dev server starts
- **WHEN** user runs `deno task dev`
- **THEN** Vite dev server starts and serves the full Mailbrus UI on a local port

#### Scenario: Frontend builds to static output
- **WHEN** user runs `deno task build`
- **THEN** `build/` directory is produced containing `index.html` and static assets
