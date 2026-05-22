import { idbGet, idbPut, idbGetAll } from './idb';
import { pwaLog } from './pwa-log';

const MAX_VISITS = 20;

interface FrecencyEntry {
	key: string;
	visits: number[];
}

function bucketWeight(ageDays: number): number {
	if (ageDays <= 4) return 100;
	if (ageDays <= 14) return 70;
	if (ageDays <= 31) return 50;
	if (ageDays <= 90) return 30;
	return 10;
}

function score(visits: number[]): number {
	const now = Date.now();
	const base = visits.reduce((sum, ts) => {
		const ageDays = (now - ts) / 86400_000;
		return sum + bucketWeight(ageDays);
	}, 0);
	const countBonus = Math.min(visits.length, 10);
	return (base / Math.max(visits.length, 1)) * countBonus;
}

export async function recordVisit(store: string, key: string): Promise<void> {
	const entryKey = `${store}:${key}`;
	const existing = await idbGet<FrecencyEntry>('frecency', entryKey);
	const visits = existing?.visits ?? [];
	const updated: number[] = [...visits, Date.now()].slice(-MAX_VISITS);
	await idbPut('frecency', { key: entryKey, visits: updated });
	const s = score(updated);
	pwaLog('frecency', `${entryKey} visits=${updated.length} score=${s.toFixed(1)}`);
}

export async function getRanked(store: string, prefix?: string): Promise<string[]> {
	const all = await idbGetAll<FrecencyEntry>('frecency');
	const storePrefix = `${store}:`;
	const relevant = all
		.filter((e) => e.key.startsWith(storePrefix))
		.map((e) => ({ key: e.key.slice(storePrefix.length), score: score(e.visits) }))
		.filter((e) => !prefix || e.key.startsWith(prefix))
		.sort((a, b) => b.score - a.score);
	return relevant.map((e) => e.key);
}
