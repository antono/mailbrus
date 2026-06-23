// openspec/changes/sync-status-bar-redesign/specs/sync-event-log/spec.md
//
// Timestamped sync event log with localStorage persistence. Decoupled from the
// SSE source: callers push semantic events (`fetching`, `indexed`,
// `sync_completed`, …) and the UI reads them reactively. Up to 2000 lines are
// retained across sessions (FIFO); the current run is the set of un-archived
// events, prior runs are archived and grouped for the history view.
//
// Pure logic (trim, dedup, run grouping) lives in `syncEventLog-core.ts` and is
// unit-tested there; this module owns the reactive state and localStorage I/O.

import {
	MAX_EVENTS,
	DEDUP_WINDOW_MS,
	trimEvents,
	isDuplicate,
	parseStoredEvents,
	groupRuns,
	type SyncLogEvent,
	type SyncLogRun
} from './syncEventLog-core.ts';

export type { SyncLogEvent, SyncLogRun };

/** localStorage key holding the full (current + archived) event array. */
const STORAGE_KEY = 'mailbrus_sync_events';

// Module-level reactive store. Consumers read the accessor functions below
// (mirrors the syncState/syncHistory pattern) so reads stay reactive across imports.
const store = $state<{ events: SyncLogEvent[] }>({ events: [] });

/** Persist the current event array to localStorage (best-effort). */
function persist(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(store.events));
	} catch {
		// Quota exceeded or disabled storage: drop the oldest half and retry once,
		// so a full disk degrades gracefully instead of throwing on every event.
		try {
			store.events.splice(0, Math.floor(store.events.length / 2));
			localStorage.setItem(STORAGE_KEY, JSON.stringify(store.events));
		} catch {
			// Give up silently; in-memory log still works for this session.
		}
	}
}

/**
 * Load persisted events on first import. Restores prior session state and trims
 * to the 2000-line cap. Malformed storage is discarded rather than throwing.
 */
function load(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const events = parseStoredEvents(JSON.parse(raw));
		trimEvents(events, MAX_EVENTS);
		store.events = events;
	} catch {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			/* ignore */
		}
	}
}

// Restore on module init (task 1.5).
load();

/**
 * Capture a sync event. Records an ISO8601 timestamp, persists to localStorage,
 * and enforces the 2000-line cap. Identical (account+event+detail) events fired
 * within 100ms are de-duplicated (task 1.7) so rapid duplicate frames don't
 * spam the log. Returns the recorded event, or null if de-duplicated.
 *
 * NOTE: `detail` is logged verbatim — never pass secrets (passwords, tokens).
 */
export function addEvent(account: string, eventType: string, detail?: string): SyncLogEvent | null {
	const now = new Date();
	const last = store.events[store.events.length - 1];
	if (isDuplicate(last, account, eventType, detail, now.getTime(), DEDUP_WINDOW_MS)) {
		return null;
	}
	const evt: SyncLogEvent = {
		timestamp: now.toISOString(),
		account,
		event: eventType,
		archived: false,
		...(detail !== undefined ? { detail } : {})
	};
	store.events.push(evt);
	trimEvents(store.events, MAX_EVENTS);
	persist();
	return evt;
}

/**
 * Archive the current run: flag every un-archived event so it moves into the
 * history view. Call when a new sync starts so the next run's events begin
 * fresh and unmarked.
 */
export function archiveCurrentRun(): void {
	let changed = false;
	for (const e of store.events) {
		if (!e.archived) {
			e.archived = true;
			changed = true;
		}
	}
	if (changed) persist();
}

/** Remove all events (current + history) from memory and localStorage. */
export function clearEvents(): void {
	store.events = [];
	if (typeof localStorage !== 'undefined') {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			/* ignore */
		}
	}
}

// ── Reactive accessors (task 1.8) ───────────────────────────────────────────
// Called from component $derived/markup so reads track `store.events`.

/** All events (current run + archived), oldest first. */
export function allEvents(): SyncLogEvent[] {
	return store.events;
}

/** Events belonging to the current (un-archived) run, oldest first. */
export function currentRunEvents(): SyncLogEvent[] {
	return store.events.filter((e) => !e.archived);
}

/** Archived events grouped into completed runs (newest first) for the history view. */
export function historyRuns(): SyncLogRun[] {
	return groupRuns(store.events.filter((e) => e.archived));
}
