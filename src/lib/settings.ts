import { idbGet, idbPut, idbGetAll } from './idb';
import { pwaLog } from './pwa-log';

export interface SortOrder { field: string; direction: 'asc' | 'desc' }

export interface Settings {
	theme: 'dark' | 'light' | 'system';
	last_folder: string;
	search_history: string[];
	sort_order: SortOrder;
	push_subscription: PushSubscriptionJSON | null;
}

const DEFAULTS: Settings = {
	theme: 'system',
	last_folder: 'INBOX',
	search_history: [],
	sort_order: { field: 'date', direction: 'desc' },
	push_subscription: null
};

let _settings: Settings = { ...DEFAULTS };
let _loaded = false;

export async function loadSettings(): Promise<Settings> {
	if (_loaded) return _settings;
	// read theme from localStorage first (anti-flash)
	const theme = (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) as Settings['theme'] | null;
	const rows = await idbGetAll<{ key: string; value: unknown }>('settings');
	const idbMap = Object.fromEntries(rows.map((r) => [r.key, r.value]));
	_settings = {
		..._settings,
		...idbMap,
		theme: (theme ?? (idbMap.theme as Settings['theme'])) ?? DEFAULTS.theme
	} as Settings;
	_loaded = true;
	pwaLog('settings', `loaded ${JSON.stringify(_settings)}`);
	return _settings;
}

export function getSettings(): Settings {
	return _settings;
}

export async function writeSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
	_settings = { ..._settings, [key]: value };
	pwaLog('settings', `write ${String(key)}=${JSON.stringify(value)}`);
	await idbPut('settings', { key, value });
	if (key === 'theme') {
		localStorage.setItem('theme', value as string);
	}
}

export async function addSearchHistory(query: string): Promise<void> {
	const deduped = [query, ..._settings.search_history.filter((q) => q !== query)].slice(0, 50);
	await writeSetting('search_history', deduped);
}

export async function setLastFolder(folderId: string): Promise<void> {
	await writeSetting('last_folder', folderId);
}

export async function setSortOrder(order: SortOrder): Promise<void> {
	await writeSetting('sort_order', order);
}
