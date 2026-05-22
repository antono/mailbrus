/** Scoped notmuch config + indexing for a single clone (hermetic per test). */
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Clone } from './clone.ts';

const run = promisify(execFile);

export interface NotmuchScope {
	/** Absolute path to the per-clone notmuch config (for `NOTMUCH_CONFIG`). */
	configPath: string;
}

/**
 * Writes a clone-scoped notmuch config, runs `notmuch new` against it, and
 * asserts the resolved database lives inside the clone before returning.
 *
 * `NOTMUCH_CONFIG` is set explicitly for both the indexer here and (later) the
 * server, so neither ever touches the developer's real `~/.notmuch-config`.
 */
export async function indexClone(clone: Clone): Promise<NotmuchScope> {
	const configPath = join(clone.root, 'notmuch-config');
	const config = [
		'[database]',
		`path=${clone.maildir}`,
		'[user]',
		'name=Mailbrus E2E',
		'primary_email=e2e@example.com',
		'[new]',
		'tags=',
		// `.gitkeep` placeholders preserve empty maildir folders in git; never index them.
		'ignore=.gitkeep',
		'[maildir]',
		'synchronize_flags=true',
		'[search]',
		'exclude_tags=',
		''
	].join('\n');
	await writeFile(configPath, config);

	const env = { ...process.env, NOTMUCH_CONFIG: configPath };

	try {
		await run('notmuch', ['new'], { env });
	} catch (e) {
		throw new Error(
			`notmuch new failed (is 'notmuch' installed and on PATH?): ${(e as Error).message}`
		);
	}

	// Hermeticity guard: the resolved DB must be inside this clone.
	const { stdout } = await run('notmuch', ['config', 'get', 'database.path'], { env });
	const dbPath = stdout.trim();
	if (dbPath !== clone.maildir && !dbPath.startsWith(`${clone.root}/`)) {
		throw new Error(
			`hermeticity violation: notmuch database.path=${dbPath} is outside clone ${clone.root}`
		);
	}

	return { configPath };
}
