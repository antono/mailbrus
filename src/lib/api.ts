import type { Account, Folder, Message, Attachment } from '$lib/data.js';

export type { Account, Folder, Message, Attachment };

export type RenderMode = 'text' | 'simple' | 'html';

export interface MessageBody extends Message {
	body: string;
	attachments: Attachment[];
	mode: RenderMode;
	has_plain: boolean;
	has_html: boolean;
	has_remote: number;
	format_flowed: boolean;
}

async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
	const res = await fetch(path, init);
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error((err as { error?: string }).error ?? res.statusText);
	}
	return res.json();
}

export async function fetchMaildirs(): Promise<Account[]> {
	return apiFetch('/api/maildirs') as Promise<Account[]>;
}

/**
 * Trigger an on-demand sync. With no `accountId`, syncs all configured accounts
 * (`POST /api/sync`); otherwise one account (`POST /api/sync/<account>`). The
 * server returns `202 Accepted` and runs in the background — progress arrives
 * over `/api/sync/stream`. Rejects with the server's error message on non-2xx.
 */
export async function triggerSync(accountId?: string): Promise<void> {
	const path = accountId ? `/api/sync/${encodeURIComponent(accountId)}` : '/api/sync';
	await apiFetch(path, { method: 'POST' });
}

export async function fetchFolders(maildirId: string): Promise<Folder[]> {
	return apiFetch(`/api/maildirs/${encodeURIComponent(maildirId)}/folders`) as Promise<Folder[]>;
}

export async function fetchMessages(
	maildirId: string,
	folderId: string,
	page = 1,
	perPage = 25
): Promise<{ messages: Message[]; page: number; per_page: number; count: number }> {
	const url = `/api/maildirs/${encodeURIComponent(maildirId)}/folders/${encodeURIComponent(folderId)}/messages?page=${page}&per_page=${perPage}`;
	return apiFetch(url) as Promise<{ messages: Message[]; page: number; per_page: number; count: number }>;
}

export async function searchMessages(
	query: string,
	page = 1,
	perPage = 25
): Promise<{ messages: Message[]; page: number; per_page: number; count: number }> {
	const url = `/api/messages/search?q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`;
	return apiFetch(url) as Promise<{ messages: Message[]; page: number; per_page: number; count: number }>;
}


export async function fetchMessage(id: string, mode?: RenderMode): Promise<MessageBody> {
	const url = mode
		? `/api/messages/${encodeURIComponent(id)}?mode=${mode}`
		: `/api/messages/${encodeURIComponent(id)}`;
	return apiFetch(url) as Promise<MessageBody>;
}
