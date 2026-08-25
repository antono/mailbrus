/**
 * SSE event-shape contract for the `/api/sync/stream` channel after the
 * notmuch-database change: every frame carries a `type` discriminator
 * (`"sync"` | `"index"` | `"sync_finished"`).
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '../harness/fixtures.ts';
import { cloneCorpus, removeClone, type Clone } from '../harness/clone.ts';
import { writeFixtureConfig, addAccountToml, type ConfigEntry } from '../harness/config.ts';
import { indexClone } from '../harness/notmuch.ts';
import { startServer, type ServerHandle } from '../harness/server.ts';
import { startStalwart, type StalwartHandle } from '../harness/stalwart.ts';

interface StreamFrame {
	type?: string;
	account_id?: string;
	status?: 'running' | 'done' | 'error';
	fetched?: number;
	indexed?: number;
	error?: string;
	accounts?: string[];
}

/** Read `data:` JSON frames until one matches `pred` or the deadline elapses. */
async function readSseUntil(
	body: ReadableStream<Uint8Array>,
	pred: (f: StreamFrame) => boolean,
	timeoutMs: number
): Promise<StreamFrame[]> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	const deadline = Date.now() + timeoutMs;
	let pending = '';
	const frames: StreamFrame[] = [];
	while (Date.now() < deadline) {
		const remaining = deadline - Date.now();
		const tick = await Promise.race([
			reader.read(),
			new Promise<{ value: undefined; done: true }>((r) =>
				setTimeout(() => r({ value: undefined, done: true }), remaining)
			)
		]);
		if (tick.done) break;
		pending += decoder.decode(tick.value, { stream: true });
		const lines = pending.split('\n');
		pending = lines.pop() ?? '';
		for (const line of lines) {
			if (!line.startsWith('data:')) continue;
			try {
				const frame = JSON.parse(line.slice(5).trim()) as StreamFrame;
				frames.push(frame);
				if (pred(frame)) {
					await reader.cancel();
					return frames;
				}
			} catch {
				// ignore keep-alives / malformed frames
			}
		}
	}
	await reader.cancel();
	return frames;
}

// openspec/specs/notmuch-database/spec.md: SyncEvent carries type discriminator
test('sync stream frames carry a "type":"sync" discriminator', async ({ app }) => {
	const account = app.config.entries[0].id;

	// Subscribe before triggering so the early `running` frame isn't missed.
	const sse = await fetch(`${app.baseURL}/api/sync/stream`, {
		headers: { Accept: 'text/event-stream' }
	});
	expect(sse.ok).toBe(true);

	const trigger = await fetch(`${app.baseURL}/api/sync/${encodeURIComponent(account)}`, {
		method: 'POST'
	});
	expect(trigger.status).toBe(202);

	// The placeholder IMAP host (imap.invalid) never connects, but the engine
	// still emits a typed `sync` frame for the account before failing.
	const frames = await readSseUntil(sse.body!, (f) => f.type === 'sync', 20_000);
	const sync = frames.find((f) => f.type === 'sync');
	expect(sync, `expected a sync frame, got: ${JSON.stringify(frames)}`).toBeDefined();
	expect(sync!.account_id).toBe(account);
	expect(['running', 'done', 'error']).toContain(sync!.status);
});

// openspec/specs/notmuch-database/spec.md: SyncFinished event on SSE stream
//
// run_account_worker emits SyncFinished after the terminal SyncEvent even when
// the IMAP backend fails, so this test works with the default harness.
test('sync stream emits SyncFinished after terminal sync frame', async ({ app }) => {
	const account = app.config.entries[0].id;

	const sse = await fetch(`${app.baseURL}/api/sync/stream`, {
		headers: { Accept: 'text/event-stream' }
	});
	expect(sse.ok).toBe(true);

	await fetch(`${app.baseURL}/api/sync/${encodeURIComponent(account)}`, {
		method: 'POST'
	});

	const frames = await readSseUntil(sse.body!, (f) => f.type === 'sync_finished', 20_000);
	const finished = frames.find((f) => f.type === 'sync_finished');
	expect(finished, `expected sync_finished frame, got: ${JSON.stringify(frames)}`).toBeDefined();
	expect(finished!.accounts).toContain(account);
});

// openspec/specs/notmuch-database/spec.md: Indexing emits done event
//
// Reaching an `{"type":"index","status":"done"}` frame requires a *successful*
// IMAP sync that fetches and indexes. The default `app` fixture's accounts point
// at placeholder IMAP hosts, so this drives its own Stalwart-backed server. (It
// was previously fixme'd on the belief that Stalwart refuses cleartext auth; it
// does not — see the principal notes in `e2e/harness/stalwart.ts`.)
test('indexing emits an index event with status:done', async () => {
	test.slow();
	let clone: Clone | undefined;
	let stalwart: StalwartHandle | undefined;
	let server: ServerHandle | undefined;
	try {
		clone = await cloneCorpus();
		const scope = await indexClone(clone);
		stalwart = await startStalwart({
			users: [
				{
					email: 'alice@test.local',
					secret: 'stalwart-secret',
					inboxMessages: [
						[
							'From: tester@test.local',
							'To: alice@test.local',
							'Subject: index event fixture',
							'Message-ID: <index-event-137@test.local>',
							'',
							'Body.'
						].join('\r\n')
					]
				}
			]
		});
		const base = await writeFixtureConfig(clone);
		const maildir = join(clone.maildir, 'alice@test.local');
		await mkdir(maildir, { recursive: true });
		const entry: ConfigEntry = { id: 'alice@test.local', maildirRoot: maildir };
		await addAccountToml(base.accountsDir, {
			...entry,
			toml: [
				'protocol = "imap"',
				'email = "alice@test.local"',
				'imap_host = "127.0.0.1"',
				`imap_port = ${stalwart.imapPort}`,
				'imap_tls = false',
				'credential_backend = "plain"',
				'credential_ref = "stalwart-secret"',
				`maildir_root = "${maildir}"`,
				''
			].join('\n')
		});
		server = await startServer({
			scope,
			clone,
			config: { path: base.path, accountsDir: base.accountsDir, entries: [...base.entries, entry] }
		});

		const sse = await fetch(`${server.baseURL}/api/sync/stream`, {
			headers: { Accept: 'text/event-stream' }
		});
		await fetch(`${server.baseURL}/api/sync/${encodeURIComponent(entry.id)}`, { method: 'POST' });
		const frames = await readSseUntil(
			sse.body!,
			(f) => f.type === 'index' && f.status === 'done',
			30_000
		);
		const done = frames.find((f) => f.type === 'index' && f.status === 'done');
		expect(done, `no index:done frame; got ${JSON.stringify(frames)}`).toBeDefined();
		expect(done!.indexed).toBeGreaterThan(0);
	} finally {
		if (server) await server.stop();
		if (stalwart) await stalwart.stop();
		await removeClone(clone);
	}
});
