// openspec/changes/hotkeys-improvement/specs/reader-message-actions/spec.md
import { assertEquals } from 'jsr:@std/assert';
import { buildReply, buildForward, quoteBody } from './reply.ts';
import type { Account } from './data.ts';

const account: Account = {
	id: 'a1',
	address: 'me@example.com',
	host: 'example.com',
	maildir: '/m',
	unread: 0,
	total: 0
};

function src(over: Partial<Parameters<typeof buildReply>[0]> = {}) {
	return {
		from: 'Alice <alice@example.com>',
		addr: 'alice@example.com',
		subject: 'Hello',
		to: ['me@example.com', 'Bob <bob@example.com>'],
		cc: ['Carol <carol@example.com>'],
		...over
	};
}

Deno.test('quoteBody prefixes each line with "> "', () => {
	assertEquals(quoteBody('one\ntwo'), '> one\n> two');
	assertEquals(quoteBody(''), '> ');
});

Deno.test('buildReply: To is the sender, subject gets Re:', () => {
	const d = buildReply(src(), account, 'body text');
	assertEquals(d.to, 'Alice <alice@example.com>');
	assertEquals(d.subject, 'Re: Hello');
	assertEquals(d.cc, '');
});

Deno.test('buildReply: Re: is not duplicated (case-insensitive)', () => {
	assertEquals(buildReply(src({ subject: 'Re: Hello' }), account, '').subject, 'Re: Hello');
	assertEquals(buildReply(src({ subject: 're: Hello' }), account, '').subject, 're: Hello');
});

Deno.test('buildReply: body is quoted with "> "', () => {
	const d = buildReply(src(), account, 'line1\nline2');
	assertEquals(d.body.includes('> line1'), true);
	assertEquals(d.body.includes('> line2'), true);
});

Deno.test('buildReply all: Cc is union of To/Cc, excluding own + sender', () => {
	const d = buildReply(src(), account, '', { all: true });
	assertEquals(d.to, 'Alice <alice@example.com>');
	// me@example.com (own) is dropped; sender not duplicated; Bob + Carol remain.
	assertEquals(d.cc, 'Bob <bob@example.com>, Carol <carol@example.com>');
});

Deno.test('buildReply all: dedups repeated recipients by bare email', () => {
	const d = buildReply(
		src({ to: ['Bob <bob@example.com>'], cc: ['bob@example.com', 'Dave <dave@example.com>'] }),
		account,
		'',
		{ all: true }
	);
	assertEquals(d.cc, 'Bob <bob@example.com>, Dave <dave@example.com>');
});

Deno.test('buildForward: empty To, Fwd: subject, header block + body', () => {
	const headers: [string, string][] = [
		['From', 'Alice <alice@example.com>'],
		['To', 'me@example.com'],
		['Subject', 'Hello'],
		['Date', 'Thu, 1 Jan 2026 12:00:00 +0000']
	];
	const d = buildForward(src(), account, 'original body', headers);
	assertEquals(d.to, '');
	assertEquals(d.subject, 'Fwd: Hello');
	assertEquals(d.body.includes('From: Alice <alice@example.com>'), true);
	assertEquals(d.body.includes('To: me@example.com'), true);
	assertEquals(d.body.includes('Subject: Hello'), true);
	assertEquals(d.body.includes('Date: Thu, 1 Jan 2026 12:00:00 +0000'), true);
	assertEquals(d.body.includes('original body'), true);
});

Deno.test('buildForward: Fwd: not duplicated', () => {
	assertEquals(buildForward(src({ subject: 'Fwd: Hello' }), account, '', []).subject, 'Fwd: Hello');
});
