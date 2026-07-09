// openspec/changes/mailbrus-notmuch-database/specs/notmuch-database/spec.md
// Live sync + indexing state, fed by the `/api/sync/stream` SSE channel.
// Each event carries a `type` discriminator: `"sync"` (IMAP fetch progress) or
// `"index"` (notmuch indexing progress). We fold both into one row per
// account+mailbox so the status bar can render per-account progress.

import { triggerSync } from './api.ts';
import { saveRun } from './syncHistory.svelte.ts';
import { addEvent, archiveCurrentRun } from './syncEventLog.svelte.ts';

export type EventStatus = 'running' | 'done' | 'error';

/**
 * Fine-grained lifecycle milestone forwarded by the server (`type: "lifecycle"`):
 * credential lookup, connection, and fetch phases. `detail` is sanitized.
 */
interface LifecycleEvent {
	type: 'lifecycle';
	account_id: string;
	mailbox: string | null;
	stage: string;
	detail?: string;
}

interface SyncEvent {
	type: 'sync';
	account_id: string;
	mailbox: string | null;
	status: EventStatus;
	fetched: number;
	deleted: number;
	error?: string;
}

interface IndexEvent {
	type: 'index';
	account_id: string;
	mailbox: string | null;
	status: EventStatus;
	indexed: number;
	error?: string;
}

interface SyncFinishedEvent {
	type: 'sync_finished';
	accounts: string[];
}

type StreamEvent = SyncEvent | IndexEvent | LifecycleEvent | SyncFinishedEvent;

export interface SyncRow {
	accountId: string;
	mailbox: string | null;
	syncStatus?: EventStatus;
	fetched: number;
	deleted: number;
	indexStatus?: EventStatus;
	indexed: number;
	error?: string;
	runFinishedAt?: string;
}

export const syncState = $state({
	/** Rows keyed by `${account_id}\0${mailbox}`. */
	rows: {} as Record<string, SyncRow>,
	/** Whether the SSE connection is currently open. */
	connected: false,
	/** Optimistic flag: true user clicked "Sync now" but no SSE event yet. */
	started: false,
	/** True after SyncFinished received; guards against stale reopen events. */
	runClosed: false,
	/** Monotonically increasing run ID for deduplication. */
	runId: 0,
	/** The accounts list from the most recent SyncFinished. */
	lastFinishedAccounts: [] as string[],
});

function rowKey(accountId: string, mailbox: string | null): string {
	return `${accountId}\0${mailbox ?? ''}`;
}

function rowFor(accountId: string, mailbox: string | null): SyncRow {
	const key = rowKey(accountId, mailbox);
	let row = syncState.rows[key];
	if (!row) {
		row = { accountId, mailbox, fetched: 0, deleted: 0, indexed: 0 };
		syncState.rows[key] = row;
	}
	return row;
}

function applyEvent(evt: StreamEvent): void {
	// A fresh `running` sync event is the server's "new run started" signal — the
	// engine sends it first for every run. If `runClosed` is still set from the
	// previous run, reopen it here so this run's `sync`/`index` events are not
	// dropped by the straggler guard below. This matters for syncs NOT initiated
	// via the UI (`requestSync`), e.g. the push-poller / auto-sync, which would
	// otherwise leave `runClosed` true and lose the final `Sync(Done, fetched)` —
	// surfacing as "sync_completed 0 fetched" despite a successful fetch. Also
	// roll the prior run into history, mirroring what `requestSync` does.
	if (evt.type === 'sync' && evt.status === 'running' && syncState.runClosed) {
		syncState.runClosed = false;
		archiveCurrentRun();
	}

	// Capture a timestamped line in the event log for every lifecycle milestone.
	if (evt.type === 'lifecycle') {
		addEvent(evt.account_id, evt.stage, evt.detail);
		if (syncState.started) syncState.started = false;
		return;
	}

	if (evt.type === 'sync_finished') {
		syncState.lastFinishedAccounts = evt.accounts;
		syncState.runClosed = true;
		syncState.started = false;
		// Stamp runFinishedAt on every row whose accountId is in the finished list.
		const now = new Date().toISOString();
		for (const row of Object.values(syncState.rows)) {
			if (evt.accounts.length === 0 || evt.accounts.includes(row.accountId)) {
				row.runFinishedAt = now;
			}
		}
		// Log a terminal event per finished account (task 2.3): failed if any of
		// its rows carry an error, completed otherwise.
		const finished = evt.accounts.length > 0 ? evt.accounts : Object.values(syncState.rows).map((r) => r.accountId);
		for (const accountId of new Set(finished)) {
			const rows = Object.values(syncState.rows).filter((r) => r.accountId === accountId);
			const failed = rows.some((r) => r.error);
			if (failed) {
				addEvent(accountId, 'sync_failed', rows.find((r) => r.error)?.error);
			} else {
				const fetched = rows.reduce((n, r) => n + r.fetched, 0);
				addEvent(accountId, 'sync_completed', `${fetched} fetched`);
			}
		}
		// Snapshot history — only if there are rows to capture.
		const allRows = Object.values(syncState.rows);
		if (allRows.length > 0) {
			saveRun(allRows, now);
		}
		return;
	}

	// Any per-row event (sync or index) clears the optimistic flag — live state
	// has arrived.
	if (syncState.started) {
		syncState.started = false;
	}

	// Guard against stale events reopening a closed run: if runClosed is true and
	// this event's account was in the last SyncFinished, treat it as a straggler.
	if (syncState.runClosed && syncState.lastFinishedAccounts.includes(evt.account_id)) {
		return;
	}

	const row = rowFor(evt.account_id, evt.mailbox);
	if (evt.type === 'sync') {
		row.syncStatus = evt.status;
		row.fetched = evt.fetched;
		row.deleted = evt.deleted;
	} else {
		row.indexStatus = evt.status;
		row.indexed = evt.indexed;
		// Log an `indexed` line once indexing for this mailbox completes.
		if (evt.status === 'done') {
			addEvent(evt.account_id, 'indexed', `${evt.indexed} messages`);
		}
	}
	// Last error wins; cleared when a later event for the row succeeds.
	if (evt.status === 'error') {
		row.error = evt.error ?? 'unknown error';
	} else if (evt.status === 'done') {
		row.error = undefined;
	}
}

