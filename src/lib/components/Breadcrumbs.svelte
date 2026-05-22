<script lang="ts">
	import Wordmark from './Wordmark.svelte';
	import type { Account, Folder } from '$lib/data.js';
	import type { Snippet } from 'svelte';

	let {
		account,
		folder,
		folderLabel,
		right,
		onHome,
		onAccount,
		onFolder
	}: {
		account: Account;
		folder: Folder;
		folderLabel?: string;
		right?: Snippet;
		onHome: () => void;
		onAccount: () => void;
		onFolder: () => void;
	} = $props();
</script>

<div class="mb-statusline">
	<button type="button" class="crumb crumb-home" onclick={onHome} title="Back to top" data-testid="breadcrumbs.home-btn">
		<span class="wordmark-slot"><Wordmark size={13} /></span>
	</button>
	<span class="sep">/</span>
	<button type="button" class="crumb crumb-account" onclick={onAccount} title="Switch account" data-testid="breadcrumbs.account-btn">
		{account.address}
	</button>
	<span class="sep">/</span>
	<button type="button" class="crumb crumb-folder" onclick={onFolder} title="Switch folder" data-testid="breadcrumbs.folder-btn">
		{folderLabel || folder.name}
	</button>
	{#if right}
		<span class="right">{@render right()}</span>
	{/if}
</div>
