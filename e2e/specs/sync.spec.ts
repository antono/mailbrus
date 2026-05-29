/**
 * Sync API contract tests (Phase 8 of imap-synchronization OpenSpec change).
 *
 * These tests drive the HTTP surface only — they do NOT require a real IMAP
 * server. The fixture config's IMAP placeholders point at `imap.invalid`, so a
 * sync run resolves to an `error` SyncEvent rather than `done`. That still
 * exercises the full POST -> spawn worker -> broadcast event -> SSE pipeline,
 * which is what these tests need to validate.
 *
 * Once a Stalwart (or other real IMAP) test sidecar is wired up, 8.1 can be
 * tightened to assert `status === "done"`.
 */
// openspec/changes/imap-synchronization/tasks.md — phase 8
import { test, expect } from '../harness/fixtures.ts';

test.describe('POST /api/sync', () => {
	test('returns 202 and SSE stream emits an event for the dispatched sync', async ({
		baseURL,
		config
	}) => {
		// Subscribe to the SSE stream first so we don't miss the first event.
		const sseRes = await fetch(`${baseURL}/api/sync/stream`, {
			headers: { Accept: 'text/event-stream' }
		});
		expect(sseRes.ok, 'SSE stream must be reachable').toBe(true);

		// Trigger a sync of all accounts.
		const trigger = await fetch(`${baseURL}/api/sync`, { method: 'POST' });
		expect(trigger.status).toBe(202);
		const body = (await trigger.json()) as { job?: string };
		expect(body.job).toBe('all');

		// Read at least one event from the SSE stream.
		const reader = sseRes.body!.getReader();
		const decoder = new TextDecoder();
		const deadline = Date.now() + 10_000;
		let received = '';
		let sawEvent = false;
		while (Date.now() < deadline && !sawEvent) {
			const { value, done } = await reader.read();
			if (done) break;
			received += decoder.decode(value, { stream: true });
			if (received.includes('data:')) sawEvent = true;
		}
		await reader.cancel();
		expect(sawEvent, `expected at least one SSE 'data:' line, got: ${received}`).toBe(true);

		// The first event for any of the accounts in the config must reference
		// one of those account ids and a known status.
		const dataLines = received
			.split('\n')
			.filter((l) => l.startsWith('data:'))
			.map((l) => JSON.parse(l.slice(5).trim()));
		expect(dataLines.length).toBeGreaterThan(0);
		const known = config.entries.map((e) => e.id);
		for (const evt of dataLines) {
			expect(known).toContain(evt.account_id);
			expect(['running', 'done', 'error']).toContain(evt.status);
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
