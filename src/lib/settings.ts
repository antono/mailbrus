import { idbGet, idbPut, idbGetAll } from './idb';
import { pwaLog } from './pwa-log';

export interface SortOrder { field: string; direction: 'asc' | 'desc' }

export interface UiPrefs {
	dark: boolean;
	accent: string;
	font: string;
	fontSize: string;
	density: string;
	hintBar: boolean;
}

const UI_PREFS_DEFAULTS: UiPrefs = {
	dark: false,
	accent: 'indigo',
	font: 'sans',
	fontSize: 'md',
	density: 'twoline',
	hintBar: true
};

export type EmailMode = 'text' | 'simple' | 'html';

export interface Settings {
	theme: 'dark' | 'light' | 'system';
	last_folder: string;
	search_history: string[];
	sort_order: SortOrder;
	push_subscription: PushSubscriptionJSON | null;
	ui_prefs: UiPrefs;
	/** Global default rendering mode for HTML email. Defaults to 'text'. */
	email_mode: EmailMode;
	/** Set of message IDs for which the user has opted in to load remote content. */
	remote_loaded_messages: string[];
	/** Per-sender rendering mode overrides. Key is the raw message.from string. */
	sender_mode_overrides: Record<string, EmailMode>;
}

const DEFAULTS: Settings = {
	theme: 'system',
	last_folder: 'INBOX',
	search_history: [],
	sort_order: { field: 'date', direction: 'desc' },
	push_subscription: null,
	ui_prefs: { ...UI_PREFS_DEFAULTS },
	email_mode: 'text',
	remote_loaded_messages: [],
	sender_mode_overrides: {},
};

let _settings: Settings = { ...DEFAULTS };
let _loaded = false;

export async function loadSettings(): Promise<Settings> {
	if (_loaded) return _settings;
	// read theme from localStorage first (anti-flash)
	const theme = (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) as Settings['theme'] | null;
	const rows = await idbGetAll<{ key: string; value: unknown }>('settings');
	const idbMap = Object.fromEntries(rows.map((r) => [r.key, r.value]));

	// one-time migration from mailbrus-tweaks localStorage
	if (typeof localStorage !== 'undefined' && localStorage.getItem('mailbrus-tweaks') && !idbMap['ui_prefs']) {
		try {
			const legacy = JSON.parse(localStorage.getItem('mailbrus-tweaks')!);
			const migrated: UiPrefs = { ...UI_PREFS_DEFAULTS, ...legacy, fontSize: legacy.fontSize ?? 'md' };
			await idbPut('settings', { key: 'ui_prefs', value: migrated });
			idbMap['ui_prefs'] = migrated;
			pwaLog('settings', 'migrated mailbrus-tweaks to ui_prefs');
		} catch {}
		localStorage.removeItem('mailbrus-tweaks');
	}

	_settings = {
		..._settings,
		...idbMap,
		ui_prefs: { ...UI_PREFS_DEFAULTS, ...((idbMap['ui_prefs'] as UiPrefs) ?? {}) },
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

export async function setEmailMode(mode: EmailMode): Promise<void> {
	await writeSetting('email_mode', mode);
}

export function getSenderEmailMode(sender: string): EmailMode | null {
	return _settings.sender_mode_overrides[sender] ?? null;
}

export async function setSenderEmailMode(sender: string, mode: EmailMode | null): Promise<void> {
	const updated = { ..._settings.sender_mode_overrides };
	if (mode === null) {
		delete updated[sender];
	} else {
		updated[sender] = mode;
	}
	await writeSetting('sender_mode_overrides', updated);
}
