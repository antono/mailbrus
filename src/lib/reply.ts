// openspec/changes/hotkeys-improvement/specs/reader-message-actions/spec.md
// Pure reply/forward/quote construction — no DOM, unit-testable.
import type { Account } from './data.js';

/** A compose draft seed used by the reader → compose prefill path. */
export interface ComposeDraft {
	to: string;
	cc: string;
	bcc: string;
	subject: string;
	body: string;
}

/** The subset of an opened message the reply/forward builders need. */
export interface ReplySource {
	/** Sender as displayed, e.g. `Alice <alice@example.com>`. */
	from: string;
	/** Sender bare address, e.g. `alice@example.com`. */
	addr: string;
	subject: string;
	/** Original `To` recipients (addressable strings). */
	to?: string[];
	/** Original `Cc` recipients (addressable strings). */
	cc?: string[];
}

/** Extract a bare, lower-cased email out of a recipient string for comparison. */
function bareEmail(s: string): string {
	const m = s.match(/<([^>]+)>/);
	return (m ? m[1] : s).trim().toLowerCase();
}

/** Prefix `subject` with `tag: ` unless it already starts with `tag:` (case-insensitive). */
function prefixSubject(subject: string, tag: 'Re' | 'Fwd'): string {
	const s = (subject ?? '').trim();
	const re = new RegExp(`^${tag}:`, 'i');
	return re.test(s) ? s : `${tag}: ${s}`;
}

/** Quote `body`, prefixing every line with `> ` (greater-than then a single space). */
export function quoteBody(body: string): string {
	return (body ?? '')
		.split('\n')
		.map((line) => `> ${line}`)
		.join('\n');
}

/**
 * Build a reply draft. `To` is the original sender; with `{ all: true }` the
 * `Cc` field gathers the union of the original `To`/`Cc` recipients, excluding
 * the active account's own address and the sender (deduped by bare email).
 */
export function buildReply(
	message: ReplySource,
	account: Account,
	body: string,
	opts: { all?: boolean } = {}
): ComposeDraft {
	const to = message.from || message.addr;
	let cc = '';
	if (opts.all) {
		const own = (account.address || '').toLowerCase();
		const seen = new Set<string>([own, bareEmail(to)]);
		const others: string[] = [];
		for (const r of [...(message.to ?? []), ...(message.cc ?? [])]) {
			const e = bareEmail(r);
			if (!e || seen.has(e)) continue;
			seen.add(e);
			others.push(r);
		}
		cc = others.join(', ');
	}
	return {
		to,
		cc,
		bcc: '',
		subject: prefixSubject(message.subject, 'Re'),
		body: `\n\n${quoteBody(body)}`
	};
}

/**
 * Build a forward draft. `To` is empty; the body carries a forwarded block with
 * the original `From`/`To`/`Subject`/`Date` headers followed by the body.
 * `headers` is the displayed header rows (`[name, value][]`) from `buildHeaders`.
 */
export function buildForward(
	message: ReplySource,
	_account: Account,
	body: string,
	headers: [string, string][]
): ComposeDraft {
	const lookup = (name: string): string | null =>
		headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null;

	const lines = ['---------- Forwarded message ----------'];
	for (const name of ['From', 'To', 'Subject', 'Date']) {
		const v = lookup(name);
		if (v != null) lines.push(`${name}: ${v}`);
	}
	const block = `${lines.join('\n')}\n\n${body ?? ''}`;
	return {
		to: '',
		cc: '',
		bcc: '',
		subject: prefixSubject(message.subject, 'Fwd'),
		body: block
	};
}
