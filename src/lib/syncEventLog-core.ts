// openspec/changes/sync-status-bar-redesign/specs/sync-event-log/spec.md
//
// Pure logic for the sync event log, extracted from `syncEventLog.svelte.ts` so
// it can be unit-tested without a Svelte runtime (same pattern as
// `dispatcher-core.ts` / `scope-core.ts`). No runes, no localStorage, no Date.

/** Hard cap on persisted lines; oldest are dropped FIFO past this. */
export const MAX_EVENTS = 2000;
/** Suppress an identical (account+event+detail) event repeated within this window. */
export const DEDUP_WINDOW_MS = 100;

/**
 * One log line. `event` is a CLI-friendly type (e.g. `fetching`, `indexed`,
 * `sync_completed`). `detail` is optional human context and MUST NOT contain
 * secrets. `archived` marks events belonging to a completed (prior) run.
 */
export interface SyncLogEvent {
	timestamp: string; // ISO8601
	account: string;
	event: string;
	detail?: string;
	archived?: boolean;
}

/** A completed run reconstructed from archived events for the history view. */
export interface SyncLogRun {
	finishedAt: string;
	events: SyncLogEvent[];
	summary: string;
}

/** Drop the oldest entries (FIFO) so at most `max` remain. Mutates in place. */
export function trimEvents(events: SyncLogEvent[], max: number = MAX_EVENTS): void {
	if (events.length > max) {
		events.splice(0, events.length - max);
	}
}

/**
 * True if a `(account, event, detail)` event arriving at `nowMs` duplicates the
 * `last` recorded event within `windowMs` — used to suppress rapid duplicate
 * frames. Different detail (e.g. changing counts) is never a duplicate.
 */
export function isDuplicate(
	last: SyncLogEvent | undefined,
	account: string,
	event: string,
	detail: string | undefined,
	nowMs: number,
	windowMs: number = DEDUP_WINDOW_MS
): boolean {
	if (!last) return false;
	return (
		last.account === account &&
		last.event === event &&
		last.detail === detail &&
		nowMs - new Date(last.timestamp).getTime() < windowMs
	);
}

/** Keep only well-formed event records (defensive against corrupt storage). */
export function parseStoredEvents(parsed: unknown): SyncLogEvent[] {
	if (!Array.isArray(parsed)) return [];
	return parsed.filter(
		(e): e is SyncLogEvent =>
			!!e &&
			typeof e.timestamp === 'string' &&
			typeof e.account === 'string' &&
			typeof e.event === 'string'
	);
}

/**
 * Group archived events into completed runs for the history view, newest run
 * first. A run ends at a `sync_completed`/`sync_failed` marker; trailing
 * archived events with no terminal marker still form a (final) run so nothing
 * is hidden.
 */
export function groupRuns(archived: SyncLogEvent[]): SyncLogRun[] {
	const runs: SyncLogRun[] = [];
	let current: SyncLogEvent[] = [];
	const flush = () => {
		if (current.length === 0) return;
		const last = current[current.length - 1];
		const accounts = new Set(current.map((e) => e.account)).size;
		const fetched = current.filter((e) => e.event === 'fetched').length;
		runs.push({
			finishedAt: last.timestamp,
			events: current,
			summary: `${accounts} account${accounts !== 1 ? 's' : ''}, ${fetched} fetch event${fetched !== 1 ? 's' : ''}`
		});
		current = [];
	};
	for (const e of archived) {
		current.push(e);
		if (e.event === 'sync_completed' || e.event === 'sync_failed') flush();
	}
	flush();
	return runs.reverse();
}
