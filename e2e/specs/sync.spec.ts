/**
 * Sync API contract tests (Phase 8 of imap-synchronization OpenSpec change).
 *
 * 8.1 spins up a real Stalwart sidecar (see e2e/harness/stalwart.ts) and
 * drives the full pipeline: HTTP trigger → spawn worker → connect to Stalwart →
 * authenticate → fetch → index → SyncEvent broadcast → SSE delivery, asserting
 * a terminal `done` with a non-zero fetch count.
 *
 * This assertion used to accept `done` OR `error`, because cleartext IMAP auth
 * was believed impossible against Stalwart 0.15.5. It is not: the sidecar's
 * principals were misconfigured (the internal directory authenticates by
 * principal `name`, and an account without a role is denied after a successful
 * auth). See the notes in `e2e/harness/stalwart.ts`.
 *
 * 8.2 / 8.3 reuse the default fixture and do not need a real IMAP server.
 */
// openspec/specs/imap-sync/spec.md: Sync API contract tests (phase 8)
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '../harness/fixtures.ts';
import { cloneCorpus, removeClone, type Clone } from '../harness/clone.ts';
import { writeFixtureConfig, addAccountToml, type ConfigEntry } from '../harness/config.ts';
import { indexClone } from '../harness/notmuch.ts';
import { startServer, type ServerHandle } from '../harness/server.ts';
import { startStalwart, type StalwartHandle } from '../harness/stalwart.ts';

const FIXTURE_MESSAGE = [
	'From: tester@test.local',
	'To: alice@test.local',
	'Subject: hello from stalwart',
	'Date: Thu, 29 May 2026 00:00:00 +0000',
	'Message-ID: <stalwart-fixture-1@test.local>',
	'',
	'Hello from the Stalwart sidecar.'
].join('\r\n');

test.describe('POST /api/sync', () => {
	test('returns 202 and drives a SyncEvent through SSE for a Stalwart-backed account', async () => {
		// Spins up a real Stalwart sidecar (~3s+) then drives a full sync run;
		// give it headroom over the default 45s per-test cap under parallel load.
		test.slow();
		let clone: Clone | undefined;
		let stalwart: StalwartHandle | undefined;
		let server: ServerHandle | undefined;
		try {
			// Per-test corpus clone + notmuch index. We add a fresh stalwart-owned
			// maildir into the clone so the sync worker has somewhere to write.
			clone = await cloneCorpus();
			const scope = await indexClone(clone);

			// Real IMAP server with one seeded user holding one fixture message.
			stalwart = await startStalwart({
				users: [{ email: 'alice@test.local', secret: 'stalwart-secret', inboxMessages: [FIXTURE_MESSAGE] }]
			});

			// Mailbrus config: existing corpus accounts (placeholder IMAP, never
			// reached by this test) plus the stalwart-backed one we'll sync.
			const baseConfig = await writeFixtureConfig(clone);
			const stalwartMaildir = join(clone.maildir, 'alice@test.local');
			await mkdir(stalwartMaildir, { recursive: true });
			// Per-account format: filename stem = id = email address.
			const stalwartEntry: ConfigEntry = {
				id: 'alice@test.local',
				maildirRoot: stalwartMaildir
			};
			await addAccountToml(baseConfig.accountsDir, {
				...stalwartEntry,
				toml: [
					`protocol = "imap"`,
					`email = "alice@test.local"`,
					`imap_host = "127.0.0.1"`,
					`imap_port = ${stalwart.imapPort}`,
					`imap_tls = false`,
					`credential_backend = "plain"`,
					`credential_ref = "stalwart-secret"`,
					`maildir_root = "${stalwartMaildir}"`,
					''
				].join('\n')
			});
			const config = {
				path: baseConfig.path,
				accountsDir: baseConfig.accountsDir,
				entries: [...baseConfig.entries, stalwartEntry]
			};

			server = await startServer({ scope, clone, config });

			// Open SSE before triggering sync so we don't miss the early events.
			const sseRes = await fetch(`${server.baseURL}/api/sync/stream`, {
				headers: { Accept: 'text/event-stream' }
			});
			expect(sseRes.ok).toBe(true);

			const trigger = await fetch(`${server.baseURL}/api/sync/${stalwartEntry.id}`, {
				method: 'POST'
			});
			expect(trigger.status).toBe(202);
			expect((await trigger.json()).job).toBe(stalwartEntry.id);

			const { events, allFrames } = await readSseUntilDone(sseRes.body!, stalwartEntry.id, 20_000);
			const last = events.at(-1);
			expect(last, `expected a terminal event, got: ${JSON.stringify(events)}`).toBeDefined();
			expect(last!.account_id).toBe(stalwartEntry.id);
			// Tightened from `['done','error']`: the sidecar's principals are now
			// configured so cleartext auth succeeds, so a sync must actually
			// complete. The old tolerance could not distinguish "pipeline works"
			// from "pipeline dies at auth" — and would have stayed green if the
			// fetch or index phase broke.
			expect(last!.status, `last event: ${JSON.stringify(last)}`).toBe('done');
			// The terminal frame for an account does not itself carry a fetch
			// count, so look for the per-mailbox frame that does. Asserting a
			// non-zero fetch is the part that proves the run got past auth and
			// actually pulled the seeded message.
			const fetchedFrame = allFrames.find(
				(f) =>
					'account_id' in f &&
					f.account_id === stalwartEntry.id &&
					typeof (f as { fetched?: number }).fetched === 'number' &&
					(f as { fetched: number }).fetched > 0
			);
			expect(
				fetchedFrame,
				`expected a frame reporting fetched > 0, got: ${JSON.stringify(allFrames)}`
			).toBeDefined();

			// Verify SyncFinished was emitted for this account.
			const finished = allFrames.find((f) => f.type === 'sync_finished');
			expect(finished, `expected sync_finished in frames, got: ${JSON.stringify(allFrames)}`).toBeDefined();
			expect(finished!.accounts).toContain(stalwartEntry.id);
		} finally {
			if (server) await server.stop();
			if (stalwart) await stalwart.stop();
			await removeClone(clone);
		}
	});
});

