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
		'spam = "rocksdb"',
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
 *
 * NOTE: resolves on *any* tagged response, including `NO` and `BAD`. Use
 * [`imapExpectOk`] unless you specifically want to inspect a failure yourself.
 * Treating a tagged `NO` as success is how seeding silently did nothing for as
 * long as the sidecar's principals were misconfigured.
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

/**
 * Like [`imapTalk`], but throws unless the tagged response is `OK`.
 *
 * Every command whose failure would leave the sidecar in an unexpected state
 * must go through this. A silent `NO` here means a test runs against a mailbox
 * that does not contain what the test thinks it does.
 */
async function imapExpectOk(
	sock: Socket,
	cmd: string,
	endTag: string,
	what: string
): Promise<string> {
	const res = await imapTalk(sock, cmd, endTag);
	const tagged = res.split('\n').find((l) => l.startsWith(`${endTag} `))?.trim() ?? '';
	if (!tagged.startsWith(`${endTag} OK`)) {
		throw new Error(`stalwart ${what} failed: ${tagged || res.trim()}`);
	}
	return res;
}

async function injectMail(imapPort: number, email: string, secret: string, messages: string[]): Promise<void> {
	if (messages.length === 0) return;
	const sock = connect({ host: '127.0.0.1', port: imapPort });
	try {
		await new Promise<void>((resolve, reject) => {
			sock.once('data', () => resolve());
			sock.once('error', reject);
		});
		// AUTH PLAIN base64( \0 user \0 pass )
		const authToken = Buffer.from(`\0${email}\0${secret}`).toString('base64');
		await imapExpectOk(sock, `a1 AUTHENTICATE PLAIN ${authToken}\r\n`, 'a1', `authenticate as ${email}`);
		let n = 2;
		for (const raw of messages) {
			const tag = `a${n++}`;
			const bytes = Buffer.byteLength(raw, 'utf8');
			// The continuation request is untagged (`+ ...`), so it cannot be
			// checked for OK — the tagged result of the APPEND is checked below.
			await imapTalk(sock, `${tag} APPEND INBOX {${bytes}}\r\n`, '+');
			await new Promise<void>((resolve, reject) => {
				sock.write(raw + '\r\n', (e) => (e ? reject(e) : resolve()));
			});
			await imapExpectOk(sock, '', tag, `APPEND to ${email} INBOX`);
		}
		await imapExpectOk(sock, `a${n} LOGOUT\r\n`, `a${n}`, 'logout');
	} finally {
		sock.end();
	}
}

/**
 * Change a message's flags server-side via IMAP `UID STORE`.
 *
 * Lets a test simulate "the user read this on another client", which is the
 * only way to exercise flag propagation: the flags must change on the server,
 * out of band, between two syncs.
 *
 * `flags` are IMAP flag names including the backslash, e.g. `['\\Seen']`.
 * `mode` selects `+FLAGS` (add), `-FLAGS` (remove) or `FLAGS` (replace).
 */
export async function setServerFlags(opts: {
	imapPort: number;
	email: string;
	secret: string;
	/** UIDs to act on. Defaults to `1:*` (every message in the mailbox). */
	uids?: number[];
	flags: string[];
	mode?: 'add' | 'remove' | 'replace';
	mailbox?: string;
}): Promise<void> {
	const mailbox = opts.mailbox ?? 'INBOX';
	const seq = opts.uids && opts.uids.length > 0 ? opts.uids.join(',') : '1:*';
	const item = opts.mode === 'remove' ? '-FLAGS' : opts.mode === 'replace' ? 'FLAGS' : '+FLAGS';

	const sock = connect({ host: '127.0.0.1', port: opts.imapPort });
	try {
		await new Promise<void>((resolve, reject) => {
			sock.once('data', () => resolve());
			sock.once('error', reject);
		});
		const authToken = Buffer.from(`\0${opts.email}\0${opts.secret}`).toString('base64');
		await imapTalk(sock, `s1 AUTHENTICATE PLAIN ${authToken}\r\n`, 's1');
		// SELECT (not EXAMINE): STORE needs a read-write mailbox.
		await imapTalk(sock, `s2 SELECT ${mailbox}\r\n`, 's2');
		const res = await imapTalk(
			sock,
			`s3 UID STORE ${seq} ${item} (${opts.flags.join(' ')})\r\n`,
			's3'
		);
		if (!/^s3 OK/m.test(res)) {
			throw new Error(`UID STORE failed: ${res}`);
		}
		await imapTalk(sock, 's4 LOGOUT\r\n', 's4');
	} finally {
		sock.end();
	}
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
			// 30s (not 15s): under a full parallel run two Stalwart sidecars boot
			// alongside notmuch indexing + server spawns, and startup can exceed a
			// tighter window. The poll returns the instant Stalwart binds, so a
			// higher ceiling only costs wall-clock on the pathological slow path.
			waitForHttp(httpPort, Date.now() + 30_000, adminUser, adminSecret),
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
		// Two non-obvious requirements, each fixing a distinct failure — this is
		// why cleartext IMAP auth was long believed impossible against Stalwart:
		//
		//   `name` must be the full email. Stalwart's internal directory
		//   authenticates by principal *name*, not by any address in `emails`.
		//   With `name = "alice"`, `LOGIN alice@test.local` returns
		//   AUTHENTICATIONFAILED while `LOGIN alice` succeeds.
		//
		//   `roles` must be set. Without a role, auth *succeeds* and the session
		//   is then denied ("Unauthorized access") and the socket closed, which
		//   surfaces to the client as an EOF rather than an auth error.
		//
		// With both, cleartext LOGIN/AUTHENTICATE PLAIN work and the session
		// advertises CONDSTORE + QRESYNC. No TLS listener is needed.
		await createPrincipal(httpPort, adminUser, adminSecret, {
			type: 'individual',
			name: u.email,
			emails: [u.email],
			secrets: [u.secret],
			roles: ['user'],
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
