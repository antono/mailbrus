#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-net --allow-env
/**
 * Long-running Stalwart instance for local development.
 *
 *   deno task stalwart:dev
 *
 * Brings up Stalwart on stable loopback ports, persists state under
 * `.stalwart-dev/`, seeds a domain (`test.local`) and a default user
 * (`alice@test.local` / password `dev`), then prints how to reach the
 * admin dashboard and how to point a mailbrus config at it.
 *
 * Ctrl-C stops the server but leaves the data directory in place, so a
 * second `stalwart:dev` reopens the same mailboxes.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const REPO_ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const ROOT = resolve(REPO_ROOT, '.stalwart-dev');
const ETC = resolve(ROOT, 'etc');
const DATA = resolve(ROOT, 'data');
const LOGS = resolve(ROOT, 'logs');
const CONFIG = resolve(ETC, 'config.toml');

const IMAP_PORT = Number(Deno.env.get('STALWART_DEV_IMAP_PORT') ?? 18143);
const HTTP_PORT = Number(Deno.env.get('STALWART_DEV_HTTP_PORT') ?? 18080);
const ADMIN_USER = 'admin';
const ADMIN_SECRET = Deno.env.get('STALWART_DEV_ADMIN_SECRET') ?? 'mailbrus-dev';
const SEED_USER = 'alice@test.local';
const SEED_SECRET = 'dev';

const CONFIG_TOML = `
[server.listener.imap]
bind = "127.0.0.1:${IMAP_PORT}"
protocol = "imap"

[server.listener.http]
protocol = "http"
bind = "127.0.0.1:${HTTP_PORT}"

[storage]
data = "rocksdb"
fts = "rocksdb"
blob = "rocksdb"
lookup = "rocksdb"
directory = "internal"

[store.rocksdb]
type = "rocksdb"
path = "${DATA}"
compression = "lz4"

[directory.internal]
type = "internal"
store = "rocksdb"

[tracer.log]
type = "log"
level = "info"
path = "${LOGS}"
prefix = "stalwart.log"
rotate = "daily"
ansi = false
enable = true

[authentication.fallback-admin]
user = "${ADMIN_USER}"
secret = "${ADMIN_SECRET}"

# Allow LOGIN on the clear-text port (localhost only, dev convenience).
[imap.auth]
allow-plain-text = true
`.trimStart();

async function ensureDirs(): Promise<boolean> {
	const firstRun = !existsSync(DATA);
	await Promise.all([
		mkdir(ETC, { recursive: true }),
		mkdir(DATA, { recursive: true }),
		mkdir(LOGS, { recursive: true })
	]);
	await writeFile(CONFIG, CONFIG_TOML);
	return firstRun;
}

function basicAuth(user: string, secret: string): string {
	return 'Basic ' + btoa(`${user}:${secret}`);
}

async function waitForAdmin(deadlineMs: number): Promise<void> {
	const url = `http://127.0.0.1:${HTTP_PORT}/api/principal`;
	const headers = { Authorization: basicAuth(ADMIN_USER, ADMIN_SECRET) };
	while (Date.now() < deadlineMs) {
		try {
			const res = await fetch(url, { headers });
			if (res.ok) return;
		} catch {
			// keep trying
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`stalwart admin API never became ready on port ${HTTP_PORT}`);
}

async function createPrincipal(body: unknown, label: string): Promise<void> {
	const res = await fetch(`http://127.0.0.1:${HTTP_PORT}/api/principal`, {
		method: 'POST',
		headers: {
			Authorization: basicAuth(ADMIN_USER, ADMIN_SECRET),
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});
	if (res.ok) {
		console.log(`  ✓ created ${label}`);
		return;
	}
	const text = await res.text();
	if (res.status === 400 && text.includes('alreadyExists')) {
		console.log(`  • ${label} already exists`);
		return;
	}
	throw new Error(`failed to create ${label} (${res.status}): ${text}`);
}

async function seed(): Promise<void> {
	await createPrincipal(
		{ type: 'domain', name: 'test.local', description: 'mailbrus dev domain' },
		'domain test.local'
	);
	const local = SEED_USER.split('@')[0];
	await createPrincipal(
		{
			type: 'individual',
			name: local,
			emails: [SEED_USER],
			secrets: [SEED_SECRET],
			description: 'mailbrus dev user'
		},
		`user ${SEED_USER}`
	);
}

function banner(firstRun: boolean): void {
	const dash = `http://127.0.0.1:${HTTP_PORT}`;
	const lines = [
		'',
		'━'.repeat(64),
		'  Stalwart dev server is running',
		'━'.repeat(64),
		`  Web admin    : ${dash}`,
		`  Admin login  : ${ADMIN_USER} / ${ADMIN_SECRET}`,
		`  IMAP         : 127.0.0.1:${IMAP_PORT}  (no TLS — localhost only)`,
		`  Seeded user  : ${SEED_USER} / ${SEED_SECRET}`,
		'',
		'  Mailbrus config snippet:',
		'',
		'    [accounts.dev]',
		'    protocol = "imap"',
		`    email = "${SEED_USER}"`,
		'    imap_host = "127.0.0.1"',
		`    imap_port = ${IMAP_PORT}`,
		'    imap_tls = false',
		'    credential_backend = "plain"',
		`    credential_ref = "${SEED_SECRET}"`,
		'    maildir_root = "/tmp/mailbrus-dev/dev"',
		'',
		firstRun ? '  (fresh data directory — INBOX is empty)' : `  (reusing existing data under ${DATA})`,
		'',
		'  Ctrl-C to stop. Data persists between runs.',
		'━'.repeat(64),
		''
	];
	console.log(lines.join('\n'));
}

async function main(): Promise<void> {
	const firstRun = await ensureDirs();
	const child = spawn('stalwart', ['-c', CONFIG], { stdio: ['ignore', 'inherit', 'inherit'] });
	child.on('exit', (code) => {
		console.log(`\nstalwart exited (code ${code ?? 'null'})`);
		Deno.exit(code ?? 0);
	});

	const stopHandler = (): void => {
		console.log('\nshutting down stalwart…');
		child.kill('SIGTERM');
	};
	Deno.addSignalListener('SIGINT', stopHandler);
	Deno.addSignalListener('SIGTERM', stopHandler);

	try {
		await waitForAdmin(Date.now() + 20_000);
		await seed();
		banner(firstRun);
	} catch (e) {
		console.error(`setup failed: ${(e as Error).message}`);
		child.kill('SIGTERM');
		Deno.exit(1);
	}
}

await main();
