/**
 * Server-side flag propagation and atomic maildir delivery.
 *
 * These drive a real Stalwart sidecar, sync once, change flags on the server out
 * of band (simulating "read on another client"), sync again, and assert the
 * local state followed. Flag propagation cannot be tested any other way: the
 * change has to happen on the server, between two syncs.
 *
 * ALL FOUR ARE `test.fixme` — they require a *completing* sync, which this
 * harness cannot currently produce. Stalwart 0.15.5 rejects cleartext IMAP
 * authentication regardless of `imap.auth.allow-plain-text`, so the worker
 * terminates at the auth step:
 *
 *   authenticate as alice@test.local: AUTHENTICATE PLAIN: ... NO Authentication
 *   failed; LOGIN: ... NO Authentication failed
 *
 * This is the same limitation `sync.spec.ts` documents, and it is not specific
 * to imap-client: the harness's own cleartext `AUTHENTICATE PLAIN` is rejected
 * too (verified directly — a subsequent `UID STORE` returns `NO Not
 * authenticated`). A side effect is that `injectMail` currently seeds nothing,
 * because `imapTalk` resolves on a tagged `NO` as readily as on `OK`.
 *
 * Enable these the moment a TLS-capable Stalwart listener (or a confirmed
 * cleartext opt-in) lands: the assertions below are the real contract for
 * `imap-sync`'s flag-propagation and atomic-delivery requirements, and the
 * behaviour they describe is covered meanwhile by the unit tests in
 * `mailbrus-core/src/sync/imap.rs` and `state.rs`.
 */
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '../harness/fixtures.ts';
import { cloneCorpus, removeClone, type Clone } from '../harness/clone.ts';
import { writeFixtureConfig, addAccountToml, type ConfigEntry } from '../harness/config.ts';
import { indexClone } from '../harness/notmuch.ts';
import { startServer, type ServerHandle } from '../harness/server.ts';
import { startStalwart, setServerFlags, type StalwartHandle } from '../harness/stalwart.ts';

const ACCOUNT = 'alice@test.local';
const SECRET = 'stalwart-secret';
const MESSAGE_ID = '<flag-sync-137@test.local>';
const FIXTURE_SUBJECT = 'flag sync fixture';

const FIXTURE_MESSAGE = [
	'From: tester@test.local',
	`To: ${ACCOUNT}`,
	`Subject: ${FIXTURE_SUBJECT}`,
	'Date: Thu, 20 Aug 2026 00:00:00 +0000',
	`Message-ID: ${MESSAGE_ID}`,
	'',
	'Body for the flag sync test.'
].join('\r\n');

interface Harness {
	clone: Clone;
	stalwart: StalwartHandle;
	server: ServerHandle;
	entry: ConfigEntry;
	maildir: string;
}

/** Stand up a corpus clone, a Stalwart sidecar with one seeded message, and a
 *  server with a single account pointed at that sidecar. */
async function setup(): Promise<Harness> {
	const clone = await cloneCorpus();
	const scope = await indexClone(clone);
	const stalwart = await startStalwart({
		users: [{ email: ACCOUNT, secret: SECRET, inboxMessages: [FIXTURE_MESSAGE] }]
	});
	const baseConfig = await writeFixtureConfig(clone);
	const maildir = join(clone.maildir, ACCOUNT);
	await mkdir(maildir, { recursive: true });
	const entry: ConfigEntry = { id: ACCOUNT, maildirRoot: maildir };
	await addAccountToml(baseConfig.accountsDir, {
		...entry,
		toml: [
			`protocol = "imap"`,
			`email = "${ACCOUNT}"`,
			`imap_host = "127.0.0.1"`,
			`imap_port = ${stalwart.imapPort}`,
			`imap_tls = false`,
			`credential_backend = "plain"`,
			`credential_ref = "${SECRET}"`,
			`maildir_root = "${maildir}"`,
			''
		].join('\n')
	});
	const server = await startServer({
		scope,
		clone,
		config: {
			path: baseConfig.path,
			accountsDir: baseConfig.accountsDir,
			entries: [...baseConfig.entries, entry]
		}
	});
	return { clone, stalwart, server, entry, maildir };
}

