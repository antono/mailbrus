import type { Account, Folder, Message } from './data.js';

// ── Time formatting ──────────────────────────────────────────────────────────

const _NOW = new Date('2026-05-20T15:30:00');
const _MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function _fmtISO(d: Date): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function expandTime(short: string): { label: string; iso: string } {
	if (!short) return { label: '', iso: '' };
	const s = short.trim();
	let m: RegExpMatchArray | null;
	if ((m = s.match(/^(\d+)m$/))) {
		const n = +m[1];
		const d = new Date(_NOW);
		d.setMinutes(d.getMinutes() - n);
		return { label: `${n} min${n === 1 ? '' : 's'} ago`, iso: _fmtISO(d) };
	}
	if ((m = s.match(/^(\d+)h$/))) {
		const n = +m[1];
		const d = new Date(_NOW);
		d.setHours(d.getHours() - n);
		return { label: `${n} hour${n === 1 ? '' : 's'} ago`, iso: _fmtISO(d) };
	}
	if (s === 'now') return { label: 'just now', iso: _fmtISO(_NOW) };
	if (s === 'today') {
		const d = new Date(_NOW);
		d.setHours(9, 30, 0, 0);
		return { label: 'today', iso: _fmtISO(d) };
	}
	if (s === 'yesterday') {
		const d = new Date(_NOW);
		d.setDate(d.getDate() - 1);
		d.setHours(16, 22, 0, 0);
		return { label: 'yesterday', iso: _fmtISO(d) };
	}
	if (_WEEKDAYS.includes(s)) {
		const target = _WEEKDAYS.indexOf(s);
		const d = new Date(_NOW);
		do {
			d.setDate(d.getDate() - 1);
		} while (d.getDay() !== target);
		d.setHours(14, 15, 0, 0);
		return { label: s, iso: _fmtISO(d) };
	}
	if ((m = s.match(/^(\w{3})\s+(\d{1,2})$/))) {
		const mo = _MONTHS.indexOf(m[1]);
		if (mo >= 0) {
			const year = mo > _NOW.getMonth() ? _NOW.getFullYear() - 1 : _NOW.getFullYear();
			const d = new Date(year, mo, +m[2], 10, 30);
			return { label: s, iso: _fmtISO(d) };
		}
	}
	return { label: s, iso: s };
}

export function initials(name: string): string {
	if (!name) return '';
	const clean = name.replace(/^(to|re|fwd):\s*/i, '').replace(/^\W+/, '');
	const parts = clean.split(/[\s@.]+/).filter(Boolean);
	return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

export function fmtBytes(n: number | undefined | null): string {
	if (n == null) return '';
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
	if (n < 1024 * 1024 * 1024)
		return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
	return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function attExt(name: string): string {
	const m = (name || '').match(/\.([a-z0-9]{1,5})$/i);
	return m ? m[1].toUpperCase() : 'FILE';
}

// ── Gravatar ─────────────────────────────────────────────────────────────────

const _avatarCache = new Map<string, string>();

export async function resolveGravatar(email: string): Promise<string | null> {
	const norm = (email || '').trim().toLowerCase();
	if (!norm || !/@/.test(norm)) return null;
	if (_avatarCache.has(norm)) return _avatarCache.get(norm)!;
	try {
		const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
		const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
		const url = `https://www.gravatar.com/avatar/${hex}?d=identicon&s=128`;
		_avatarCache.set(norm, url);
		return url;
	} catch {
		return null;
	}
}

// ── Signature splitting ───────────────────────────────────────────────────────

export function splitSignature(text: string): { main: string; sig: string } {
	if (!text) return { main: '', sig: '' };
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const ln = lines[i].replace(/\r$/, '');
		if (ln === '-- ') {
			return { main: lines.slice(0, i).join('\n'), sig: lines.slice(i).join('\n') };
		}
	}
	return { main: text, sig: '' };
}

// ── Build RFC headers ─────────────────────────────────────────────────────────

export function buildHeaders(
	message: Message,
	account: Account,
	folder: Folder
): [string, string][] {
	const ago = expandTime(message.time);
	const iso = ago.iso || message.time;
	let rfc = message.time;
	const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
	if (m) {
		const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
		const dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
		const mn = _MONTHS[d.getMonth()];
		rfc = `${dn}, ${d.getDate()} ${mn} ${d.getFullYear()} ${m[4]}:${m[5]}:00 +0300`;
	}
	const domain = account.address.split('@')[1] || 'example.com';
	const msgId = `<${Math.abs([...message.subject].reduce((a, c) => a * 31 + c.charCodeAt(0), 0)).toString(36)}.${Date.now().toString(36)}@${message.addr.split('@')[1] || 'mail.local'}>`;
	const senderDomain = message.addr.split('@')[1] || 'mail.local';
	const rows: ([string, string] | null)[] = [
		['Return-Path', `<${message.addr}>`],
		['Delivered-To', account.address],
		[
			'Received',
			`from mx.${senderDomain} (mx.${senderDomain} [203.0.113.${(message.subject.length * 7) % 250}])\n        by mx.${domain} with ESMTPS id 4XqL${Math.abs(message.subject.length * 991).toString(36)}\n        for <${account.address}>; ${rfc}`
		],
		['From', message.from === message.addr ? message.addr : `${message.from} <${message.addr}>`],
		['To', account.address],
		['Subject', message.subject],
		['Date', rfc],
		['Message-ID', msgId],
		['MIME-Version', '1.0'],
		['Content-Type', 'text/plain; charset=UTF-8; format=flowed'],
		['Content-Transfer-Encoding', '8bit'],
		['X-Mailer', 'Mailbrus 0.4.2 (maildir)'],
		['X-Mailbrus-Folder', `${account.maildir}/${folder.id}`],
		['X-Mailbrus-Flags', message.unread ? '' : message.flags || 'R'],
		/noreply|notifications|newsletter|lists|no-reply|digest/i.test(message.addr) ||
		/digest|newsletter/i.test(message.subject)
			? ['List-Unsubscribe', `<mailto:unsubscribe@${senderDomain}?subject=unsubscribe>`]
			: null
	];
	return rows.filter((r): r is [string, string] => r !== null);
}

// ── Contacts directory ────────────────────────────────────────────────────────

export interface Contact {
	name: string;
	addr: string;
}

export function buildContacts(
	accounts: Account[] = [],
	messages: Message[] = []
): Contact[] {
	const seen = new Map<string, Contact>();
	const add = (name: string, addr: string) => {
		if (!addr || !/@/.test(addr)) return;
		const key = addr.toLowerCase();
		const cleanName = (name || '').replace(/^(To:|Re:|Fwd:)\s*/i, '').trim();
		const existing = seen.get(key);
		if (!existing || (cleanName && cleanName !== addr && existing.name === addr)) {
			seen.set(key, {
				name: cleanName && cleanName !== addr ? cleanName : addr,
				addr
			});
		}
	};
	for (const a of accounts) add(a.address, a.address);
	for (const m of messages) add(m.from, m.addr);
	return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
