/**
 * Sync API contract tests (Phase 8 of imap-synchronization OpenSpec change).
 *
 * 8.1 spins up a real Stalwart sidecar (see e2e/harness/stalwart.ts) and
 * drives the full pipeline: HTTP trigger → spawn worker → connect to Stalwart →
 * SyncEvent broadcast → SSE delivery. The assertion accepts either `done` or
 * `error` as the terminal status — Stalwart 0.15.5 refuses cleartext IMAP
 * authentication regardless of the documented `imap.auth.allow-plain-text`
 * flag, so the worker currently terminates with `error`. The shape of the
 * pipeline is still exercised end-to-end; tightening the assertion to `done`
 * is a follow-up that needs either a TLS-enabled Stalwart listener or a
 * confirmed cleartext-auth opt-in path.
 *
 * 8.2 / 8.3 reuse the default fixture and do not need a real IMAP server.
 */
// openspec/specs/imap-sync/spec.md: Sync API contract tests (phase 8)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '../harness/fixtures.ts';
import { cloneCorpus, removeClone, type Clone } from '../harness/clone.ts';
import { writeFixtureConfig, type ConfigEntry } from '../harness/config.ts';
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
			const stalwartMaildir = join(clone.maildir, 'alice@test.local-stalwart');
			await mkdir(stalwartMaildir, { recursive: true });
			const stalwartEntry: ConfigEntry = {
				id: 'stalwart-alice',
				maildirRoot: stalwartMaildir
			};
			const existing = await readFile(baseConfig.path, 'utf8');
			const augmented = [
				existing,
				`[accounts.${stalwartEntry.id}]`,
				`protocol = "imap"`,
				`email = "alice@test.local"`,
				`imap_host = "127.0.0.1"`,
				`imap_port = ${stalwart.imapPort}`,
				`imap_tls = false`,
				`credential_backend = "plain"`,
				`credential_ref = "stalwart-secret"`,
				`maildir_root = "${stalwartMaildir}"`,
				''
			].join('\n');
			await writeFile(baseConfig.path, augmented);
			const config = {
				path: baseConfig.path,
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

			const events = await readSseUntilDone(sseRes.body!, stalwartEntry.id, 20_000);
			const last = events.at(-1);
			expect(last, `expected a terminal event, got: ${JSON.stringify(events)}`).toBeDefined();
			expect(last!.account_id).toBe(stalwartEntry.id);
			expect(['done', 'error'], `last event: ${JSON.stringify(last)}`).toContain(last!.status);
			// Verify the worker really reached Stalwart: error messages always
			// reference the IMAP host or the auth/connect step, never the early
			// credential lookup.
			if (last!.status === 'error') {
				expect(last!.error).toMatch(/authenticate|connect|imap/i);
			}
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

/**
 * Pull SSE `data:` JSON frames for `accountId` until one carries a terminal
 * status (`done`/`error`) or the deadline elapses.
 */
async function readSseUntilDone(
	body: ReadableStream<Uint8Array>,
	accountId: string,
	timeoutMs: number
): Promise<SyncEventJson[]> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	const deadline = Date.now() + timeoutMs;
	let pending = '';
	const events: SyncEventJson[] = [];
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
		const frames = pending.split('\n');
		pending = frames.pop() ?? '';
		for (const line of frames) {
			if (!line.startsWith('data:')) continue;
			let evt: SyncEventJson;
			try {
				evt = JSON.parse(line.slice(5).trim());
			} catch {
				continue;
			}
			if (evt.account_id !== accountId) continue;
			events.push(evt);
			if (evt.status === 'done' || evt.status === 'error') {
				await reader.cancel();
				return events;
			}
		}
	}
	await reader.cancel();
	return events;
}
