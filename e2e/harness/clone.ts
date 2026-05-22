/** Per-test clone of the pristine corpus into a unique temp dir (under /tmp). */
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLONE_PREFIX, PRISTINE_MAILDIR } from './paths.ts';

export interface Clone {
	/** Temp root: holds `maildir/` (the indexed tree) and `notmuch-config`. */
	root: string;
	/** The cloned maildir tree == notmuch `database.path`. */
	maildir: string;
}

/** Copy the pristine corpus into a fresh `mailbrus-e2e-*` temp directory. */
export async function cloneCorpus(): Promise<Clone> {
	const root = await mkdtemp(join(tmpdir(), CLONE_PREFIX));
	const maildir = join(root, 'maildir');
	// Keeping the notmuch config a sibling of `maildir/` (not inside it) means
	// notmuch never tries to index its own config file.
	await cp(PRISTINE_MAILDIR, maildir, { recursive: true });
	return { root, maildir };
}

/** Recursively delete a clone. Safe to call on a half-built clone. */
export async function removeClone(clone: Clone | undefined): Promise<void> {
	if (!clone) return;
	await rm(clone.root, { recursive: true, force: true });
}
