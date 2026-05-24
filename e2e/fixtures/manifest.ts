/**
 * Typed, declarative source of truth for the pristine E2E maildir corpus.
 *
 * This manifest is the contract the specs assert against (see
 * `openspec/specs/test-maildir-fixtures` and `playwright-e2e-suite`). The
 * on-disk `.eml` files under `fixtures/maildir/` are *generated* from this
 * manifest by `fixtures/generate.ts`, and `specs/consistency.spec.ts` proves
 * that disk and manifest stay in lockstep.
 *
 * To change the corpus: edit this file, run `deno task e2e:generate`, then run
 * the suite. Never hand-edit the generated `.eml` files.
 */

/** Default page size used by the SPA (`src/lib/api.ts` -> `fetchMessages`). */
export const PER_PAGE = 25;

/**
 * Folder names every account carries, in the order `list_folders` returns them
 * (the server sorts directory names ascending, see
 * `mailbrus-core::MaildirReader::list_folders`).
 */
export const FOLDER_NAMES = ['Archive', 'Inbox', 'Sent', 'Spam', 'Trash'] as const;
export type FolderName = (typeof FOLDER_NAMES)[number];

export type SignatureKind = 'signed' | 'unsigned' | 'broken';

export interface ManifestAttachment {
	/** Filename advertised in Content-Disposition. */
	filename: string;
	/** MIME type, e.g. `application/pdf`. */
	mime: string;
	/** Small UTF-8 payload; base64-encoded into the generated MIME part. */
	content: string;
}

export interface ManifestMessage {
	/** Unique, stable base filename (the maildir "unique" part). */
	slug: string;
	/** Maildir box the file lives in. `new` => unread, no `:2,` info. */
	box: 'cur' | 'new';
	/** Maildir flag letters after `:2,` (ASCII order), e.g. `FS`. Empty allowed. */
	flags: string;
	/** Unique Message-ID *without* angle brackets (notmuch dedups on this). */
	messageId: string;
	/** Display name in the From header. */
	from: string;
	/** Email address in the From header. */
	fromAddr: string;
	/** Raw To header value. */
	to: string;
	subject: string;
	/** RFC 2822 Date header value. */
	date: string;
	/** Main body text (without the signature block). Empty string for HTML-only messages. */
	bodyText: string;
	/** Optional HTML body. When set without bodyText, the message is HTML-only (no text/plain part). */
	bodyHtml?: string;
	signature: SignatureKind;
	/** Present for mailing-list / subscription messages. */
	list?: { id: string; unsubscribe: string };
	attachments: ManifestAttachment[];
}

export interface ManifestFolder {
	name: FolderName;
	messages: ManifestMessage[];
}

export interface ManifestAccount {
	/** Email-address-named directory at the corpus root (== account id). */
	address: string;
	folders: ManifestFolder[];
}

// ── Derived predicates (single place that knows maildir flag semantics) ───────

/** A message is unread when in `new/`, or in `cur/` without the `S` flag. */
export function isUnread(m: ManifestMessage): boolean {
	return m.box === 'new' || !m.flags.includes('S');
}
export function isFlagged(m: ManifestMessage): boolean {
	return m.flags.includes('F');
}
export function isReplied(m: ManifestMessage): boolean {
	return m.flags.includes('R');
}
export function isTrashed(m: ManifestMessage): boolean {
	return m.flags.includes('T');
}
export function hasHtmlBody(m: ManifestMessage): boolean {
	return !!m.bodyHtml;
}
export function hasRemoteImages(m: ManifestMessage): boolean {
	return !!m.bodyHtml && /https?:\/\//.test(m.bodyHtml);
}

/** Maildir filename for a message: `new/` has no info part; `cur/` has `:2,FLAGS`. */
export function filenameOf(m: ManifestMessage): string {
	return m.box === 'new' ? m.slug : `${m.slug}:2,${m.flags}`;
}

/** Path of a message relative to the corpus root. */
export function relPathOf(account: ManifestAccount, folder: ManifestFolder, m: ManifestMessage): string {
	return `${account.address}/${folder.name}/${m.box}/${filenameOf(m)}`;
}

/** All messages of an account/folder by name. */
export function folderOf(account: ManifestAccount, name: FolderName): ManifestFolder {
	const f = account.folders.find((x) => x.name === name);
	if (!f) throw new Error(`account ${account.address} has no folder ${name}`);
	return f;
}

