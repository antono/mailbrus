/**
 * One-time prerequisites shared by every test:
 *  - notmuch must be installed (fail fast, can't be built here)
 *  - the SPA must be built (`build/index.html`)
 *  - the release `mailbrus-server` binary must be up to date with the sources
 *
 * The server is rebuilt **unconditionally**, not just when the binary is
 * missing. An `existsSync` guard silently pins the whole suite to whatever
 * stale binary happens to be on disk: the suite goes green against code from
 * weeks ago while appearing to validate the working tree. Cargo is incremental,
 * so a warm no-op rebuild costs ~0.2s — far less than one misleading pass.
 *
 * Playwright browsers are validated by Playwright itself when a context is
 * created; in Nix shells they come from `PLAYWRIGHT_BROWSERS_PATH`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_DIR, PRISTINE_MAILDIR, REPO_ROOT, SERVER_BIN } from './paths.ts';

export default function globalSetup(): void {
	try {
		execFileSync('notmuch', ['--version'], { stdio: 'ignore' });
	} catch {
		throw new Error(
			"notmuch is required for the E2E suite but was not found on PATH. " +
				'Install it (Nix devShell already provides it) and re-run.'
		);
	}

	if (!existsSync(PRISTINE_MAILDIR)) {
		throw new Error(
			`pristine corpus missing at ${PRISTINE_MAILDIR}. Run \`deno task e2e:generate\` first.`
		);
	}

	if (!existsSync(join(BUILD_DIR, 'index.html'))) {
		console.log('[global-setup] building SPA (deno task build)…');
		execFileSync('deno', ['task', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
	}

	// Always build: see the staleness note in the module docstring.
	console.log('[global-setup] building mailbrus-server (cargo build --release)…');
	execFileSync('cargo', ['build', '--release', '-p', 'mailbrus-server'], {
		cwd: REPO_ROOT,
		stdio: 'inherit'
	});
	if (!existsSync(SERVER_BIN)) {
		throw new Error(`cargo reported success but ${SERVER_BIN} is missing`);
	}
}
