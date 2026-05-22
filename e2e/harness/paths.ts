/** Absolute filesystem locations the harness and specs rely on. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)); // .../e2e/harness

/** `e2e/` directory. */
export const E2E_ROOT = resolve(HERE, '..');
/** Repository root (where `deno.json`, `Cargo.toml`, `build/` live). */
export const REPO_ROOT = resolve(E2E_ROOT, '..');

/** The pristine, committed, READ-ONLY maildir corpus. Never indexed in place. */
export const PRISTINE_MAILDIR = resolve(E2E_ROOT, 'fixtures', 'maildir');

/** Built SvelteKit SPA served by the server under test (`--frontend-dist`). */
export const BUILD_DIR = resolve(REPO_ROOT, 'build');

/** Release `mailbrus-server` binary. */
export const SERVER_BIN = resolve(REPO_ROOT, 'target', 'release', 'mailbrus-server');

/** Prefix for per-test temp clones (namespaced so leftovers are easy to find). */
export const CLONE_PREFIX = 'mailbrus-e2e-';