/** True while any account is actively syncing or indexing. */
export function isActive(): boolean {
	return (
		syncState.started ||
		(!syncState.runClosed &&
			Object.values(syncState.rows).some(
				(r) => r.syncStatus === 'running' || r.indexStatus === 'running'
			))
	);
}

/**
 * Start an on-demand sync unless one is already in flight (in which case this is
 * a no-op). Rejects with the server's error message if the request fails;
 * progress is reflected through the SSE stream, not the returned promise.
 */
export async function requestSync(accountId?: string): Promise<void> {
	if (isActive()) return;
	// A new run begins: archive the previous run's events so the log's "current
	// run" starts fresh and the prior run moves into history (task 2.4).
	archiveCurrentRun();
	syncState.started = true;
	syncState.runClosed = false;
	syncState.runId++;
	try {
		await triggerSync(accountId);
	} catch (e) {
		// HTTP failure clears optimistic state.
		syncState.started = false;
		throw e;
	}
}

/** Aggregate totals across all rows. */
export function totalDerived(): { totalFetched: number; totalIndexed: number; totalErrors: number } {
	const rows = Object.values(syncState.rows);
	let totalFetched = 0;
	let totalIndexed = 0;
	let totalErrors = 0;
	for (const r of rows) {
		totalFetched += r.fetched;
		totalIndexed += r.indexed;
		if (r.error) totalErrors++;
	}
	return { totalFetched, totalIndexed, totalErrors };
}

/** True if any row carries an error. */
export function hasError(): boolean {
	return Object.values(syncState.rows).some((r) => !!r.error);
}

/** Rows sorted by account id, then mailbox, for stable rendering. */
export function rowList(): SyncRow[] {
	return Object.values(syncState.rows).sort(
		(a, b) =>
			a.accountId.localeCompare(b.accountId) || (a.mailbox ?? '').localeCompare(b.mailbox ?? '')
	);
}

/**
 * Subscribe to the server's SSE stream. Returns a disposer that closes the
 * connection. No-op (returns a noop disposer) outside the browser.
 */
export function connectSyncStream(): () => void {
	if (typeof EventSource === 'undefined') return () => {};

	const es = new EventSource('/api/sync/stream');
	syncState.connected = true;

	es.onmessage = (e: MessageEvent) => {
		try {
			const evt = JSON.parse(e.data) as StreamEvent;
			if (
				evt &&
				(evt.type === 'sync' ||
					evt.type === 'index' ||
					evt.type === 'lifecycle' ||
					evt.type === 'sync_finished')
			) {
				applyEvent(evt);
			}
		} catch {
			// Ignore malformed frames; the next event reconciles state.
		}
	};

	// The browser auto-reconnects on transient errors; mark disconnected so the
	// UI can reflect it, and let EventSource re-open on its own.
	es.onerror = () => {
		syncState.connected = false;
	};
	es.onopen = () => {
		syncState.connected = true;
	};

	return () => {
		es.close();
		syncState.connected = false;
	};
}
