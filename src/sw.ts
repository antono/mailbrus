/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { pwaLog } from './lib/pwa-log-sw';

const SW_VERSION = '__SW_VERSION__'; // replaced by vite define
const APP_SHELL_CACHE = `app-shell-v${SW_VERSION}`;
const MSG_BODIES_CACHE = `message-bodies-v${SW_VERSION}`;
const ASSETS_CACHE = `assets-v${SW_VERSION}`;

const APP_SHELL_URLS = ['/', '/manifest.webmanifest'];

// ── Bearer token (origin validation / CWE-346) ──────────────────────────────
// Mirrors the window-side token in src/lib/api.ts. The SW can be killed and
// restarted at will, losing module state, so the token is hydrated lazily from
// IndexedDB (the durable channel the window writes to) and refreshed live via
// postMessage from the page. `undefined` = not yet hydrated; `null` = known-empty.
let _swAuthToken: string | null | undefined = undefined;

self.addEventListener('message', (e) => {
	if (e.data?.type === 'auth-token') {
		_swAuthToken = typeof e.data.token === 'string' && e.data.token ? e.data.token : null;
		pwaLog('SW', 'auth token updated');
	}
});

async function getSwAuthToken(): Promise<string | null> {
	if (_swAuthToken !== undefined) return _swAuthToken;
	try {
		const { idbGet } = await import('./lib/idb');
		const row = await idbGet<{ key: string; value: string }>('settings', 'auth_token');
		_swAuthToken = row?.value ?? null;
	} catch {
		_swAuthToken = null;
	}
	return _swAuthToken;
}

/** Auth headers for SW-originated fetches (background send/sync). */
async function swAuthHeaders(): Promise<Record<string, string>> {
	const token = await getSwAuthToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Clone a request with the bearer token attached, for pass-through /api fetches. */
async function authorizeRequest(req: Request): Promise<Request> {
	const token = await getSwAuthToken();
	if (!token) return req;
	const headers = new Headers(req.headers);
	headers.set('Authorization', `Bearer ${token}`);
	return new Request(req, { headers });
}

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener('install', (e) => {
	pwaLog('SW', `install v${SW_VERSION}`);
	e.waitUntil(
		caches
			.open(APP_SHELL_CACHE)
			.then((c) => c.addAll(APP_SHELL_URLS))
			.then(() => self.skipWaiting())
	);
});

// ── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (e) => {
	pwaLog('SW', 'activate');
	e.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((k) => {
							const isOldShell = k.startsWith('app-shell-v') && k !== APP_SHELL_CACHE;
							const isOldBodies = k.startsWith('message-bodies-v') && k !== MSG_BODIES_CACHE;
							return isOldShell || isOldBodies;
						})
						.map((k) => {
							pwaLog('SW', `evict cache ${k}`);
							return caches.delete(k);
						})
				)
			)
			.then(() => evictTTL(MSG_BODIES_CACHE, 7))
			.then(() => evictTTL(ASSETS_CACHE, 30))
			.then(() => self.clients.claim())
	);
});

// ── TTL eviction ──────────────────────────────────────────────────────────────

async function evictTTL(cacheName: string, maxDays: number) {
	const cache = await caches.open(cacheName);
	const keys = await cache.keys();
	const cutoff = Date.now() - maxDays * 86400_000;
	for (const req of keys) {
		const res = await cache.match(req);
		if (!res) continue;
		const dateHdr = res.headers.get('date');
		if (dateHdr && new Date(dateHdr).getTime() < cutoff) {
			pwaLog('cache:evict', `${cacheName} ${req.url} age=${maxDays}d+`);
			await cache.delete(req);
		}
	}
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (e) => {
	const url = new URL(e.request.url);
	const { pathname } = url;

	// pass-through for non-GET mutations
	if (
		e.request.method !== 'GET' &&
		(pathname === '/api/send' ||
			pathname.startsWith('/api/messages/') ||
			pathname.startsWith('/api/push/'))
	) {
		e.respondWith(authorizeRequest(e.request).then(networkOnlyOrFail));
		return;
	}

	if (e.request.method !== 'GET') return;

	// navigation requests for in-grammar deep paths → serve cached app shell
	// so offline deep-link/reload works (task 7.1)
	// Static files are excluded so they still resolve normally (task 7.2)
	if (
		e.request.mode === 'navigate' &&
		!pathname.startsWith('/api/') &&
		!pathname.startsWith('/assets/') &&
		!pathname.startsWith('/icons/') &&
		pathname !== '/sw.js' &&
		pathname !== '/manifest.webmanifest'
	) {
		e.respondWith(serveAppShell());
		return;
	}

	// message list: network-first with 5s timeout, cache fallback
	if (pathname.startsWith('/api/messages') && !pathname.match(/\/api\/messages\/.+/)) {
		e.respondWith(
			authorizeRequest(e.request).then((r) =>
				networkFirstWithFallback(r, APP_SHELL_CACHE, 5000)
			)
		);
		return;
	}

	// message body: cache-first, fetch+cache on miss
	if (pathname.match(/^\/api\/messages\/.+/)) {
		e.respondWith(
			authorizeRequest(e.request).then((r) => cacheFirstFetch(r, MSG_BODIES_CACHE))
		);
		return;
	}

	// static assets: cache-first, long TTL
	if (pathname.startsWith('/assets/') || pathname.startsWith('/icons/')) {
		e.respondWith(cacheFirstFetch(e.request, ASSETS_CACHE));
		return;
	}
});

