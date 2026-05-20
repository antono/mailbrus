export interface Account {
	id: string;
	address: string;
	host: string;
	maildir: string;
	unread: number;
	total: number;
}

export interface Folder {
	id: string;
	name: string;
	unread: number;
	total: number;
}

export interface Attachment {
	name: string;
	size: number;
	mime: string;
}

export interface Message {
	from: string;
	addr: string;
	subject: string;
	preview: string;
	time: string;
	unread: boolean;
	flags: string;
	attachments?: Attachment[];
}

const M = (
	from: string,
	addr: string,
	subject: string,
	preview: string,
	time: string,
	unread = false,
	flags = '',
	attachments?: Attachment[]
): Message => ({ from, addr, subject, preview, time, unread, flags, attachments });

const A = (name: string, size: number, mime: string): Attachment => ({ name, size, mime });

export const accounts: Account[] = [
	{
		id: 'gmail',
		address: 'antono.vasiljev@gmail.com',
		host: 'imap.gmail.com',
		maildir: '~/Maildir/gmail',
		unread: 18,
		total: 4213
	},
	{
		id: 'proton',
		address: 'antono.vasiljev@proton.me',
		host: '127.0.0.1:1143 (bridge)',
		maildir: '~/Maildir/proton',
		unread: 4,
		total: 921
	}
];

export const folders: Record<string, Folder[]> = {
	gmail: [
		{ id: 'inbox', name: 'INBOX', unread: 14, total: 2840 },
		{ id: 'sent', name: 'Sent', unread: 0, total: 412 },
		{ id: 'drafts', name: 'Drafts', unread: 0, total: 7 },
		{ id: 'archive', name: 'Archive', unread: 0, total: 902 },
		{ id: 'spam', name: 'Spam', unread: 4, total: 49 },
		{ id: 'trash', name: 'Trash', unread: 0, total: 33 }
	],
	proton: [
		{ id: 'inbox', name: 'INBOX', unread: 4, total: 612 },
		{ id: 'sent', name: 'Sent', unread: 0, total: 188 },
		{ id: 'drafts', name: 'Drafts', unread: 0, total: 2 },
		{ id: 'archive', name: 'Archive', unread: 0, total: 95 },
		{ id: 'spam', name: 'Spam', unread: 0, total: 21 },
		{ id: 'trash', name: 'Trash', unread: 0, total: 3 }
	]
};

