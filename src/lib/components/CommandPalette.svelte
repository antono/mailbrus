<script lang="ts">
	import Palette from './Palette.svelte';
	import type { Account, Folder } from '$lib/data.js';

	let {
		account,
		folder,
		onAction,
		onCancel
	}: {
		account: Account;
		folder: Folder;
		onAction: (cmd: string) => void;
		onCancel: () => void;
	} = $props();

	const items = [
		{ key: 'switch-account', primary: 'Switch account…', secondary: 'Choose a different maildir', meta: 'g a' },
		{ key: 'switch-folder', primary: 'Switch folder…', secondary: `Within ${account.address}`, meta: 'g f' },
		{ key: 'go-inbox', primary: 'Go to inbox', secondary: 'Jump to INBOX', meta: 'g i' },
		{ key: 'go-archive', primary: 'Go to archive', secondary: 'Jump to Archive', meta: 'g A' },
		{ key: 'compose', primary: 'Compose new message', secondary: `From ${account.address}`, meta: 'c' },
		{ key: 'mark-read', primary: 'Mark all as read', secondary: `In ${folder?.name || 'current folder'}`, meta: '' },
		{ key: 'search', primary: 'Search this folder', secondary: 'Filter messages by sender / subject', meta: '/' },
		{ key: 'keyboard-help', primary: 'Keyboard shortcuts…', secondary: 'Show all hotkeys', meta: '?' },
		{ key: 'about', primary: 'About Mailbrus…', secondary: 'Philosophy, source, license', meta: '' },
		{ key: 'toggle-dark', primary: 'Toggle dark mode', secondary: '', meta: '' }
	];
</script>

<Palette
	eyebrow="command"
	title="Commands"
	placeholder="Type a command…"
	{items}
	onSelect={(it) => onAction(it.key)}
	{onCancel}
	curtainTestId="commands.curtain"
/>
