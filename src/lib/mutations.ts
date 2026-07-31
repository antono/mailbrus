import { idbGetAll, idbPut, idbDelete } from './idb';
import { pwaLog } from './pwa-log';
import { authHeaders } from './api';

export type MutationOp = 'mark_read' | 'mark_unread' | 'delete' | 'trash' | 'move';

export interface MutationEntry {
	id: string;
	message_id: string;
	folder: string;
	op: MutationOp;
	args?: Record<string, unknown>;
	queued_at: string;
	status: 'queued' | 'applying' | 'done' | 'failed';
	error?: string;
}

export async function enqueueMutation(
	op: MutationOp,
	message_id: string,
	folder: string,
	args?: Record<string, unknown>
): Promise<void> {
	const entry: MutationEntry = {
		id: crypto.randomUUID(),
		message_id,
		folder,
		op,
		args,
		queued_at: new Date().toISOString(),
		status: 'queued'
	};
	await idbPut('mutations', entry);
	pwaLog('mutations', `queued ${op} msg=${message_id}`);
	await applyOptimistically(entry);
	await registerSync();
}

async function applyOptimistically(mut: MutationEntry): Promise<void> {
	const msgKey = `${mut.folder}:${mut.message_id}`;
	if (mut.op === 'delete' || mut.op === 'trash') {
		await idbDelete('messages', msgKey);
	} else if (mut.op === 'mark_read') {
		const msg = await idbGetAll<Record<string, unknown>>('messages');
		const entry = msg.find((m) => m.key === msgKey);
		if (entry) await idbPut('messages', { ...entry, read: true });
	} else if (mut.op === 'mark_unread') {
		const msg = await idbGetAll<Record<string, unknown>>('messages');
		const entry = msg.find((m) => m.key === msgKey);
		if (entry) await idbPut('messages', { ...entry, read: false });
	}
}

async function registerSync(): Promise<void> {
	if ('serviceWorker' in navigator && 'SyncManager' in window) {
		const reg = await navigator.serviceWorker.ready;
		await reg.sync.register('mutations-sync');
	}
}

export function compactMutations(entries: MutationEntry[]): MutationEntry[] {
	const queued = entries.filter((e) => e.status === 'queued');
	const byMsg = new Map<string, MutationEntry[]>();
	for (const e of queued) {
		const list = byMsg.get(e.message_id) ?? [];
		list.push(e);
		byMsg.set(e.message_id, list);
	}
	const result: MutationEntry[] = [];
	for (const [, list] of byMsg) {
		const sorted = list.sort(
			(a, b) => new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime()
		);
		const deleteIdx = sorted.findLastIndex((e) => e.op === 'delete' || e.op === 'trash');
		if (deleteIdx >= 0) {
			result.push(sorted[deleteIdx]);
		} else {
			const readStates = sorted.filter((e) => e.op === 'mark_read' || e.op === 'mark_unread');
			const others = sorted.filter((e) => e.op !== 'mark_read' && e.op !== 'mark_unread');
			if (readStates.length) result.push(readStates[readStates.length - 1]);
			result.push(...others);
		}
	}
	return result;
}

export async function flushMutations(): Promise<void> {
	const entries = await idbGetAll<MutationEntry>('mutations');
	const compacted = compactMutations(entries);
	pwaLog('mutations', `compact ${entries.length}→${compacted.length}`);
	for (const mut of compacted) {
		await idbPut('mutations', { ...mut, status: 'applying' });
		try {
			let res: Response;
			if (mut.op === 'delete' || mut.op === 'trash') {
				res = await fetch(`/api/messages/${mut.message_id}`, {
					method: 'DELETE',
					headers: authHeaders()
				});
			} else {
				res = await fetch(`/api/messages/${mut.message_id}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json', ...authHeaders() },
					body: JSON.stringify({ op: mut.op, ...(mut.args ?? {}) })
				});
			}
			if (res.ok) {
				pwaLog('mutations', `applied ${mut.op} msg=${mut.message_id}`);
				await idbPut('mutations', { ...mut, status: 'done' });
			} else if (res.status === 404 || res.status === 409) {
				throw new Error(`conflict:${res.status}`);
			} else {
				throw new Error(`HTTP ${res.status}`);
			}
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			pwaLog('mutations', `conflict ${mut.message_id} ${errMsg}`);
			await idbPut('mutations', { ...mut, status: 'failed', error: errMsg });
			await idbDelete('messages', `${mut.folder}:${mut.message_id}`);
			window.dispatchEvent(new CustomEvent('mutations-conflict', { detail: mut }));
		}
	}
	window.dispatchEvent(new CustomEvent('mutations-synced'));
}

export function initMutationsFlusher(): void {
	window.addEventListener('online', () => flushMutations());
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') flushMutations();
	});
	navigator.serviceWorker?.addEventListener('message', (e) => {
		if (e.data?.type === 'mutations-conflict') {
			window.dispatchEvent(new CustomEvent('mutations-conflict', { detail: e.data.mutation }));
		}
	});
}
