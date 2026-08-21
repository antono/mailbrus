import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ fallback: 'index.html' }),
		paths: {
			base: '',
			relative: false
		},
		// SvelteKit defaults `version.name` to `Date.now()`, which lands in
		// `_app/version.json` AND is injected into the bundle — so every build
		// produced different content and therefore different content-hashed
		// chunk filenames throughout `_app/immutable/`. That made the
		// `mailbrus-frontend` fixed-output derivation in nix/pkgs.nix
		// unsatisfiable: no `outputHash` can be correct when the output changes
		// every time. Pinning it makes the SPA build reproducible.
		//
		// Override with MAILBRUS_APP_VERSION for a release build (e.g. a git
		// rev); any value works as long as it is stable for a given source tree.
		// Nothing in the app consumes SvelteKit's version-change detection, so a
		// constant default costs nothing.
		version: {
			name: process.env.MAILBRUS_APP_VERSION ?? '0.1.0'
		}
	}
};

export default config;
