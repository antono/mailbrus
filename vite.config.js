import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port: 5173
	},
	// Emit source maps for the production build too. `deno task server` serves this
	// build locally; readable stacks make runtime errors (e.g. effect loops) point
	// at real source instead of minified chunk offsets. Harmless for a local dev tool.
	build: {
		sourcemap: true
	}
});
