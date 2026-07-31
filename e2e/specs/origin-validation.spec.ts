/** origin-validation: Host allowlist, cross-site rejection, and enforced --auth (CWE-346). */
import { test, expect } from '../harness/fixtures.ts';
import { request as httpRequest } from 'node:http';
import { cloneCorpus, removeClone, type Clone } from '../harness/clone.ts';
import { writeFixtureConfig } from '../harness/config.ts';
import { indexClone } from '../harness/notmuch.ts';
import { startServer, type ServerHandle } from '../harness/server.ts';
import { manifest } from '../fixtures/manifest.ts';

/**
 * Issue a raw HTTP request with full control over the `Host` header — something
 * `fetch`/APIRequestContext forbid. Connecting to loopback while sending a
 * foreign `Host` is exactly the DNS-rebinding shape the Host allowlist defends
 * against.
 */
function rawStatus(opts: {
	baseURL: string;
	method: string;
	path: string;
	host?: string;
	headers?: Record<string, string>;
}): Promise<number> {
	const url = new URL(opts.baseURL);
	return new Promise((resolve, reject) => {
		const req = httpRequest(
			{
				hostname: url.hostname,
				port: url.port,
				method: opts.method,
				path: opts.path,
				headers: { ...(opts.host ? { Host: opts.host } : {}), ...opts.headers }
			},
			(res) => {
				res.resume(); // drain so the socket can close
				resolve(res.statusCode ?? 0);
			}
		);
		req.on('error', reject);
		req.end();
	});
}

// openspec/changes/harden-api-origin-validation/specs/api-origin-validation/spec.md: loopback same-origin requests are served normally
test('same-origin loopback requests reach the API and the SPA shell', async ({ app, request }) => {
	const api = await request.get(`${app.baseURL}/api/maildirs`);
	expect(api.ok()).toBe(true);
	const maildirs = (await api.json()) as unknown[];
	expect(maildirs).toHaveLength(manifest.length);

	const shell = await request.get(`${app.baseURL}/`);
	expect(shell.ok()).toBe(true);
	expect(shell.headers()['content-type']).toContain('text/html');
});

// openspec/changes/harden-api-origin-validation/specs/api-origin-validation/spec.md: a foreign Host header is rejected 403 (DNS-rebinding)
test('foreign Host header is rejected with 403 on both API and shell', async ({ app }) => {
	const apiStatus = await rawStatus({
		baseURL: app.baseURL,
		method: 'GET',
		path: '/api/maildirs',
		host: 'evil.example.com'
	});
	expect(apiStatus).toBe(403);

	// The guard is outermost, so the static SPA shell is protected too.
	const shellStatus = await rawStatus({
		baseURL: app.baseURL,
		method: 'GET',
		path: '/',
		host: 'evil.example.com'
	});
	expect(shellStatus).toBe(403);

	// Control: the same request with the correct loopback Host is served.
	const okStatus = await rawStatus({ baseURL: app.baseURL, method: 'GET', path: '/api/maildirs' });
	expect(okStatus).toBe(200);
});

// openspec/changes/harden-api-origin-validation/specs/api-origin-validation/spec.md: cross-site state-changing requests are rejected 403
test('cross-site POST /api/sync is rejected with 403', async ({ app }) => {
	const url = new URL(app.baseURL);
	const status = await rawStatus({
		baseURL: app.baseURL,
		method: 'POST',
		path: '/api/sync',
		host: `${url.hostname}:${url.port}`, // valid Host — isolate the cross-site guard
		headers: { 'Sec-Fetch-Site': 'cross-site' }
	});
	expect(status).toBe(403);
});

// openspec/changes/harden-api-origin-validation/specs/api-origin-validation/spec.md: --auth enforces a bearer token on /api/*
test('server started with --auth requires a matching bearer token', async () => {
	const token = 'e2e-secret-token';
	let clone: Clone | undefined;
	let server: ServerHandle | undefined;
	try {
		clone = await cloneCorpus();
		const scope = await indexClone(clone);
		const config = await writeFixtureConfig(clone);
		server = await startServer({ scope, clone, config, auth: token });

		const missing = await fetch(`${server.baseURL}/api/maildirs`);
		expect(missing.status).toBe(401);

		const wrong = await fetch(`${server.baseURL}/api/maildirs`, {
			headers: { Authorization: 'Bearer nope' }
		});
		expect(wrong.status).toBe(401);

		const ok = await fetch(`${server.baseURL}/api/maildirs`, {
			headers: { Authorization: `Bearer ${token}` }
		});
		expect(ok.status).toBe(200);
	} finally {
		if (server) await server.stop();
		await removeClone(clone);
	}
});
