import { idbGetAll, idbPut } from './idb';
import type { Message } from './data';

interface CachedMessage extends Message {
	key: string;
	folder: string;
	cached_at: number;
}

export async function cacheMessages(folder: string, messages: Message[]): Promise<void> {
	for (const msg of messages) {
		await idbPut<CachedMessage>('messages', {
			...msg,
			key: `${folder}:${msg.id}`,
			folder,
			cached_at: Date.now()
		});
	}
}

export async function getLocalMessages(folder: string): Promise<Message[]> {
	const all = await idbGetAll<CachedMessage>('messages');
	return all
		.filter((m) => m.folder === folder)
		.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}
