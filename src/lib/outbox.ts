import { idbGet, idbPut, idbGetAll } from './idb';
import { pwaLog } from './pwa-log';
import { authHeaders } from './api';

export interface OutboxEntry {
	id: string;
	composed_at: string;
	status: 'queued' | 'sending' | 'sent' | 'failed';
	error?: string;
	message: Record<string, unknown>;
}

export async function enqueue(draft: Record<string, unknown>): Promise<string> {
	const id = crypto.randomUUID();
	const entry: OutboxEntry = {
		id,
		composed_at: new Date().toISOString(),
		status: 'queued',
		message: draft
	};
	await idbPut('outbox', entry);
	pwaLog('outbox', `queued ${id}`);
	await registerSync();
	return id;
}

export async function getOutbox(): Promise<OutboxEntry[]> {
	return idbGetAll<OutboxEntry>('outbox');
}

export async function flushOutbox(): Promise<void> {
	const entries = await idbGetAll<OutboxEntry>('outbox');
	const queued = entries.filter((e) => e.status === 'queued');
	pwaLog('outbox', `flush ${queued.length} entries`);
	for (const entry of queued) {
		await idbPut('outbox', { ...entry, status: 'sending' });
		try {
			const res = await fetch('/api/send', {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...authHeaders() },
				body: JSON.stringify(entry.message)
			});
			if (res.ok) {
				pwaLog('outbox', `sent ${entry.id}`);
				await idbPut('outbox', { ...entry, status: 'sent' });
			} else {
				throw new Error(`HTTP ${res.status}`);
			}
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			pwaLog('outbox', `failed ${entry.id} ${errMsg}`);
			await idbPut('outbox', { ...entry, status: 'failed', error: errMsg });
		}
	}
	window.dispatchEvent(new CustomEvent('outbox-updated'));
}

async function registerSync(): Promise<void> {
	if ('serviceWorker' in navigator && 'SyncManager' in window) {
		const reg = await navigator.serviceWorker.ready;
		await reg.sync.register('outbox-sync');
	}
}

export function initOutboxFlusher(): void {
	window.addEventListener('online', () => flushOutbox());
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') flushOutbox();
	});
	navigator.serviceWorker?.addEventListener('message', (e) => {
		if (e.data?.type === 'outbox-updated') {
			window.dispatchEvent(new CustomEvent('outbox-updated'));
		}
	});
}