export const messages: Record<string, Message[]> = {
	'gmail/inbox': [
		M('Maya Reyes', 'maya@scratchpad.dev', 'Q3 plan — quick reviews ready', 'Added the doc to the team channel and pinged you for a quick review.', '2m', true, 'F', [
			A('Q3-rollout-plan.pdf', 412988, 'application/pdf'),
			A('timeline-v3.png', 184220, 'image/png')
		]),
		M('Linear', 'notifications@linear.app', '3 issues assigned to you this week', 'Sprint kickoff · MAI-204, MAI-211, MAI-219', '14m', true),
		M('GitHub', 'noreply@github.com', '[antono/mailbrus] PR #42 ready for review', 'feat(maildir): incremental notmuch index, ~30% faster on cold start', '1h', true),
		M('Sam Khan', 'sam@khan.studio', 'Re: lunch Thursday', 'Sounds good — I\'ll book a table at the usual spot.', '3h', false, 'R'),
		M('Hacker News', 'lists@hn.algolia.com', 'Daily digest · 18 stories', 'Show HN: I built a maildir-native client in 800 lines of Rust', '9h', true),
		M('Stripe', 'no-reply@stripe.com', 'Receipt from your subscription', 'Invoice INV-209387 · €19.00 · paid on May 19, 2026', 'Wed', false, 'R', [
			A('INV-209387.pdf', 23104, 'application/pdf')
		]),
		M('Fastmail', 'billing@fastmail.com', 'Your renewal in 14 days', 'Standard plan, €50/year, auto-renews on Jun 03.', 'Wed', false, 'R'),
		M('antono.vasiljev@proton.me', 'antono.vasiljev@proton.me', 'Re: weekend trip', 'Train at 07:42, I forwarded the booking confirmation.', 'Tue', true),
		M('Patreon', 'noreply@patreon.com', '3 new posts from creators you support', 'Hundred Rabbits · Devine · Aida.', 'Mon', false, 'R'),
		M('arXiv', 'no-reply@arxiv.org', 'Daily listing · cs.PL, cs.HC', '12 new papers, 4 cross-listings.', 'Mon', false, 'R'),
		M('Stripe', 'no-reply@stripe.com', 'Payout of €842.00 sent', 'Will arrive in 2 business days.', 'Sun', false, 'R'),
		M('Mailing list: mutt-users', 'mutt-users@mutt.org', 'Re: indexing very large maildirs', 'I\'ve had luck with notmuch + a small wrapper script, see attached.', 'May 14', false, 'R'),
		M('Ana Larsen', 'ana@flat.studio', 'drawings for the readme', 'Three options inline. Picked the middle one but happy to switch.', 'May 13', false, 'R', [
			A('readme-v1.png', 1587004, 'image/png'),
			A('readme-v2.png', 1811440, 'image/png'),
			A('readme-v3.png', 2142006, 'image/png'),
			A('sources.zip', 4290010, 'application/zip')
		]),
		M('Calendar', 'calendar@google.com', 'Tomorrow: 4 events', '09:00 standup · 11:00 1:1 with Maya · 14:30 design review · 17:00 walk', 'May 12', false, 'R'),
		M('Verge', 'newsletter@theverge.com', 'Installer #221', 'Why everyone is suddenly running a personal mail server.', 'May 11', false, 'R'),
		M('Ana Larsen', 'ana@flat.studio', 'small bug in the keymap', 'j and k swapped when in folder picker — was that intentional?', 'May 10', false, 'R'),
		M('Mailing list: aerc-discuss', 'aerc-discuss@lists.sr.ht', 'Re: vim keybindings in composer', 'Patch attached, applies cleanly on master.', 'May 09', false, 'R'),
		M('DNS Registrar', 'ops@porkbun.com', 'antono.dev renews in 60 days', 'No action needed unless you want to change anything.', 'May 08', false, 'R'),
		M('Maya Reyes', 'maya@scratchpad.dev', 'Q2 retro notes', 'Posted in the wiki. TL;DR — fewer meetings, more writing.', 'May 07', false, 'R'),
		M('Bandcamp', 'noreply@bandcamp.com', 'New from artists you follow', 'Aphex Twin · Hundred Rabbits · Lustmord', 'May 06', false, 'R')
	],
	'gmail/sent': [
		M('To: Maya Reyes', 'maya@scratchpad.dev', 'Re: Q3 plan — quick reviews ready', 'Pushed comments inline. Mostly LGTM — the rollout section needs a date.', '1h', false, 'R'),
		M('To: Ana Larsen', 'ana@flat.studio', 'Re: drawings for the readme', 'The middle one. Thank you — they\'re really good.', 'May 13', false, 'R'),
		M('To: aerc-discuss', 'aerc-discuss@lists.sr.ht', 'vim keybindings in composer', 'Proposing a small change to keep g/G consistent across panes.', 'May 09', false, 'R'),
		M('To: Sam Khan', 'sam@khan.studio', 'lunch Thursday?', '12:30 at the usual?', 'May 08', false, 'R')
	],
	'gmail/drafts': [
		M('Draft', '—', 'Re: Patreon — three new posts', '—', 'now', false, 'D'),
		M('Draft', '—', 'to maya — quick thought on the rollout', '—', 'yesterday', false, 'D')
	],
	'gmail/archive': [
		M('Maya Reyes', 'maya@scratchpad.dev', 'Q1 retro notes', 'Posted in the wiki.', 'Feb 28', false, 'R'),
		M('Stripe', 'no-reply@stripe.com', 'Receipt from your subscription', 'Invoice INV-201443 · €19.00', 'Feb 19', false, 'R'),
		M('Calendar', 'calendar@google.com', 'Weekly digest', '21 events this week.', 'Feb 14', false, 'R')
	],
	'gmail/spam': [
		M('Crypto Tips Daily', 'tips@get-rich.zip', '🚀 The next 100x is here', "Don't miss out — limited time only", 'May 11', true),
		M('Nigerian Prince', 'prince@scam.zw', 'URGENT business proposal', 'Dear sir, I write you in confidence regarding…', 'May 09', true),
		M('Adobe Renewal', 'adobe-renewal@noreply.fake', 'Your subscription will renew', 'Click here to confirm your account.', 'May 04', true),
		M('Discord', 'noreply@discrod.io', 'Your account has been suspended', 'Click to restore access.', 'May 01', true)
	],
	'gmail/trash': [
		M('LinkedIn', 'noreply@linkedin.com', 'You appeared in 3 searches', '—', 'Apr 22', false, 'R')
	],
	'proton/inbox': [
		M('Proton', 'noreply@proton.me', 'New sign-in from Helsinki', "If this wasn't you, secure your account.", '12m', true),
		M('Tarmo K.', 'tarmo@lehmus.ee', 'raamatu mustand', 'saadan PDF-i, vaata kui aega.', '1h', true, '', [
			A('chapter-2-draft.pdf', 982330, 'application/pdf')
		]),
		M('antono.vasiljev@gmail.com', 'antono.vasiljev@gmail.com', 'weekend trip', 'Train at 07:42 — booking attached.', 'Tue', true),
		M('Mailing list: tildeverse', 'list@tildeverse.org', 'monthly digest', '12 new tildes, 4 retired.', 'Mon', true),
		M('Fastmail', 'ops@fastmail.com', 'DNS propagation complete', 'MX records for antono.dev are live.', 'Sun', false, 'R'),
		M('EFF', 'members@eff.org', 'Thank you for your contribution', 'Your donation receipt is attached.', 'May 10', false, 'R'),
		M('Are.na', 'noreply@are.na', 'Weekly digest', '3 channels you follow updated.', 'May 08', false, 'R'),
		M('Proton VPN', 'noreply@protonvpn.com', 'New servers in Tallinn', 'Connect faster from the Baltics.', 'May 03', false, 'R')
	],
	'proton/sent': [
		M('To: Tarmo K.', 'tarmo@lehmus.ee', 'Re: raamatu mustand', 'loen läbi nädala lõpuks.', '1h', false, 'R'),
		M('To: antono.vasiljev@gmail.com', 'antono.vasiljev@gmail.com', 'Re: weekend trip', 'Bron tehtud, saadan kinnituse.', 'Tue', false, 'R')
	],
	'proton/drafts': [M('Draft', '—', 'to tarmo — feedback on chapter 2', '—', 'today', false, 'D')],
	'proton/archive': [
		M('EFF', 'members@eff.org', '2025 annual report', 'Thank you for being a member.', 'Jan 15', false, 'R'),
		M('Are.na', 'noreply@are.na', 'Year in review', 'You added 248 blocks this year.', 'Jan 02', false, 'R')
	],
	'proton/spam': [],
	'proton/trash': []
};

export const bodies: Record<string, string> = {
	default: `Hey,

Just pinged the team — quick reviews are ready in the Q3 doc. No
rush, but it would be great to land your comments before Wed so I
can fold them into the rollout section.

Highlights:
  · maildir-native indexing is in
  · keyboard story landed, full j/k throughout
  · still TBD: search-in-folder, label rules

Thanks,
Maya

-- 
Maya Reyes
Engineering · Scratchpad
maya@scratchpad.dev   ·   +1 415 555 0148
PGP: 8A1F C4D2 9B07 1E63
"What gets measured gets managed." — P. Drucker`
};
