/**
 * Ephemeral Stalwart IMAP/JMAP sidecar for tests that need a real mail server.
 *
 * Each call to `startStalwart` spins up a fresh instance bound to ephemeral
 * loopback ports, creates a configured `test.local` domain plus one or more
 * users, and (optionally) seeds each user's INBOX via IMAP APPEND.
 *
 * The sidecar is NOT started by the default test fixture — only specs that
 * import this helper pay the ~3-second startup cost. Use this from
 * `e2e/specs/sync.spec.ts` (the one place that drives a real IMAP backend).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, type Socket } from 'node:net';

export interface StalwartUser {
	/** Email address (becomes the IMAP login). The domain must be `test.local`. */
	email: string;
	/** Plaintext IMAP password. */
	secret: string;
	/** Optional fixture mail to APPEND into the user's INBOX after creation. */
	inboxMessages?: string[];
}

export interface StalwartHandle {
	/** Loopback IMAP port (plain, no TLS — fine for localhost tests). */
	imapPort: number;
	/** Loopback HTTP port serving the admin API and web UI. */
	httpPort: number;
	/** Admin credentials for the management API. */
	adminUser: string;
	adminSecret: string;
	/** Stop the server and delete its data directory. */
	stop: () => Promise<void>;
}

function reserveFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.on('error', reject);
		srv.listen(0, '127.0.0.1', () => {
			const addr = srv.address();
			const port = typeof addr === 'object' && addr ? addr.port : 0;
			srv.close(() => (port ? resolve(port) : reject(new Error('could not reserve a port'))));
		});
	});
}

function buildConfig(opts: {
	dataDir: string;
	logsDir: string;
	imapPort: number;
	httpPort: number;
	adminUser: string;
	adminSecret: string;
}): string {
	return [
		'[server.listener.imap]',
		`bind = "127.0.0.1:${opts.imapPort}"`,
		'protocol = "imap"',
		'',
		'[server.listener.http]',
		'protocol = "http"',
		`bind = "127.0.0.1:${opts.httpPort}"`,
		'',
		'[storage]',
		'data = "rocksdb"',
		'fts = "rocksdb"',
		'blob = "rocksdb"',
		'lookup = "rocksdb"',
		'directory = "internal"',
		'',
		'[store.rocksdb]',
		'type = "rocksdb"',
		`path = "${opts.dataDir}"`,
		'compression = "lz4"',
		'',
		'[directory.internal]',
		'type = "internal"',
		'store = "rocksdb"',
		'',
		'[tracer.log]',
		'type = "log"',
		'level = "warn"',
		`path = "${opts.logsDir}"`,
		'prefix = "stalwart.log"',
		'rotate = "daily"',
		'ansi = false',
		'enable = true',
		'',
		'[authentication.fallback-admin]',
		`user = "${opts.adminUser}"`,
		`secret = "${opts.adminSecret}"`,
		'',
		'# Allow LOGIN on the clear-text port. Localhost-only test sidecar.',
		'[imap.auth]',
		'allow-plain-text = true',
		''
	].join('\n');
}

async function waitForHttp(port: number, deadline: number, adminUser: string, adminSecret: string): Promise<void> {
	const url = `http://127.0.0.1:${port}/api/principal`;
	const auth = 'Basic ' + Buffer.from(`${adminUser}:${adminSecret}`).toString('base64');
	let lastErr: unknown;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url, { headers: { Authorization: auth } });
			if (res.ok) return;
			lastErr = new Error(`status ${res.status}`);
		} catch (e) {
			lastErr = e;
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error(`stalwart HTTP never became ready on port ${port}: ${String(lastErr)}`);
}

