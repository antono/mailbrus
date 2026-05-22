/**
 * Materializes the pristine maildir corpus from `manifest.ts`.
 *
 * Run with: `deno task e2e:generate`
 *
 * The manifest is the single source of truth; this script writes the committed
 * `.eml` files (and the `.gitkeep` placeholders that preserve empty maildir
 * folders in git). Generated files use CRLF line endings and standards-correct
 * MIME so notmuch + mail_parser index/parse them the same way real mail does.
 *
 * Only writes under `fixtures/maildir/`. Safe to re-run: it clears prior
 * message files first, so the output always matches the manifest exactly.
 */
import { Buffer } from 'node:buffer';
import {
	mkdirSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { PRISTINE_MAILDIR } from '../harness/paths.ts';
import {
	filenameOf,
	FOLDER_NAMES,
	manifest,
	SIGNATURE_BLOCK,
	type ManifestAccount,
	type ManifestFolder,
	type ManifestMessage
} from './manifest.ts';

const GITKEEP = '.gitkeep';

function crlf(text: string): string {
	return text.replace(/\r?\n/g, '\r\n');
}

/** Fold base64 into 76-column lines per RFC 2045. */
function base64Lines(content: string): string {
	const b64 = Buffer.from(content, 'utf8').toString('base64');
	return (b64.match(/.{1,76}/g) ?? []).join('\n');
}

function fromHeader(m: ManifestMessage): string {
	return `${m.from} <${m.fromAddr}>`;
}

function bodyWithSignature(m: ManifestMessage): string {
	return m.signature === 'signed' ? `${m.bodyText}\n\n${SIGNATURE_BLOCK}` : m.bodyText;
}

function commonHeaders(m: ManifestMessage): string[] {
	const headers = [
		`From: ${fromHeader(m)}`,
		`To: ${m.to}`,
		`Subject: ${m.subject}`,
		`Date: ${m.date}`,
		`Message-ID: <${m.messageId}>`,
		'MIME-Version: 1.0'
	];
	if (m.list) {
		headers.push(`List-Id: <${m.list.id}>`);
		headers.push(`List-Unsubscribe: ${m.list.unsubscribe}`);
	}
	return headers;
}

function renderMessage(m: ManifestMessage): string {
	const headers = commonHeaders(m);

	if (m.attachments.length === 0) {
		headers.push('Content-Type: text/plain; charset=utf-8');
		headers.push('Content-Transfer-Encoding: 8bit');
		return crlf(`${headers.join('\n')}\n\n${bodyWithSignature(m)}\n`);
	}

	const boundary = `=_mailbrus_${m.slug}_=`;
	headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

	const parts: string[] = [];
	parts.push(
		[
			`--${boundary}`,
			'Content-Type: text/plain; charset=utf-8',
			'Content-Transfer-Encoding: 8bit',
			'',
			bodyWithSignature(m)
		].join('\n')
	);
	for (const att of m.attachments) {
		parts.push(
			[
				`--${boundary}`,
				`Content-Type: ${att.mime}; name="${att.filename}"`,
				`Content-Disposition: attachment; filename="${att.filename}"`,
				'Content-Transfer-Encoding: base64',
				'',
				base64Lines(att.content)
			].join('\n')
		);
	}
	const body = `${parts.join('\n')}\n--${boundary}--\n`;
	return crlf(`${headers.join('\n')}\n\n${body}`);
}

/** Remove every regular file under the corpus except `.gitkeep`. */
function clearMessages(dir: string): void {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) clearMessages(full);
		else if (entry.name !== GITKEEP) rmSync(full);
	}
}

/** Drop `.gitkeep` in empty leaf dirs; remove it from dirs that hold mail. */
function syncGitkeep(dir: string): void {
	walkLeafDirs(dir, (leaf) => {
		const keep = join(leaf, GITKEEP);
		const onlyKeep = readdirSync(leaf).filter((n) => n !== GITKEEP).length === 0;
		if (onlyKeep) writeFileSync(keep, '');
		else if (existsQuiet(keep)) rmSync(keep);
	});
}

function existsQuiet(p: string): boolean {
	try {
		statSync(p);
		return true;
	} catch {
		return false;
	}
}

function walkLeafDirs(dir: string, fn: (leaf: string) => void): void {
	const subdirs = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
	if (subdirs.length === 0) {
		fn(dir);
		return;
	}
	for (const s of subdirs) walkLeafDirs(join(dir, s.name), fn);
}

function writeAccount(account: ManifestAccount): void {
	for (const name of FOLDER_NAMES) {
		for (const box of ['cur', 'new', 'tmp']) {
			mkdirSync(join(PRISTINE_MAILDIR, account.address, name, box), { recursive: true });
		}
	}
	for (const folder of account.folders) writeFolder(account, folder);
}

function writeFolder(account: ManifestAccount, folder: ManifestFolder): void {
	for (const m of folder.messages) {
		const path = join(PRISTINE_MAILDIR, account.address, folder.name, m.box, filenameOf(m));
		writeFileSync(path, renderMessage(m));
	}
}

function main(): void {
	mkdirSync(PRISTINE_MAILDIR, { recursive: true });
	clearMessages(PRISTINE_MAILDIR);
	for (const account of manifest) writeAccount(account);
	syncGitkeep(PRISTINE_MAILDIR);

	const total = manifest.reduce(
		(n, a) => n + a.folders.reduce((m, f) => m + f.messages.length, 0),
		0
	);
	console.log(`Generated ${total} messages across ${manifest.length} accounts at ${PRISTINE_MAILDIR}`);
}

main();
