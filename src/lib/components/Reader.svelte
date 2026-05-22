<script lang="ts">
	import Breadcrumbs from './Breadcrumbs.svelte';
	import Attachments from './Attachments.svelte';
	import HeadersPopover from './HeadersPopover.svelte';
	import { expandTime, splitSignature, buildHeaders } from '$lib/utils.js';
	import type { Account, Folder, Message } from '$lib/data.js';

	let {
		message,
		account,
		folder,
		body,
		onClose,
		onHome,
		onAccount,
		onFolder
	}: {
		message: Message;
		account: Account;
		folder: Folder;
		body: string;
		onClose: () => void;
		onHome: () => void;
		onAccount: () => void;
		onFolder: () => void;
	} = $props();

	let showHeaders = $state(false);

	let ago = $derived(expandTime(message.time));
	let parts = $derived(splitSignature(body));
	let headers = $derived(buildHeaders(message, account, folder));
	let unsubHeader = $derived(headers.find(([k]) => k === 'List-Unsubscribe')?.[1] ?? null);

	let sentMatch = $derived((message.from || '').match(/^To:\s*(.+)$/));
	let isDraft = $derived(message.from === 'Draft' || message.from === 'Drafts');
</script>

<div class="mb-reader" data-testid="reader.container">
	<Breadcrumbs {account} {folder} {onHome} {onAccount} {onFolder}>
		{#snippet right()}
			<span class="count">reading</span>
			<span>·</span>
			<span><span class="kbd">esc</span> back</span>
		{/snippet}
	</Breadcrumbs>

	<div class="mb-reader-scroll mb-scroll">
		<div class="mb-reader-head">
			<div class="sub">
				<div class="sub-line">
					<span class="sub-text">
						{message.subject}
						<span class="sub-ago" title={ago.iso}> [{ago.label}]</span>
					</span>
					<span class="sub-icons">
						<span
							class="sub-icon sub-icon-static{parts.sig ? '' : ' is-unsigned'}"
							title={parts.sig ? 'Signed message (has signature block)' : 'Unsigned'}
							aria-label={parts.sig ? 'Signed message' : 'Unsigned'}
						>
							{#if parts.sig}
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
									<rect x="4" y="11" width="16" height="10" rx="2" />
									<path d="M8 11V8a4 4 0 0 1 8 0v3" />
								</svg>
							{:else}
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
									<rect x="4" y="11" width="16" height="10" rx="2" />
									<path d="M8 11V8a4 4 0 0 1 7-2.6" />
								</svg>
							{/if}
						</span>
						{#if unsubHeader}
							<button
								type="button"
								class="sub-icon sub-icon-btn"
								onclick={(e) => e.preventDefault()}
								title="Unsubscribe — {unsubHeader}"
								aria-label="Unsubscribe from this mailing list"
								data-testid="reader.unsubscribe-btn"
							>
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
									<path d="M4 6.5l8 6 8-6" />
									<rect x="3.25" y="5" width="17.5" height="14" rx="2" />
									<path d="M7.5 14.5l5 -5" />
									<path d="M7.5 9.5l5 5" />
								</svg>
							</button>
						{/if}
						<button
							type="button"
							class="sub-icon sub-icon-btn{showHeaders ? ' is-active' : ''}"
							onclick={() => (showHeaders = !showHeaders)}
							title="View raw message headers"
							aria-label="View raw message headers"
							aria-expanded={showHeaders}
							data-testid="reader.headers-btn"
						>
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
								<path d="M4 6h16" />
								<path d="M4 11h16" />
								<path d="M4 16h10" />
							</svg>
						</button>
					</span>
				</div>
				{#if showHeaders}
					<HeadersPopover {headers} onClose={() => (showHeaders = false)} />
				{/if}
			</div>
			<div class="meta">
				{#if sentMatch}
					<div><span class="meta-label">From</span> {account.address}</div>
					<div>
						<span class="meta-label">To</span>{"   "}
						{sentMatch[1] === message.addr ? message.addr : `${sentMatch[1]} <${message.addr}>`}
					</div>
				{:else if isDraft}
					<div><span class="meta-label">From</span> {account.address}</div>
					<div><span class="meta-label">To</span>{"   "}<span style="opacity: 0.5">(no recipient)</span></div>
				{:else}
					<div>
						<span class="meta-label">From</span> {message.from}
						{#if message.addr && message.addr !== message.from}&lt;{message.addr}&gt;{/if}
					</div>
					<div><span class="meta-label">To</span>{"   "}{account.address}</div>
				{/if}
			</div>
		</div>

		<Attachments items={message.attachments} />

		<div class="mb-reader-body">
			{parts.main}
			{#if parts.sig}
				{"\n"}<span class="mb-sig">{parts.sig}</span>
			{/if}
		</div>
	</div>
</div>