// ── App shell fallback ────────────────────────────────────────────────────────

async function serveAppShell(): Promise<Response> {
	const cache = await caches.open(APP_SHELL_CACHE);
	const cached = await cache.match('/');
	if (cached) return cached;
	return fetch('/');
}

// ── Caching strategies ────────────────────────────────────────────────────────

async function networkFirstWithFallback(req: Request, cacheName: string, timeoutMs: number): Promise<Response> {
	const cache = await caches.open(cacheName);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(req, { signal: controller.signal });
		clearTimeout(timer);
		if (res.ok) {
			pwaLog('cache:write', `${cacheName} ${req.url}`);
			cache.put(req, res.clone());
		}
		return res;
	} catch {
		clearTimeout(timer);
		const cached = await cache.match(req);
		if (cached) return cached;
		return new Response('Offline', { status: 503 });
	}
}

async function cacheFirstFetch(req: Request, cacheName: string): Promise<Response> {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(req);
	if (cached) return cached;
	const res = await fetch(req);
	if (res.ok) {
		pwaLog('cache:write', `${cacheName} ${req.url}`);
		cache.put(req, res.clone());
	}
	return res;
}

async function networkOnlyOrFail(req: Request): Promise<Response> {
	try {
		return await fetch(req);
	} catch {
		return new Response(JSON.stringify({ error: 'network_error' }), {
			status: 503,
			headers: { 'content-type': 'application/json' }
		});
	}
}

// ── Background Sync ───────────────────────────────────────────────────────────

self.addEventListener('sync', (e) => {
	if (e.tag === 'outbox-sync') {
		e.waitUntil(flushOutbox());
	} else if (e.tag === 'mutations-sync') {
		e.waitUntil(flushMutations());
	}
});

async function flushOutbox() {
	const { idbGetAll, idbPut } = await import('./lib/idb');
	const entries = await idbGetAll('outbox');
	const queued = entries.filter((x: Record<string, unknown>) => x.status === 'queued');
	pwaLog('outbox', `flush ${queued.length} entries`);
	for (const entry of queued) {
		await idbPut('outbox', { ...entry, status: 'sending' });
		try {
			const res = await fetch('/api/send', {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...(await swAuthHeaders()) },
				body: JSON.stringify((entry as Record<string, unknown>).message)
			});
			if (res.ok) {
				pwaLog('outbox', `sent ${(entry as Record<string, unknown>).id}`);
				await idbPut('outbox', { ...entry, status: 'sent' });
			} else {
				throw new Error(`HTTP ${res.status}`);
			}
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			pwaLog('outbox', `failed ${(entry as Record<string, unknown>).id} ${errMsg}`);
			await idbPut('outbox', { ...entry, status: 'failed', error: errMsg });
		}
	}
	const clients = await self.clients.matchAll();
	clients.forEach((c) => c.postMessage({ type: 'outbox-updated' }));
}

async function flushMutations() {
	const { idbGetAll, idbPut, idbDelete } = await import('./lib/idb');
	const entries = await idbGetAll('mutations');
	const compacted = compactMutations(entries as MutationEntry[]);
	pwaLog('mutations', `compact ${entries.length}→${compacted.length}`);
	for (const mut of compacted) {
		await idbPut('mutations', { ...mut, status: 'applying' });
		try {
			let res: Response;
			if (mut.op === 'delete' || mut.op === 'trash') {
				res = await fetch(`/api/messages/${mut.message_id}`, {
					method: 'DELETE',
					headers: await swAuthHeaders()
				});
			} else {
				res = await fetch(`/api/messages/${mut.message_id}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json', ...(await swAuthHeaders()) },
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
			const clients = await self.clients.matchAll();
			clients.forEach((c) => c.postMessage({ type: 'mutations-conflict', mutation: mut }));
		}
	}
	const clients = await self.clients.matchAll();
	clients.forEach((c) => c.postMessage({ type: 'mutations-synced' }));
}

interface MutationEntry {
	id: string;
	message_id: string;
	folder: string;
	op: 'mark_read' | 'mark_unread' | 'delete' | 'trash' | 'move';
	args?: Record<string, unknown>;
	queued_at: string;
	status: string;
}

function compactMutations(entries: MutationEntry[]): MutationEntry[] {
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

// ── Push notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (e) => {
	pwaLog('push', 'received');
	const data = e.data?.json() ?? {};
	const title = data.subject ?? 'New message';
	const body = data.sender ?? '';
	const threadUrl = data.thread_url ?? '/';
	pwaLog('push', `notify "${title}"`);
	e.waitUntil(
		self.registration.showNotification(title, {
			body,
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-192.png',
			data: { threadUrl },
			actions: [
				{ action: 'reply', title: 'Reply' },
				{ action: 'archive', title: 'Archive' }
			]
		})
	);
});

self.addEventListener('notificationclick', (e) => {
	e.notification.close();
	const { threadUrl, message_id, folder } = e.notification.data ?? {};
	if (e.action === 'archive' && message_id && folder) {
		e.waitUntil(
			(async () => {
				await fetch(`/api/messages/${message_id}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json', ...(await swAuthHeaders()) },
					body: JSON.stringify({ op: 'move', target_folder: 'Archive' })
				});
			})()
		);
		return;
	}
	const url = threadUrl ?? '/';
	e.waitUntil(
		self.clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((clients) => {
				const existing = clients.find((c) => c.url === url);
				if (existing) return existing.focus();
				return self.clients.openWindow(url);
			})
	);
});