/** Messages of a folder ordered newest-first, matching the server's SortBy::Newest. */
export function messagesNewestFirst(folder: ManifestFolder): ManifestMessage[] {
	return [...folder.messages].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

// ── Helpers used only to build the corpus below ───────────────────────────────

function utc(day: number, hour = 8, minute = 0): string {
	// May 2026, UTC. RFC 2822 with numeric zone (mail_parser accepts GMT too).
	return new Date(Date.UTC(2026, 4, day, hour, minute, 0)).toUTCString().replace('GMT', '+0000');
}

/**
 * Signature block appended to `signature: 'signed'` messages by `generate.ts`.
 * The SPA marks a message "signed" purely by the presence of a `-- ` line in
 * the body (`src/lib/utils.ts` -> `splitSignature`), so the block must start
 * with exactly dash-dash-space.
 */
export const SIGNATURE_BLOCK = '-- \nMallory Admin\nWork Inc. - ext. 4012';

/** 27 uniform read messages so Archive paginates (27 > PER_PAGE of 25). */
const ARCHIVE_MESSAGES: ManifestMessage[] = Array.from({ length: 27 }, (_, i) => {
	const n = i + 1;
	const nn = String(n).padStart(2, '0');
	return {
		slug: `alice-archive-${nn}`,
		box: 'cur',
		flags: 'S',
		messageId: `alice-archive-${nn}@example.com`,
		from: 'Archive Bot',
		fromAddr: 'archive@work.example',
		to: 'alice@example.com',
		subject: `Archived item ${nn}`,
		date: utc(n, 7, n), // day N of May => item 27 is newest
		bodyText: `This is archived content number ${nn}.`,
		signature: 'unsigned',
		attachments: []
	};
});

// ── The corpus ────────────────────────────────────────────────────────────────

export const manifest: ManifestAccount[] = [
	{
		address: 'alice@example.com',
		folders: [
			{ name: 'Archive', messages: ARCHIVE_MESSAGES },
			{
				name: 'Inbox',
				messages: [
					{
						slug: 'alice-inbox-01-read-signed',
						box: 'cur',
						flags: 'S',
						messageId: 'alice-inbox-01@example.com',
						from: 'Mallory Admin',
						fromAddr: 'mallory@work.example',
						to: 'alice@example.com',
						subject: 'Quarterly planning notes',
						date: utc(18, 9, 15),
						bodyText:
							'Hi Alice,\n\nHere are the planning notes for next quarter. Please review the roadmap section before our sync.\n\nThanks,\nMallory',
						signature: 'signed',
						attachments: []
					},
					{
						slug: 'alice-inbox-02-unread-plain',
						box: 'new',
						flags: '',
						messageId: 'alice-inbox-02@example.com',
						from: 'Dave Ops',
						fromAddr: 'dave@work.example',
						to: 'alice@example.com',
						subject: 'Server migration window',
						date: utc(19, 14, 2),
						bodyText:
							'The migration window is scheduled for Saturday night. Expect about two hours of downtime on the staging cluster.',
						signature: 'unsigned',
						attachments: []
					},
					{
						slug: 'alice-inbox-03-flagged-pdf',
						box: 'cur',
						flags: 'FS',
						messageId: 'alice-inbox-03@example.com',
						from: 'Carol Finance',
						fromAddr: 'carol@work.example',
						to: 'alice@example.com',
						subject: 'Invoice for March',
						date: utc(13, 11, 30),
						bodyText: 'Please find the March invoice attached. Payment is due by the end of the month.',
						signature: 'unsigned',
						attachments: [
							{
								filename: 'invoice-march.pdf',
								mime: 'application/pdf',
								content: '%PDF-1.4 fake invoice for March (E2E fixture)\n'
							}
						]
					},
					{
						slug: 'alice-inbox-04-replied-multi',
						box: 'cur',
						flags: 'RS',
						messageId: 'alice-inbox-04@example.com',
						from: 'Erin Data',
						fromAddr: 'erin@work.example',
						to: 'alice@example.com',
						subject: 'Monthly report and chart',
						date: utc(14, 16, 45),
						bodyText: 'Attaching the monthly report chart and the raw numbers as CSV.',
						signature: 'unsigned',
						attachments: [
							{
								filename: 'chart.png',
								mime: 'image/png',
								content: 'fake-png-bytes-for-e2e-chart'
							},
							{
								filename: 'data.csv',
								mime: 'text/csv',
								content: 'month,value\nMar,42\nApr,57\n'
							}
						]
					},
					{
						slug: 'alice-inbox-05-list',
						box: 'new',
						flags: '',
						messageId: 'alice-inbox-05@example.com',
						from: 'Mailbrus Weekly',
						fromAddr: 'newsletter@lists.example.com',
						to: 'alice@example.com',
						subject: 'Your weekly digest',
						date: utc(15, 8, 0),
						bodyText: 'Here is what happened in your projects this week. Five issues closed, two opened.',
						signature: 'unsigned',
						list: {
							id: 'mailbrus.lists.example.com',
							unsubscribe: '<mailto:unsubscribe@lists.example.com?subject=unsubscribe>'
						},
						attachments: []
					},
					{
						slug: 'alice-inbox-06-broken-sig',
						box: 'cur',
						flags: 'S',
						messageId: 'alice-inbox-06@example.com',
						from: 'Secure Sender',
						fromAddr: 'secure@work.example',
						to: 'alice@example.com',
						subject: 'Signed but tampered',
						date: utc(16, 10, 5),
						bodyText:
							'-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n\nThis message claims to be signed but the signature does not verify.\n-----BEGIN PGP SIGNATURE-----\n\nVGhpcyBzaWduYXR1cmUgaXMgZGVsaWJlcmF0ZWx5IGNvcnJ1cHRlZA==\n-----END PGP SIGNATURE-----',
						signature: 'broken',
						attachments: []
					},
					{
						slug: 'alice-inbox-07-html-only',
						box: 'cur',
						flags: 'S',
						messageId: 'alice-inbox-07@example.com',
						from: 'Promo Bot',
						fromAddr: 'promo@marketing.example',
						to: 'alice@example.com',
						subject: 'HTML-only newsletter',
						date: utc(20, 10, 0),
						bodyText: '',
						bodyHtml:
							'<p>Welcome to our <strong>newsletter</strong>!</p>' +
							'<p>Visit <a href="https://example.com/news">our site</a>.</p>' +
							'<script>alert("XSS")</script>',
						signature: 'unsigned',
						attachments: []
					},
					{
						slug: 'alice-inbox-08-multipart-alt',
						box: 'cur',
						flags: 'S',
						messageId: 'alice-inbox-08@example.com',
						from: 'Marketing Team',
						fromAddr: 'marketing@work.example',
						to: 'alice@example.com',
						subject: 'Monthly update (text and HTML)',
						date: utc(21, 11, 0),
						bodyText:
							'Plain-text version: The monthly update is ready.\nCheck https://work.example/update for details.',
						bodyHtml:
							'<p>The monthly update is ready.</p>' +
							'<p>Check <a href="https://work.example/update">here</a> for details.</p>',
						signature: 'unsigned',
						attachments: []
					},
					{
						slug: 'alice-inbox-09-html-remote-img',
						box: 'cur',
						flags: 'S',
						messageId: 'alice-inbox-09@example.com',
						from: 'Tracker Corp',
						fromAddr: 'track@tracker.example',
						to: 'alice@example.com',
						subject: 'Email with tracking pixel',
						date: utc(22, 9, 0),
						bodyText: '',
						bodyHtml:
							'<p>You have a new notification.</p>' +
							'<img src="https://tracker.example.com/open.gif" alt="" width="1" height="1">',
						signature: 'unsigned',
						attachments: []
					},
					{
						slug: 'alice-inbox-xss-01-script-tag',
						box: 'cur',
						flags: 'S',
						messageId: 'alice-inbox-xss-01@example.com',
						from: 'Attacker One',
						fromAddr: 'atk1@evil.example',
						to: 'alice@example.com',
						subject: 'XSS via script tag',
						date: utc(23, 8, 0),
						bodyText: '',
						bodyHtml:
							'<p>Click me!</p><script>document.title="pwned"</script>',
						signature: 'unsigned',
						attachments: []
					},
					{
						slug: 'alice-inbox-xss-02-event-handler',
						box: 'cur',
						flags: 'S',
						messageId: 'alice-inbox-xss-02@example.com',
						from: 'Attacker Two',
						fromAddr: 'atk2@evil.example',
						to: 'alice@example.com',
						subject: 'XSS via event handler',
						date: utc(23, 8, 5),
						bodyText: '',
						bodyHtml:
							'<img src="x.png" onerror="document.title=\'pwned\'" alt="img">',
						signature: 'unsigned',
						attachments: []
					},
					{
						slug: 'alice-inbox-xss-03-javascript-href',
						box: 'cur',
						flags: 'S',
						messageId: 'alice-inbox-xss-03@example.com',
						from: 'Attacker Three',
						fromAddr: 'atk3@evil.example',
						to: 'alice@example.com',
						subject: 'XSS via javascript: href',
						date: utc(23, 8, 10),
						bodyText: '',
						bodyHtml:
							'<a href="javascript:document.title=\'pwned\'">Click here</a>',
						signature: 'unsigned',
						attachments: []
					},
					{
						slug: 'alice-inbox-xss-04-css-injection',
						box: 'cur',
						flags: 'S',
						messageId: 'alice-inbox-xss-04@example.com',
						from: 'Attacker Four',
						fromAddr: 'atk4@evil.example',
						to: 'alice@example.com',
						subject: 'XSS via CSS expression',
						date: utc(23, 8, 15),
						bodyText: '',
						bodyHtml:
							'<p style="color:expression(document.title=\'pwned\');behavior:url(#default#homePage)">Styled text</p>',
						signature: 'unsigned',
						attachments: []
					},
					{
						slug: 'alice-inbox-xss-05-iframe-injection',
						box: 'cur',
						flags: 'S',
						messageId: 'alice-inbox-xss-05@example.com',
						from: 'Attacker Five',
						fromAddr: 'atk5@evil.example',
						to: 'alice@example.com',
						subject: 'XSS via nested iframe',
						date: utc(23, 8, 20),
						bodyText: '',
						bodyHtml:
							'<p>Content</p><iframe src="https://evil.example/steal"></iframe>',
						signature: 'unsigned',
						attachments: []
					},
					{
						slug: 'alice-inbox-xss-06-meta-refresh',
						box: 'cur',
						flags: 'S',
						messageId: 'alice-inbox-xss-06@example.com',
						from: 'Attacker Six',
						fromAddr: 'atk6@evil.example',
						to: 'alice@example.com',
						subject: 'XSS via meta refresh redirect',
						date: utc(23, 8, 25),
						bodyText: '',
						bodyHtml:
							'<meta http-equiv="refresh" content="0;url=https://evil.example/phish"><p>Loading...</p>',
						signature: 'unsigned',
						attachments: []
					}
				]
			},
			{
				name: 'Sent',
				messages: [
					{
						slug: 'alice-sent-01',
						box: 'cur',
						flags: 'S',
						messageId: 'alice-sent-01@example.com',
						from: 'Alice Example',
						fromAddr: 'alice@example.com',
						to: 'Frank Client <frank@client.example>',
						subject: 'Re: project kickoff',
						date: utc(17, 10, 0),
						bodyText: 'Thanks Frank, kickoff on Monday works for us. I will send the agenda shortly.',
						signature: 'unsigned',
						attachments: []
					}
				]
			},
			{
				name: 'Spam',
				messages: [
					{
						slug: 'alice-spam-01',
						box: 'cur',
						flags: 'S',
						messageId: 'alice-spam-01@example.com',
						from: 'Prize Bot',
						fromAddr: 'prize@spam.example',
						to: 'alice@example.com',
						subject: 'You won a prize!!!',
						date: utc(9, 3, 0),
						bodyText: 'Click here to claim your totally legitimate prize right now.',
						signature: 'unsigned',
						attachments: []
					}
				]
			},
			{
				name: 'Trash',
				messages: [
					{
						slug: 'alice-trash-01',
						box: 'cur',
						flags: 'S',
						messageId: 'alice-trash-01@example.com',
						from: 'Old Sender',
						fromAddr: 'old@work.example',
						to: 'alice@example.com',
						subject: 'Deleted note',
						date: utc(8, 12, 0),
						bodyText: 'This note was deleted and now lives in Trash.',
						signature: 'unsigned',
						attachments: []
					}
				]
			}
		]
	},
	{
		address: 'bob@example.com',
		folders: [
			{ name: 'Archive', messages: [] },
			{
				name: 'Inbox',
				messages: [
					{
						slug: 'bob-inbox-01-read',
						box: 'cur',
						flags: 'S',
						messageId: 'bob-inbox-01@example.com',
						from: 'HR Team',
						fromAddr: 'hr@work.example',
						to: 'bob@example.com',
						subject: 'Welcome to the team',
						date: utc(11, 9, 0),
						bodyText: 'Welcome aboard, Bob! Your first-day checklist is in the shared drive.',
						signature: 'unsigned',
						attachments: []
					},
					{
						slug: 'bob-inbox-02-unread',
						box: 'new',
						flags: '',
						messageId: 'bob-inbox-02@example.com',
						from: 'Scrum Master',
						fromAddr: 'scrum@work.example',
						to: 'bob@example.com',
						subject: 'Standup notes',
						date: utc(12, 9, 30),
						bodyText: 'Notes from this morning standup are attached to the ticket. Nothing blocking.',
						signature: 'unsigned',
						attachments: []
					}
				]
			},
			{
				name: 'Sent',
				messages: [
					{
						slug: 'bob-sent-01',
						box: 'cur',
						flags: 'S',
						messageId: 'bob-sent-01@example.com',
						from: 'Bob Example',
						fromAddr: 'bob@example.com',
						to: 'alice@example.com',
						subject: 'Lunch?',
						date: utc(6, 12, 30),
						bodyText: 'Want to grab lunch on Thursday?',
						signature: 'unsigned',
						attachments: []
					}
				]
			},
			{ name: 'Spam', messages: [] },
			{ name: 'Trash', messages: [] }
		]
	}
];
