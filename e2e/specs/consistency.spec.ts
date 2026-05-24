/**
 * Task 3.3 — manifest <-> on-disk corpus consistency.
 *
 * Runs without a server (pure filesystem + manifest), so it is fast and proves
 * the contract the UI specs depend on: every manifest message exists on disk,
 * every on-disk message is in the manifest, the folder layout is valid, and no
 * notmuch/Xapian index artifacts were committed.
 */
import { test, expect } from '@playwright/test';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { PRISTINE_MAILDIR } from '../harness/paths.ts';
import { FOLDER_NAMES, manifest, relPathOf } from '../fixtures/manifest.ts';

const GITKEEP = '.gitkeep';

function listMessageFiles(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) listMessageFiles(full, acc);
		else if (entry.name !== GITKEEP) acc.push(relative(PRISTINE_MAILDIR, full).split(sep).join('/'));
	}
	return acc;
}

test.describe('fixture corpus consistency', () => {
	// openspec/specs/test-maildir-fixtures/spec.md: corpus consistency
	test('every manifest message exists on disk', () => {
		for (const account of manifest) {
			for (const folder of account.folders) {
				for (const m of folder.messages) {
					const rel = relPathOf(account, folder, m);
					expect(existsSync(join(PRISTINE_MAILDIR, rel)), `manifest entry missing on disk: ${rel}`).toBe(true);
				}
			}
		}
	});

	// openspec/specs/test-maildir-fixtures/spec.md: manifest coverage
	test('every on-disk message is in the manifest', () => {
		const expected = new Set<string>();
		for (const account of manifest) {
			for (const folder of account.folders) {
				for (const m of folder.messages) expected.add(relPathOf(account, folder, m));
			}
		}
		const onDisk = listMessageFiles(PRISTINE_MAILDIR);
		for (const rel of onDisk) {
			expect(expected.has(rel), `on-disk file not described by manifest: ${rel}`).toBe(true);
		}
		expect(onDisk.length).toBe(expected.size);
	});

	// openspec/specs/test-maildir-fixtures/spec.md: maildir structure
	test('each account has the standard folder set as valid maildirs', () => {
		for (const account of manifest) {
			for (const name of FOLDER_NAMES) {
				for (const box of ['cur', 'new', 'tmp']) {
					const dir = join(PRISTINE_MAILDIR, account.address, name, box);
					expect(existsSync(dir) && statSync(dir).isDirectory(), `missing maildir ${account.address}/${name}/${box}`).toBe(true);
				}
			}
		}
	});

	// openspec/specs/test-maildir-fixtures/spec.md: clean artifacts
	test('no notmuch/Xapian index artifacts are committed', () => {
		const stack = [PRISTINE_MAILDIR];
		while (stack.length) {
			const dir = stack.pop()!;
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				expect(entry.name).not.toBe('.notmuch');
				if (entry.isDirectory()) stack.push(join(dir, entry.name));
			}
		}
	});
});