async function teardown(h: Harness | undefined): Promise<void> {
	if (!h) return;
	await h.server.stop();
	await h.stalwart.stop();
	await removeClone(h.clone);
}

interface TerminalEvent {
	status: string;
	error?: string;
}

/**
 * Trigger a sync and wait for its terminal event on the SSE stream.
 *
 * The stream is opened *before* the POST so the early events cannot be missed —
 * there is no polling endpoint that reports a run's outcome after the fact.
 */
async function syncAndWait(h: Harness, timeoutMs = 30_000): Promise<TerminalEvent> {
	const sse = await fetch(`${h.server.baseURL}/api/sync/stream`, {
		headers: { Accept: 'text/event-stream' }
	});
	expect(sse.ok).toBe(true);

	const trigger = await fetch(`${h.server.baseURL}/api/sync/${h.entry.id}`, { method: 'POST' });
	expect(trigger.status).toBe(202);

	const reader = sse.body!.getReader();
	const decoder = new TextDecoder();
	const deadline = Date.now() + timeoutMs;
	let pending = '';
	const seen: unknown[] = [];
	try {
		while (Date.now() < deadline) {
			const tick = await Promise.race([
				reader.read(),
				new Promise<{ value: undefined; done: true }>((r) =>
					setTimeout(() => r({ value: undefined, done: true }), deadline - Date.now())
				)
			]);
			if (tick.done) break;
			pending += decoder.decode(tick.value, { stream: true });
			const lines = pending.split('\n');
			pending = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.startsWith('data:')) continue;
				let frame: { account_id?: string; status?: string; error?: string };
				try {
					frame = JSON.parse(line.slice(5).trim());
				} catch {
					continue;
				}
				seen.push(frame);
				if (frame.account_id !== h.entry.id || !frame.status) continue;
				if (frame.status === 'done' || frame.status === 'error') {
					return { status: frame.status, error: frame.error };
				}
			}
		}
	} finally {
		await reader.cancel().catch(() => {});
	}
	throw new Error(`sync did not reach a terminal event; saw: ${JSON.stringify(seen)}`);
}

/**
 * Folder ids the server reports for our account.
 *
 * The endpoint returns a bare array; the tolerant unwrap is here so a future
 * `{ folders: [...] }` envelope would not silently reduce this to an empty list
 * (which reads as "message not found" rather than "helper broke").
 */
async function folderIds(h: Harness): Promise<string[]> {
	const r = await fetch(
		`${h.server.baseURL}/api/maildirs/${encodeURIComponent(h.entry.id)}/folders`
	);
	if (!r.ok) return [];
	const body = (await r.json()) as
		| { id?: string; name?: string }[]
		| { folders?: { id?: string; name?: string }[] };
	const list = Array.isArray(body) ? body : (body.folders ?? []);
	const ids = list.map((f) => f.id ?? f.name ?? '').filter(Boolean);
	if (ids.length === 0) throw new Error('no folders reported for the synced account');
	return ids;
}

/**
 * The `unread` flag the API reports for our fixture message, or undefined if it
 * is not indexed at all.
 *
 * Matches on subject rather than id: `unread` is derived from the maildir
 * filename flags (`mime.rs` -> `!m.flags.seen`), which is exactly the observable
 * a flag rename must move, while the id encoding is an internal detail.
 * Searches every folder so a differing folder-id convention cannot mask a pass.
 */
async function reportedUnread(h: Harness): Promise<boolean | undefined> {
	for (const folder of await folderIds(h)) {
		const r = await fetch(
			`${h.server.baseURL}/api/maildirs/${encodeURIComponent(h.entry.id)}/folders/${encodeURIComponent(folder)}/messages`
		);
		if (!r.ok) continue;
		const body = (await r.json()) as { messages?: { subject?: string; unread?: boolean }[] };
		const hit = body.messages?.find((m) => m.subject === FIXTURE_SUBJECT);
		if (hit) return hit.unread;
	}
	return undefined;
}