test.describe('GET /api/maildirs', () => {
	test('returns the accounts from the config file', async ({ baseURL, config }) => {
		const res = await fetch(`${baseURL}/api/maildirs`);
		expect(res.ok).toBe(true);
		const body = (await res.json()) as Array<{ id: string }>;
		const got = body.map((b) => b.id).sort();
		const expected = config.entries.map((e) => e.id).sort();
		expect(got).toEqual(expected);
	});
});

test.describe('POST /api/sync/:account', () => {
	test('returns 404 for unknown account', async ({ baseURL }) => {
		const res = await fetch(`${baseURL}/api/sync/does-not-exist`, { method: 'POST' });
		expect(res.status).toBe(404);
	});
});

// ── helpers ────────────────────────────────────────────────────────────────

interface SyncEventJson {
	account_id: string;
	mailbox?: string | null;
	status: 'running' | 'done' | 'error';
	fetched: number;
	deleted: number;
	error?: string;
}

interface SyncFinishedJson {
	type: 'sync_finished';
	accounts: string[];
}

type SseFrame = SyncEventJson | SyncFinishedJson;

/**
 * Pull SSE `data:` JSON frames for `accountId` until one carries a terminal
 * status (`done`/`error`) or the deadline elapses. Returns both the per-account
 * events and all frames (including sync_finished) for broad assertions.
 *
 * After the terminal event, we keep reading briefly (up to 2 s) to capture
 * any trailing events such as `SyncFinished`.
 */
async function readSseUntilDone(
	body: ReadableStream<Uint8Array>,
	accountId: string,
	timeoutMs: number
): Promise<{ events: SyncEventJson[]; allFrames: SseFrame[] }> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	const deadline = Date.now() + timeoutMs;
	let pending = '';
	const events: SyncEventJson[] = [];
	const allFrames: SseFrame[] = [];
	let terminalFound = false;
	while (Date.now() < deadline) {
		const remaining = deadline - Date.now();
		// After the terminal event, only wait an extra 2 s for trailing frames.
		const sliceTimeout = terminalFound ? Math.min(remaining, 2_000) : remaining;
		const tick = await Promise.race([
			reader.read(),
			new Promise<{ value: undefined; done: true }>((r) =>
				setTimeout(() => r({ value: undefined, done: true }), sliceTimeout)
			)
		]);
		if (tick.done) break;
		pending += decoder.decode(tick.value, { stream: true });
		const lines = pending.split('\n');
		pending = lines.pop() ?? '';
		for (const line of lines) {
			if (!line.startsWith('data:')) continue;
			let evt: SseFrame;
			try {
				evt = JSON.parse(line.slice(5).trim());
			} catch {
				continue;
			}
			allFrames.push(evt);
			if (!terminalFound && 'account_id' in evt && evt.account_id === accountId) {
				events.push(evt);
				if (evt.status === 'done' || evt.status === 'error') {
					terminalFound = true;
				}
			}
		}
		if (terminalFound && !pending.includes('data:')) {
			// No more frames buffered; give it a moment for trailing events.
			// The shorter sliceTimeout on the next iteration handles this.
		}
	}
	await reader.cancel();
	return { events, allFrames };
}
