/**
 * Auto-initialization of the mailbrus-owned notmuch database.
 *
 * Unlike most specs these do NOT use the default `app` fixture, because the
 * fixture pre-indexes the clone (runs `notmuch new`). Here we need to control
 * whether a database exists before the server starts, so each test wires the
 * clone → (optional index) → server lifecycle by hand.
 */
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '../harness/fixtures.ts';
import { cloneCorpus, removeClone, type Clone } from '../harness/clone.ts';
import { writeFixtureConfig } from '../harness/config.ts';
import { indexClone } from '../harness/notmuch.ts';
import { startServer, type ServerHandle } from '../harness/server.ts';

async function exists(p: string): Promise<boolean> {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}

// openspec/specs/notmuch-database/spec.md: First startup creates database
test('server auto-creates the notmuch database on first start', async () => {
	let clone: Clone | undefined;
	let server: ServerHandle | undefined;
	try {
		// Fresh clone, deliberately NOT indexed: no `.notmuch/` exists yet.
		clone = await cloneCorpus();
		const config = await writeFixtureConfig(clone);
		expect(await exists(join(clone.maildir, '.notmuch'))).toBe(false);

		// Start the server with no notmuch scope at all; it must build its own DB.
		server = await startServer({ clone, config });

		// The server created the index and wrote its managed config on startup.
		expect(await exists(join(clone.maildir, '.notmuch'))).toBe(true);
		expect(await exists(join(clone.maildir, 'notmuch.cfg'))).toBe(true);

		// And it answers queries against the freshly created (empty) database.
		const res = await fetch(`${server.baseURL}/api/maildirs`);
		expect(res.ok).toBe(true);
	} finally {
		if (server) await server.stop();
		await removeClone(clone);
	}
});

// openspec/specs/notmuch-database/spec.md: Existing database is not overwritten
test('server opens an existing notmuch database without re-initializing', async () => {
	let clone: Clone | undefined;
	let server: ServerHandle | undefined;
	try {
		// Pre-index the clone, then start the server: the corpus must stay queryable.
		clone = await cloneCorpus();
		await indexClone(clone);
		const config = await writeFixtureConfig(clone);
		expect(await exists(join(clone.maildir, '.notmuch'))).toBe(true);

		server = await startServer({ clone, config });

		const res = await fetch(`${server.baseURL}/api/messages/search?q=${encodeURIComponent('*')}`);
		expect(res.ok).toBe(true);
		const body = (await res.json()) as { count: number };
		// The pre-existing index was opened as-is, not wiped: the corpus is visible.
		expect(body.count).toBeGreaterThan(0);
	} finally {
		if (server) await server.stop();
		await removeClone(clone);
	}
});
