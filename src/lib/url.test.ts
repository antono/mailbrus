import { assertEquals } from 'jsr:@std/assert';
import { parsePath, buildPath, buildFolderUrl, buildMessageUrl, buildSearchUrl } from './url.ts';

function u(path: string): URL {
	return new URL(`http://localhost${path}`);
}

Deno.test('parsePath: root → empty descriptor', () => {
	assertEquals(parsePath(u('/')), {});
});

Deno.test('parsePath: folder', () => {
	assertEquals(parsePath(u('/folder/inbox')), { folderId: 'inbox' });
});

Deno.test('parsePath: folder + message', () => {
	assertEquals(parsePath(u('/folder/inbox/message/42')), { folderId: 'inbox', messageId: '42' });
});

Deno.test('parsePath: search with query', () => {
	assertEquals(parsePath(u('/search?q=hello')), { query: 'hello' });
});

Deno.test('parsePath: search empty query', () => {
	assertEquals(parsePath(u('/search?q=')), { query: '' });
});

Deno.test('parsePath: URL-encoded ids', () => {
	const result = parsePath(u('/folder/my%20folder/message/id%2Fwith%2Fslashes'));
	assertEquals(result, { folderId: 'my folder', messageId: 'id/with/slashes' });
});

Deno.test('parsePath: trailing slash on folder', () => {
	assertEquals(parsePath(u('/folder/inbox/')), { folderId: 'inbox' });
});

Deno.test('parsePath: unknown path → empty descriptor', () => {
	assertEquals(parsePath(u('/unknown/deep/path')), {});
});

Deno.test('buildPath: root descriptor', () => {
	assertEquals(buildPath({}), '/');
});

Deno.test('buildPath: folder', () => {
	assertEquals(buildPath({ folderId: 'inbox' }), '/folder/inbox');
});

Deno.test('buildPath: folder + message', () => {
	assertEquals(buildPath({ folderId: 'inbox', messageId: '42' }), '/folder/inbox/message/42');
});

Deno.test('buildPath: search', () => {
	assertEquals(buildPath({ query: 'hello world' }), '/search?q=hello+world');
});

Deno.test('buildPath: round-trip folder', () => {
	const desc = { folderId: 'inbox' };
	assertEquals(parsePath(u(buildPath(desc))), desc);
});

Deno.test('buildPath: round-trip folder+message', () => {
	const desc = { folderId: 'inbox', messageId: '42' };
	assertEquals(parsePath(u(buildPath(desc))), desc);
});

Deno.test('buildPath: round-trip search', () => {
	const desc = { query: 'hello' };
	assertEquals(parsePath(u(buildPath(desc))), desc);
});

Deno.test('buildPath: encodes special chars in ids', () => {
	const path = buildPath({ folderId: 'my folder' });
	assertEquals(path, '/folder/my%20folder');
});

Deno.test('helpers: buildFolderUrl', () => {
	assertEquals(buildFolderUrl('inbox'), '/folder/inbox');
});

Deno.test('helpers: buildMessageUrl', () => {
	assertEquals(buildMessageUrl('inbox', '42'), '/folder/inbox/message/42');
});

Deno.test('helpers: buildSearchUrl', () => {
	assertEquals(buildSearchUrl('test'), '/search?q=test');
});
