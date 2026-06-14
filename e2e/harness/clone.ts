/** Per-test clone of the pristine corpus into a unique temp dir (under /tmp). */
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLONE_PREFIX, PRISTINE_MAILDIR } from './paths.ts';

export interface Clone {
	/** Temp root: holds `data/` (the XDG data home) and `notmuch-config`. */
	root: string;
	/** Per-clone `XDG_DATA_HOME` handed to the server so it owns its own DB. */
	xdgDataHome: string;
	/**
	 * The cloned maildir tree, which doubles as the mailbrus notmuch database
	 * root (`$XDG_DATA_HOME/mailbrus/`). Account dirs live directly beneath it so
	 * notmuch `folder:` terms stay `<account>/<folder>`.
	 */
	maildir: string;
}

/** Copy the pristine corpus into a fresh `mailbrus-e2e-*` temp directory. */
export async function cloneCorpus(): Promise<Clone> {
	const root = await mkdtemp(join(tmpdir(), CLONE_PREFIX));
	const xdgDataHome = join(root, 'data');
	// The server resolves its notmuch DB to `$XDG_DATA_HOME/mailbrus/`; clone the
	// corpus there so every account maildir sits under the database root (a hard
	// requirement: notmuch only indexes files beneath its mail root).
	const maildir = join(xdgDataHome, 'mailbrus');
	await mkdir(xdgDataHome, { recursive: true });
	await cp(PRISTINE_MAILDIR, maildir, { recursive: true });
	return { root, xdgDataHome, maildir };
}

/** Recursively delete a clone. Safe to call on a half-built clone. */
export async function removeClone(clone: Clone | undefined): Promise<void> {
	if (!clone) return;
	await rm(clone.root, { recursive: true, force: true });
}
