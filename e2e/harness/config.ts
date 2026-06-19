/**
 * Generate per-account TOML files under `accounts/` that mirror the cloned
 * corpus. The new config format uses one flat `<email>.toml` per account
 * (no `[accounts.X]` wrapper). The `--config` flag takes the base directory;
 * accounts are discovered by scanning `<dir>/accounts/*.toml`.
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Clone } from './clone.ts';

/** Account row injected into the test config: id + maildir_root. */
export interface ConfigEntry {
	id: string;
	maildirRoot: string;
}

export interface ConfigHandle {
	/** Base config directory (passed to --config). Contains accounts/ inside. */
	path: string;
	/** Accounts subdirectory: write extra *.toml files here to add accounts. */
	accountsDir: string;
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

/** Flat per-account TOML (no [accounts.X] wrapper). Filename stem = id = email. */
export function renderAccountToml(entry: ConfigEntry): string {
	return [
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

/**
 * Write a per-account TOML file into `accountsDir/<entry.id>.toml`.
 * Call after `writeFixtureConfig` to inject extra accounts (e.g. a
 * Stalwart-backed test account) without rebuilding the whole config.
 */
export async function addAccountToml(
	accountsDir: string,
	entry: ConfigEntry & { toml?: string }
): Promise<void> {
	const body = entry.toml ?? renderAccountToml(entry);
	await writeFile(join(accountsDir, `${entry.id}.toml`), body);
}

/** Write fixture config with all accounts from the cloned corpus. */
export async function writeFixtureConfig(clone: Clone): Promise<ConfigHandle> {
	const entries = await scanAccounts(clone);
	const configDir = join(clone.root, 'mailbrus-config');
	const accountsDir = join(configDir, 'accounts');
	await mkdir(accountsDir, { recursive: true });
	for (const entry of entries) {
		await addAccountToml(accountsDir, entry);
	}
	return { path: configDir, accountsDir, entries };
}

/** Write a config directory with an empty accounts/ (zero-account onboarding state). */
export async function writeEmptyFixtureConfig(clone: Clone): Promise<ConfigHandle> {
	const configDir = join(clone.root, 'mailbrus-config');
	const accountsDir = join(configDir, 'accounts');
	await mkdir(accountsDir, { recursive: true });
	return { path: configDir, accountsDir, entries: [] };
}