async function createPrincipal(
	httpPort: number,
	adminUser: string,
	adminSecret: string,
	body: unknown
): Promise<void> {
	const auth = 'Basic ' + Buffer.from(`${adminUser}:${adminSecret}`).toString('base64');
	const res = await fetch(`http://127.0.0.1:${httpPort}/api/principal`, {
		method: 'POST',
		headers: { Authorization: auth, 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`POST /api/principal failed (${res.status}): ${text}`);
	}
}

/**
 * Send `cmd` and resolve with the server output collected until `endTag` is seen
 * on a line of its own. Minimal IMAP wire helper — used only to drive APPEND
 * and LOGIN against the sidecar; production code uses imap-client.
 */
function imapTalk(sock: Socket, cmd: string, endTag: string, timeoutMs = 5_000): Promise<string> {
	return new Promise((resolve, reject) => {
		let buf = '';
		const onData = (chunk: Buffer): void => {
			buf += chunk.toString('utf8');
			if (buf.split('\n').some((l) => l.startsWith(`${endTag} `))) {
				sock.off('data', onData);
				resolve(buf);
			}
		};
		sock.on('data', onData);
		sock.write(cmd);
		const timer = setTimeout(() => {
			sock.off('data', onData);
			reject(new Error(`imap timeout waiting for ${endTag}: ${buf}`));
		}, timeoutMs);
		const cleanup = (): void => clearTimeout(timer);
		sock.once('end', cleanup);
		sock.once('error', (e) => {
			cleanup();
			reject(e);
		});
	});
}

async function injectMail(imapPort: number, email: string, secret: string, messages: string[]): Promise<void> {
	if (messages.length === 0) return;
	const sock = connect({ host: '127.0.0.1', port: imapPort });
	await new Promise<void>((resolve, reject) => {
		sock.once('data', () => resolve());
		sock.once('error', reject);
	});
	// AUTH PLAIN base64( \0 user \0 pass )
	const authToken = Buffer.from(`\0${email}\0${secret}`).toString('base64');
	await imapTalk(sock, `a1 AUTHENTICATE PLAIN ${authToken}\r\n`, 'a1');
	let n = 2;
	for (const raw of messages) {
		const tag = `a${n++}`;
		const bytes = Buffer.byteLength(raw, 'utf8');
		const appendCmd = `${tag} APPEND INBOX {${bytes}}\r\n`;
		await imapTalk(sock, appendCmd, '+'); // continuation
		await new Promise<void>((resolve, reject) => {
			sock.write(raw + '\r\n', (e) => (e ? reject(e) : resolve()));
		});
		// wait for the OK
		await imapTalk(sock, '', tag);
	}
	await imapTalk(sock, `a${n} LOGOUT\r\n`, `a${n}`);
	sock.end();
}

export async function startStalwart(opts: { users: StalwartUser[] }): Promise<StalwartHandle> {
	const root = await mkdtemp(join(tmpdir(), 'mailbrus-stalwart-'));
	const dataDir = join(root, 'data');
	const logsDir = join(root, 'logs');
	const etcDir = join(root, 'etc');
	const configPath = join(etcDir, 'config.toml');
	await Promise.all([
		(async () => {
			await rm(dataDir, { recursive: true, force: true });
		})(),
		(async () => {
			await rm(logsDir, { recursive: true, force: true });
		})()
	]);
	const { mkdir } = await import('node:fs/promises');
	await Promise.all([mkdir(etcDir, { recursive: true }), mkdir(logsDir, { recursive: true })]);

	const imapPort = await reserveFreePort();
	const httpPort = await reserveFreePort();
	const adminUser = 'admin';
	const adminSecret = 'mailbrus-test';

	const config = buildConfig({ dataDir, logsDir, imapPort, httpPort, adminUser, adminSecret });
	await writeFile(configPath, config);

	const child = spawn('stalwart', ['-c', configPath], { stdio: 'pipe' });
	let stderr = '';
	child.stderr?.on('data', (d) => (stderr += String(d)));
	const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()));
	const spawnFailed = new Promise<never>((_, reject) =>
		child.on('error', (e) => reject(new Error(`failed to spawn stalwart: ${e.message}`)))
	);

	try {
		await Promise.race([
			waitForHttp(httpPort, Date.now() + 15_000, adminUser, adminSecret),
			spawnFailed
		]);
	} catch (e) {
		child.kill('SIGKILL');
		throw new Error(
			`${(e as Error).message}${stderr ? `\nstalwart stderr:\n${stderr}` : ''}`
		);
	}

	// Seed: domain + users + fixture mail.
	await createPrincipal(httpPort, adminUser, adminSecret, {
		type: 'domain',
		name: 'test.local',
		description: 'mailbrus e2e test domain'
	});
	for (const u of opts.users) {
		const local = u.email.split('@')[0];
		await createPrincipal(httpPort, adminUser, adminSecret, {
			type: 'individual',
			name: local,
			emails: [u.email],
			secrets: [u.secret],
			description: 'mailbrus e2e test user'
		});
		if (u.inboxMessages && u.inboxMessages.length > 0) {
			await injectMail(imapPort, u.email, u.secret, u.inboxMessages);
		}
	}

	const stop = async (): Promise<void> => {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill('SIGTERM');
			const stopped = await Promise.race([
				exited.then(() => true),
				new Promise<boolean>((r) => setTimeout(() => r(false), 5_000))
			]);
			if (!stopped) child.kill('SIGKILL');
		}
		await rm(root, { recursive: true, force: true });
	};

	return { imapPort, httpPort, adminUser, adminSecret, stop };
}
