import type { Account, Folder, Message, Attachment } from '$lib/data.js';

export type { Account, Folder, Message, Attachment };

export interface MessageBody extends Message {
	body: string;
	attachments: Attachment[];
}

async function apiFetch(path: string): Promise<unknown> {
	const res = await fetch(path);
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error((err as { error?: string }).error ?? res.statusText);
	}
	return res.json();
}

export async function fetchMaildirs(): Promise<Account[]> {
	return apiFetch('/api/maildirs') as Promise<Account[]>;
}

export async function fetchFolders(maildirId: string): Promise<Folder[]> {
	return apiFetch(`/api/maildirs/${encodeURIComponent(maildirId)}/folders`) as Promise<Folder[]>;
}

export async function fetchMessages(
	maildirId: string,
	folderId: string,
	page = 1,
	perPage = 25
): Promise<{ messages: Message[]; total: number }> {
	const url = `/api/maildirs/${encodeURIComponent(maildirId)}/folders/${encodeURIComponent(folderId)}/messages?page=${page}&per_page=${perPage}`;
	return apiFetch(url) as Promise<{ messages: Message[]; total: number }>;
}

export async function searchMessages(
	query: string,
	page = 1,
	perPage = 25
): Promise<{ messages: Message[]; total: number }> {
	const url = `/api/messages/search?q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`;
	return apiFetch(url) as Promise<{ messages: Message[]; total: number }>;
}

export async function fetchMessage(id: string): Promise<MessageBody> {
	return apiFetch(`/api/messages/${encodeURIComponent(id)}`) as Promise<MessageBody>;
}
