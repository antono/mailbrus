/**
 * Generate a mailbrus config.toml that mirrors the cloned corpus's account
 * layout. The server uses this to populate `/api/maildirs`; existing tests
 * that previously relied on filesystem-based account discovery now drive the
 * same data through the typed config.
 *
 * The IMAP fields are placeholders — they are only used if a sync is
 * triggered, which existing tests do not do.
 */
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Clone } from './clone.ts';

/** Account row injected into the test config: id + maildir_root. */
export interface ConfigEntry {
	id: string;
	maildirRoot: string;
}

export interface ConfigHandle {
	path: string;
	entries: ConfigEntry[];
}

/** Scan the cloned corpus for account directories (one level deep, ignoring dotfiles). */
async function scanAccounts(clone: Clone): Promise<ConfigEntry[]> {
	const entries = await readdir(clone.maildir, { withFileTypes: true });
	const accounts: ConfigEntry[] = [];
	for (const e of entries) {
		if (!e.isDirectory() || e.name.startsWith('.')) continue;
		accounts.push({ id: e.name, maildirRoot: join(clone.maildir, e.name) });
	}
	accounts.sort((a, b) => a.id.localeCompare(b.id));
	return accounts;
}

/** TOML-escape a string for a double-quoted basic string. */
function escape(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Build an account section. `id` is used as the TOML table key and as the
 * `email` placeholder — most tests assert `id == address`, which the existing
 * filesystem path produced naturally.
 */
function renderAccount(entry: ConfigEntry): string {
	const idKey = /^[A-Za-z0-9_-]+$/.test(entry.id) ? entry.id : `"${escape(entry.id)}"`;
	return [
		`[accounts.${idKey}]`,
		`protocol = "imap"`,
		`email = "${escape(entry.id)}"`,
		`imap_host = "imap.invalid"`,
		`imap_port = 993`,
		`imap_tls = true`,
		`credential_backend = "keyring"`,
		`credential_ref = "${escape(entry.id)}"`,
		`maildir_root = "${escape(entry.maildirRoot)}"`,
		''
	].join('\n');
}

/** Write a fresh config.toml at `<clone.root>/mailbrus-config.toml`. */
export async function writeFixtureConfig(clone: Clone): Promise<ConfigHandle> {
	const entries = await scanAccounts(clone);
	const body = entries.map(renderAccount).join('\n');
	const path = join(clone.root, 'mailbrus-config.toml');
	await writeFile(path, body);
	return { path, entries };
}
