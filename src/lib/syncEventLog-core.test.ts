// openspec/changes/sync-status-bar-redesign/specs/sync-event-log/spec.md
import { assertEquals } from 'jsr:@std/assert';
import {
	trimEvents,
	isDuplicate,
	parseStoredEvents,
	groupRuns,
	type SyncLogEvent
} from './syncEventLog-core.ts';

function evt(over: Partial<SyncLogEvent> = {}): SyncLogEvent {
	return {
		timestamp: over.timestamp ?? '2026-06-23T10:00:00.000Z',
		account: over.account ?? 'a@example.com',
		event: over.event ?? 'fetching',
		...(over.detail !== undefined ? { detail: over.detail } : {}),
		...(over.archived !== undefined ? { archived: over.archived } : {})
	};
}

// ── trim (task 1.6) ──────────────────────────────────────────────────────────

Deno.test('trimEvents drops oldest (FIFO) past the cap', () => {
	const events = Array.from({ length: 5 }, (_, i) => evt({ event: `e${i}` }));
	trimEvents(events, 3);
	assertEquals(events.length, 3);
	assertEquals(events.map((e) => e.event), ['e2', 'e3', 'e4']);
});

Deno.test('trimEvents is a no-op under the cap', () => {
	const events = [evt({ event: 'a' }), evt({ event: 'b' })];
	trimEvents(events, 10);
	assertEquals(events.length, 2);
});

// ── dedup (task 1.7 / 6.3) ─────────────────────────────────────────────────────

Deno.test('isDuplicate suppresses identical events within the window', () => {
	const last = evt({ timestamp: '2026-06-23T10:00:00.000Z', event: 'connecting', detail: 'h:993' });
	const nowMs = new Date('2026-06-23T10:00:00.050Z').getTime(); // +50ms
	assertEquals(isDuplicate(last, 'a@example.com', 'connecting', 'h:993', nowMs, 100), true);
});

Deno.test('isDuplicate allows the same event after the window', () => {
	const last = evt({ timestamp: '2026-06-23T10:00:00.000Z', event: 'connecting', detail: 'h:993' });
	const nowMs = new Date('2026-06-23T10:00:00.200Z').getTime(); // +200ms
	assertEquals(isDuplicate(last, 'a@example.com', 'connecting', 'h:993', nowMs, 100), false);
});

Deno.test('isDuplicate treats a changed detail as a new event', () => {
	const last = evt({ event: 'fetched', detail: '10 messages' });
	const nowMs = new Date(last.timestamp).getTime() + 10;
	assertEquals(isDuplicate(last, 'a@example.com', 'fetched', '20 messages', nowMs, 100), false);
});

Deno.test('isDuplicate with no prior event is never a duplicate', () => {
	assertEquals(isDuplicate(undefined, 'a@example.com', 'fetching', undefined, Date.now(), 100), false);
});

// ── persistence parsing (task 1.5) ────────────────────────────────────────────

Deno.test('parseStoredEvents keeps valid records and drops malformed ones', () => {
	const parsed = parseStoredEvents([
		evt({ event: 'ok' }),
		{ nope: true },
		{ timestamp: 1, account: 'x', event: 'bad-ts' },
		'not-an-object'
	]);
	assertEquals(parsed.length, 1);
	assertEquals(parsed[0].event, 'ok');
});

Deno.test('parseStoredEvents returns [] for non-arrays', () => {
	assertEquals(parseStoredEvents(null), []);
	assertEquals(parseStoredEvents({ foo: 1 }), []);
});

// ── run grouping (tasks 2.3 / 2.4 / 4.6) ───────────────────────────────────────

Deno.test('groupRuns splits archived events at completion markers, newest first', () => {
	const archived: SyncLogEvent[] = [
		evt({ timestamp: '2026-06-23T10:00:00.000Z', event: 'connecting', archived: true }),
		evt({ timestamp: '2026-06-23T10:00:01.000Z', event: 'fetched', detail: '5 messages', archived: true }),
		evt({ timestamp: '2026-06-23T10:00:02.000Z', event: 'sync_completed', archived: true }),
		evt({ timestamp: '2026-06-23T11:00:00.000Z', event: 'connecting', archived: true }),
		evt({ timestamp: '2026-06-23T11:00:01.000Z', event: 'sync_failed', archived: true })
	];
	const runs = groupRuns(archived);
	assertEquals(runs.length, 2);
	// Newest run (the failed one) comes first.
	assertEquals(runs[0].finishedAt, '2026-06-23T11:00:01.000Z');
	assertEquals(runs[0].events.length, 2);
	assertEquals(runs[1].finishedAt, '2026-06-23T10:00:02.000Z');
	assertEquals(runs[1].summary, '1 account, 1 fetch event');
});

Deno.test('groupRuns keeps a trailing run with no terminal marker', () => {
	const runs = groupRuns([
		evt({ event: 'sync_completed', timestamp: '2026-06-23T10:00:00.000Z', archived: true }),
		evt({ event: 'connecting', timestamp: '2026-06-23T11:00:00.000Z', archived: true })
	]);
	assertEquals(runs.length, 2);
});

Deno.test('groupRuns returns [] for no archived events', () => {
	assertEquals(groupRuns([]), []);
});
