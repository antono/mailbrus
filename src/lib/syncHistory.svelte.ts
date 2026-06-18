// Sync run history: persists the last 3 completed sync runs to localStorage.
// Each run captures per-account statuses, counts, errors, and a finishedAt timestamp.

import type { SyncRow } from './syncState.svelte.ts';

const STORAGE_KEY = 'mailbrus_sync_history';
const MAX_RUNS = 3;

export interface HistoryRow {
	accountId: string;
	mailbox: string | null;
	syncStatus?: string;
	fetched: number;
	deleted: number;
	indexStatus?: string;
	indexed: number;
	error?: string;
}

export interface SyncRun {
	finishedAt: string;
	rows: HistoryRow[];
}

interface PersistedHistory {
	version: 1;
	runs: SyncRun[];
}

function truncate(s: string | undefined, max: number): string | undefined {
	if (!s) return s;
	return s.length > max ? s.slice(0, max) + '…' : s;
}

function rowToHistoryRow(row: SyncRow): HistoryRow {
	return {
		accountId: row.accountId,
		mailbox: row.mailbox,
		syncStatus: row.syncStatus,
		fetched: row.fetched,
		deleted: row.deleted,
		indexStatus: row.indexStatus,
		indexed: row.indexed,
		error: truncate(row.error, 200),
	};
}

export const history = $state<SyncRun[]>([]);

/** Snapshot the current rows into a SyncRun and persist. */
export function saveRun(rows: SyncRow[], finishedAt: string): void {
	const run: SyncRun = {
		finishedAt,
		rows: rows.map(rowToHistoryRow),
	};
	history.push(run);
	while (history.length > MAX_RUNS) {
		history.shift();
	}
	persist();
}

/** Read and deserialize history from localStorage. */
export function loadHistory(): SyncRun[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as PersistedHistory;
		if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.runs)) {
			clearHistory();
			return [];
		}
		history.length = 0;
		history.push(...parsed.runs);
		return history;
	} catch {
		clearHistory();
		return [];
	}
}

/** Remove all persisted history and clear the in-memory array. */
export function clearHistory(): void {
	history.length = 0;
	if (typeof localStorage !== 'undefined') {
		localStorage.removeItem(STORAGE_KEY);
	}
}

function persist(): void {
	if (typeof localStorage === 'undefined') return;
	const data: PersistedHistory = { version: 1, runs: history };
	localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