async function curFilenames(h: Harness): Promise<string[]> {
	try {
		return (await readdir(join(h.maildir, 'INBOX', 'cur'))).sort();
	} catch {
		return [];
	}
}

test.describe('IMAP flag propagation', () => {
	// openspec/changes/imap-flag-sync-atomic-delivery/specs/imap-sync/spec.md: a message marked read on another client becomes read locally
	test('a \\Seen set server-side propagates to the local maildir', async () => {
		test.slow();
		let h: Harness | undefined;
		try {
			h = await setup();

			const first = await syncAndWait(h);
			expect(
				first.status,
				`first sync must complete to deliver the fixture; got ${JSON.stringify(first)}`
			).toBe('done');

			// Delivered, and unread: the fixture was APPENDed with no flags.
			expect(await reportedUnread(h)).toBe(true);
			const before = await curFilenames(h);
			expect(before, 'exactly one delivered file').toHaveLength(1);

			// Simulate reading it on another client.
			await setServerFlags({
				imapPort: h.stalwart.imapPort,
				email: ACCOUNT,
				secret: SECRET,
				flags: ['\\Seen'],
				mode: 'add'
			});

			const second = await syncAndWait(h);
			expect(second.status).toBe('done');

			// The observable requirement: the message is no longer unread.
			expect(await reportedUnread(h)).toBe(false);

			// And it was a rename, not a re-delivery: still one file, new name.
			const after = await curFilenames(h);
			expect(after, 'flag change must not add a second copy').toHaveLength(1);
			expect(after[0]).not.toBe(before[0]);
			expect(after[0]).toMatch(/:2,[^,]*S/);
		} finally {
			await teardown(h);
		}
	});

	// openspec/changes/imap-flag-sync-atomic-delivery/specs/imap-sync/spec.md: a flag cleared on another client is removed locally
	test('clearing \\Seen server-side removes it locally', async () => {
		test.slow();
		let h: Harness | undefined;
		try {
			h = await setup();

			// Mark it read on the server before the first sync, so it is
			// delivered already-seen and we can assert the removal direction.
			await setServerFlags({
				imapPort: h.stalwart.imapPort,
				email: ACCOUNT,
				secret: SECRET,
				flags: ['\\Seen'],
				mode: 'add'
			});
			expect((await syncAndWait(h)).status).toBe('done');
			expect(await reportedUnread(h)).toBe(false);

			await setServerFlags({
				imapPort: h.stalwart.imapPort,
				email: ACCOUNT,
				secret: SECRET,
				flags: ['\\Seen'],
				mode: 'remove'
			});

			expect((await syncAndWait(h)).status).toBe('done');
			expect(await reportedUnread(h), 'clearing \\Seen must make it unread again').toBe(true);
		} finally {
			await teardown(h);
		}
	});

	// openspec/changes/imap-flag-sync-atomic-delivery/specs/imap-sync/spec.md: an unchanged flag set causes no rename
	test('a sync with no flag change leaves the filename untouched', async () => {
		test.slow();
		let h: Harness | undefined;
		try {
			h = await setup();
			expect((await syncAndWait(h)).status).toBe('done');
			const before = await curFilenames(h);
			expect(before).toHaveLength(1);

			// Second sync with nothing changed server-side. Without the
			// normalise-both-sides comparison this renames and re-indexes every
			// reported message on every sync.
			expect((await syncAndWait(h)).status).toBe('done');
			expect(await curFilenames(h)).toEqual(before);
		} finally {
			await teardown(h);
		}
	});

	// openspec/changes/imap-flag-sync-atomic-delivery/specs/imap-sync/spec.md: delivery is atomic — tmp/ holds nothing once a sync settles
	test('delivery leaves nothing behind in tmp/', async () => {
		test.slow();
		let h: Harness | undefined;
		try {
			h = await setup();
			expect((await syncAndWait(h)).status).toBe('done');

			const tmp = await readdir(join(h.maildir, 'INBOX', 'tmp')).catch(() => []);
			expect(tmp, `tmp/ must be empty after delivery, found: ${tmp.join(', ')}`).toHaveLength(0);
		} finally {
			await teardown(h);
		}
	});
});
