/** Spawn `mailbrus-server` on a free port against a clone, health-poll, stop. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { BUILD_DIR, SERVER_BIN } from './paths.ts';
import type { NotmuchScope } from './notmuch.ts';
import type { ConfigHandle } from './config.ts';
import type { Clone } from './clone.ts';

export interface ServerHandle {
	/** `http://127.0.0.1:<port>` for the browser and API. */
	baseURL: string;
	/** SIGTERM the server and await its exit (SIGKILL fallback). */
	stop: () => Promise<void>;
}

/** Reserve an ephemeral loopback port, then release it for the server to bind. */
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

async function waitForHealth(baseURL: string, timeoutMs = 20_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastErr: unknown;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${baseURL}/api/maildirs`);
			if (res.ok) return;
			lastErr = new Error(`status ${res.status}`);
		} catch (e) {
			lastErr = e;
		}
		await new Promise((r) => setTimeout(r, 150));
	}
	throw new Error(`server never became healthy at ${baseURL}: ${String(lastErr)}`);
}

export interface ServerOptions {
	scope: NotmuchScope;
	clone: Clone;
	/** Mailbrus config TOML; the server reads accounts from this file. */
	config: ConfigHandle;
}

/** Start a server scoped to `scope`'s notmuch config and wait until it answers. */
export async function startServer(opts: ServerOptions): Promise<ServerHandle> {
	const port = await reserveFreePort();
	const baseURL = `http://127.0.0.1:${port}`;

	const args = [
		'--bind',
		`127.0.0.1:${port}`,
		'--frontend-dist',
		BUILD_DIR,
		'--config',
		opts.config.path,
		'--notmuch-db',
		opts.clone.maildir
	];

	const child = spawn(SERVER_BIN, args, {
		env: { ...process.env, NOTMUCH_CONFIG: opts.scope.configPath },
		stdio: 'pipe'
	});

	const exited = new Promise<void>((resolve) => child.on('exit', () => resolve()));

	let stderr = '';
	child.stderr?.on('data', (d) => (stderr += String(d)));
	const spawnFailed = new Promise<never>((_, reject) =>
		child.on('error', (e) => reject(new Error(`failed to spawn ${SERVER_BIN}: ${e.message}`)))
	);

	try {
		await Promise.race([waitForHealth(baseURL), spawnFailed]);
	} catch (e) {
		child.kill('SIGKILL');
		throw new Error(`${(e as Error).message}${stderr ? `\nserver stderr:\n${stderr}` : ''}`);
	}

	const stop = async (): Promise<void> => {
		if (child.exitCode !== null || child.signalCode !== null) return;
		child.kill('SIGTERM');
		const stopped = await Promise.race([
			exited.then(() => true),
			new Promise<boolean>((r) => setTimeout(() => r(false), 5_000))
		]);
		if (!stopped) child.kill('SIGKILL');
	};

	return { baseURL, stop };
}
