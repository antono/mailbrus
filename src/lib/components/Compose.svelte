<script lang="ts">
	import Breadcrumbs from './Breadcrumbs.svelte';
	import RecipientInput from './RecipientInput.svelte';
	import type { Account, Folder } from '$lib/data.js';
	// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md
	import { pushScope, popScope } from '$lib/hotkeys/scope.svelte.ts';
	import { registerKeymap } from '$lib/hotkeys/registry.svelte.ts';
	import { createComposeKeymap } from '$lib/hotkeys/keymaps/compose.ts';

	let {
		account,
		folder,
		onClose,
		onSent,
		onHome,
		onAccount,
		onFolder
	}: {
		account: Account;
		folder: Folder;
		onClose: () => void;
		onSent: (draft: object) => void;
		onHome: () => void;
		onAccount: () => void;
		onFolder: () => void;
	} = $props();

	let to = $state('');
	let cc = $state('');
	let bcc = $state('');
	let subject = $state('');
	let body = $state('');
	let showCc = $state(false);
	let showBcc = $state(false);

	let isDirty = $derived(!!(to || cc || bcc || subject || body));
	let wordCount = $derived(body.trim() ? body.trim().split(/\s+/).length : 0);
	let charCount = $derived(body.length);

	$effect(() => {
		pushScope('compose');
		const dispose = registerKeymap(
			createComposeKeymap({
				send: () => onSent({ to, cc, bcc, subject, body }),
				saveDraft: () => onSent({ to, cc, bcc, subject, body, draft: true }),
				escape: () => {
					if (isDirty) {
						if (window.confirm('Discard this draft?')) onClose();
					} else {
						onClose();
					}
				}
			})
		);
		return () => {
			dispose();
			popScope('compose');
		};
	});
</script>

<div class="mb-compose" data-testid="compose.container">
	<Breadcrumbs {account} {folder} folderLabel="Compose" {onHome} {onAccount} {onFolder}>
		{#snippet right()}
			<span class="count">{wordCount} words · {charCount} chars</span>
			<span>·</span>
			<span><span class="kbd">esc</span> discard</span>
			<span>·</span>
			<span><span class="kbd">⌘</span><span class="kbd">↵</span> send</span>
		{/snippet}
	</Breadcrumbs>

	<div class="mb-compose-scroll mb-scroll">
		<div class="mb-compose-fields">
			<div class="cf-row">
				<label class="cf-label" for="cf-from">From</label>
				<div class="cf-value cf-static">{account.address}</div>
			</div>
			<div class="cf-row">
				<label class="cf-label" for="cf-to">To</label>
				<RecipientInput
					id="cf-to"
					testid="compose.to-input"
					value={to}
					onChange={(v) => (to = v)}
					placeholder="someone@example.com, another@example.com"
					autoFocus={true}
				/>
				<div class="cf-aux">
					{#if !showCc}
						<button type="button" class="cf-aux-btn" onclick={() => (showCc = true)} data-testid="compose.add-cc-btn">+ Cc</button>
					{/if}
					{#if !showBcc}
						<button type="button" class="cf-aux-btn" onclick={() => (showBcc = true)} data-testid="compose.add-bcc-btn">+ Bcc</button>
					{/if}
				</div>
			</div>
			{#if showCc}
				<div class="cf-row">
					<label class="cf-label" for="cf-cc">Cc</label>
					<RecipientInput id="cf-cc" testid="compose.cc-input" value={cc} onChange={(v) => (cc = v)} />
				</div>
			{/if}
			{#if showBcc}
				<div class="cf-row">
					<label class="cf-label" for="cf-bcc">Bcc</label>
					<RecipientInput id="cf-bcc" testid="compose.bcc-input" value={bcc} onChange={(v) => (bcc = v)} />
				</div>
			{/if}
			<div class="cf-row">
				<label class="cf-label" for="cf-subject">Subject</label>
				<input
					id="cf-subject"
					data-testid="compose.subject-input"
					class="cf-input cf-input-subject"
					type="text"
					bind:value={subject}
					spellcheck={true}
					autocomplete="off"
				/>
			</div>
		</div>
		<div class="mb-compose-divider" aria-hidden="true"></div>
		<textarea
			class="mb-compose-body mb-scroll"
			data-testid="compose.body"
			bind:value={body}
			placeholder="Write your message…"
			spellcheck={true}
		></textarea>
	</div>
</div>
