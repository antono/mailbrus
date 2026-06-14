/**
 * SSE event-shape contract for the `/api/sync/stream` channel after the
 * notmuch-database change: every frame carries a `type` discriminator
 * (`"sync"` | `"index"`).
 */
import { test, expect } from '../harness/fixtures.ts';

interface StreamFrame {
	type?: string;
	account_id?: string;
	status?: 'running' | 'done' | 'error';
	fetched?: number;
	indexed?: number;
	error?: string;
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

// openspec/changes/mailbrus-notmuch-database/specs/notmuch-database/spec.md: SyncEvent carries type discriminator
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

// openspec/changes/mailbrus-notmuch-database/specs/notmuch-database/spec.md: Indexing emits done event
//
// Reaching an `{"type":"index","status":"done"}` frame requires a *successful*
// IMAP sync that fetches new messages and indexes them. The per-test harness
// has no live IMAP backend that authenticates (the Stalwart sidecar in
// sync.spec.ts terminates at `error` — it refuses cleartext auth), so the
// indexing path is never entered with fetched messages. Enable this once a
// TLS-capable Stalwart (or equivalent) lets a sync complete `done`.
test.fixme('indexing emits an index event with status:done', async ({ app }) => {
	const account = app.config.entries[0].id;
	const sse = await fetch(`${app.baseURL}/api/sync/stream`, {
		headers: { Accept: 'text/event-stream' }
	});
	await fetch(`${app.baseURL}/api/sync/${encodeURIComponent(account)}`, { method: 'POST' });
	const frames = await readSseUntil(
		sse.body!,
		(f) => f.type === 'index' && f.status === 'done',
		20_000
	);
	const done = frames.find((f) => f.type === 'index' && f.status === 'done');
	expect(done).toBeDefined();
	expect(done!.indexed).toBeGreaterThan(0);
});
