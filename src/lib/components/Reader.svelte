<script lang="ts">
	import Breadcrumbs from './Breadcrumbs.svelte';
	import Attachments from './Attachments.svelte';
	import HeadersPopover from './HeadersPopover.svelte';
	import { expandTime, splitSignature, buildHeaders } from '$lib/utils.js';
	import type { Account, Folder, Message } from '$lib/data.js';
	import { type RenderMode } from '$lib/api.js';
	import { getSettings, writeSetting } from '$lib/settings.js';
	// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md
	// openspec/changes/hotkeys-improvement/specs/reader-message-actions/spec.md
	import { useScopedKeymap } from '$lib/hotkeys/scope-bind.svelte.ts';
	import { createReaderKeymap } from '$lib/hotkeys/keymaps/reader.ts';
	import { ui } from '$lib/ui-state.svelte.ts';
	import { buildReply, buildForward } from '$lib/reply.ts';
	import { copyText } from '$lib/clipboard.ts';

	let {
		message,
		account,
		folder,
		body,
		mode,
		has_plain,
		has_html,
		has_remote,
		format_flowed,
		attachments = [],
		to = [],
		cc = [],
		onClose,
		onHome,
		onAccount,
		onFolder,
		onModeChange,
		onNext,
		onPrev,
		onQuit,
		onActivateHints,
		msgIndex,
		pageNum,
		lastPage,
		total,
		bodyEl = $bindable<HTMLDivElement | null>(null)
	}: {
		message: Message;
		account: Account;
		folder: Folder;
		body: string;
		mode: RenderMode;
		has_plain: boolean;
		has_html: boolean;
		has_remote: number;
		format_flowed: boolean;
		attachments?: { name: string; size: number; mime: string }[];
		to?: string[];
		cc?: string[];
		onClose: () => void;
		onHome: () => void;
		onAccount: () => void;
		onFolder: () => void;
		onModeChange: (m: RenderMode) => void;
		onNext: () => void;
		onPrev: () => void;
		onQuit: () => void;
		onActivateHints: () => void;
		msgIndex: number;
		pageNum: number;
		lastPage: number;
		total: number;
		bodyEl?: HTMLDivElement | null;
	} = $props();

	let showHeaders = $state(false);
	let remoteLoaded = $derived(
		getSettings().remote_loaded_messages.includes(message.id)
	);

	let ago = $derived(expandTime(message.time));
	// In text/simple modes we still use splitSignature; in html mode it's irrelevant.
	let parts = $derived(mode === 'html' ? { main: body, sig: null } : splitSignature(body));
	let headers = $derived(buildHeaders(message, account, folder));
	let unsubHeader = $derived(headers.find(([k]) => k === 'List-Unsubscribe')?.[1] ?? null);

	let sentMatch = $derived((message.from || '').match(/^To:\s*(.+)$/));
	let isDraft = $derived(message.from === 'Draft' || message.from === 'Drafts');

	let scrolled = $state(false);
	let scrollEl: HTMLElement;

	const SCROLL_LINE_PX = 20;

	function scrollLines(dir: 1 | -1) {
		if (!scrollEl) return;
		scrollEl.scrollBy({ top: dir * 20 * SCROLL_LINE_PX, behavior: 'smooth' });
	}

	function scrollByPage(dir: 1 | -1) {
		if (!scrollEl) return;
		const step = Math.round(scrollEl.clientHeight * 0.75);
		scrollEl.scrollBy({ top: dir * step, behavior: 'smooth' });
	}

	function scrollBodyTop() {
		scrollEl?.scrollTo({ top: 0 });
	}

	function scrollBodyBottom() {
		if (scrollEl) scrollEl.scrollTo({ top: scrollEl.scrollHeight });
	}

	// ── Reader message actions (reply / forward / yank / headers) ───────────────
	// openspec/changes/hotkeys-improvement/specs/reader-message-actions/spec.md

	// The opened message as a reply/forward source: sender plus the real To/Cc
	// recipients threaded from the message-detail response.
	let replySource = $derived({
		from: message.from || message.addr,
		addr: message.addr,
		subject: message.subject,
		to,
		cc
	});

	function openPrefilled(draft: import('$lib/reply.ts').ComposeDraft) {
		ui.composePrefill = draft;
		ui.composeOpen = true;
	}

	function reply() {
		openPrefilled(buildReply(replySource, account, body));
	}
	function replyAll() {
		openPrefilled(buildReply(replySource, account, body, { all: true }));
	}
	function forward() {
		openPrefilled(buildForward(replySource, account, body, headers));
	}

	function toggleHeaders() {
		showHeaders = !showHeaders;
	}

	function yankBody() {
		void copyText(body);
	}

	// `Y` copies the displayed common headers (From/To/Subject + Date/Cc when
	// present) drawn from the same rows shown in the popover, a blank line, then
	// the body. Cc is sourced from the threaded recipients (buildHeaders has none).
	function yankHeaders() {
		const lines: string[] = [];
		for (const name of ['From', 'To']) {
			const row = headers.find(([k]) => k === name);
			if (row) lines.push(`${name}: ${row[1]}`);
		}
		if (cc.length) lines.push(`Cc: ${cc.join(', ')}`);
		for (const name of ['Subject', 'Date']) {
			const row = headers.find(([k]) => k === name);
			if (row) lines.push(`${name}: ${row[1]}`);
		}
		void copyText(`${lines.join('\n')}\n\n${body}`);
	}

	useScopedKeymap('reader', () =>
		createReaderKeymap({
			next: onNext,
			prev: onPrev,
			open: onNext,
			scrollLineDown: () => scrollLines(1),
			scrollLineUp: () => scrollLines(-1),
			pageDown: () => scrollByPage(1),
			pageUp: () => scrollByPage(-1),
			jumpTop: scrollBodyTop,
			jumpBottom: scrollBodyBottom,
			activateHints: onActivateHints,
			reply,
			replyAll,
			forward,
			yankBody,
			yankHeaders,
			toggleHeaders,
			goFolderPicker: onFolder,
			goAccountPicker: onAccount,
			close: onClose,
			quit: onQuit
		})
	);

	let compactMeta = $derived.by(() => {
		const from = sentMatch ? account.address : (isDraft ? account.address : (message.from || message.addr));
		const to = sentMatch
			? (sentMatch[1] === message.addr ? message.addr : `${sentMatch[1]} <${message.addr}>`)
			: (isDraft ? '(no recipient)' : account.address);
		return `${from} → ${to} · ${ago.label}`;
	});

	$effect(() => {
		void message.id;
		scrolled = false;
	});

	function handleScroll(e: Event) {
		scrolled = (e.target as HTMLElement).scrollTop > 4;
	}

	// Task 4.5: iframe srcdoc with injected meta CSP.
	// sandbox="allow-popups allow-popups-to-escape-sandbox" → null origin, no scripts, no
	// forms, but links open in a real browser tab (not sandboxed). <base target="_blank">
	// makes all untagged links open externally without per-link target attributes.
	// base-uri 'none' blocks <base href> URL hijacking; <base target> (no href) is unaffected.
	const IFRAME_CSP =
		"default-src 'none'; img-src * data:; style-src 'unsafe-inline'; script-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none';";

	let iframeSrcdoc = $derived.by(() => {
		if (mode !== 'html') return '';
		const html = remoteLoaded
			? body.replace(/data-mb-src=/g, 'src=')
			: body;
		return `<!DOCTYPE html><html style="color-scheme:light"><head><meta charset="utf-8"><meta name="color-scheme" content="light"><base target="_blank" rel="noopener noreferrer"><meta http-equiv="Content-Security-Policy" content="${IFRAME_CSP}"></head><body style="margin:0;background:#fff;color:#111;font-family:system-ui,sans-serif;font-size:14px;">${html}</body></html>`;
	});

	function selectMode(m: RenderMode) {
		if (m === mode) return;
		remoteLoaded = false;
		onModeChange(m);
	}

	function loadRemoteContent() {
		remoteLoaded = true;
		// Task 5.3: persist decision so re-opening the message restores it.
		const settings = getSettings();
		const updated = [...new Set([...settings.remote_loaded_messages, message.id])];
		writeSetting('remote_loaded_messages', updated);
	}

	// Task 4.6: linkify plain text (escape-first then linkify http/https/mailto only).
	function linkify(text: string): string {
		// Text arrives pre-escaped from Svelte's {} binding, but we build raw HTML here,
		// so we must escape first then add anchor tags.
		const escaped = text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
		return escaped.replace(
			/(https?:\/\/[^\s<>"'()[\]{}]+|mailto:[^\s<>"'()[\]{}]+)/g,
			(url) => {
				const isMailto = url.startsWith('mailto:');
				const icon = isMailto ? '✉' : '↗';
				return `<a class="mb-link" href="${url}" target="_blank" rel="noopener noreferrer" title="Opens in a new window">${url}<span class="mb-link-icon">${icon}</span></a>`;
			}
		);
	}

	// Task 4.3: format=flowed unwrapping (soft line-break continuation).
	function unwrapFlowed(text: string): string {
		if (!format_flowed) return text;
		return text.replace(/ \n(?!>|\n)/g, ' ');
	}

	let textHtml = $derived.by(() => {
		if (mode === 'html') return '';
		const processed = unwrapFlowed(parts.main);
		return linkify(processed);
	});
</script>

<div class="mb-reader" data-testid="reader.container">
	<Breadcrumbs {account} {folder} {onHome} {onAccount} {onFolder}>
		{#snippet right()}
			<span class="count">reading</span>
			<span>·</span>
			<span class="mb-reader-counter" aria-label="Position in folder">
				<span
					class="num"
					title={`Message ${msgIndex} of ${total}`}
					data-testid="reader.counter-index">{msgIndex}</span><span class="sep">/</span><span
					class="num"
					title={`Page ${pageNum} of ${lastPage}`}
					data-testid="reader.counter-page">{pageNum}</span><span class="sep">/</span><span
					class="num"
					title={`${total} messages in ${folder.name}`}
					data-testid="reader.counter-total">{total}</span>
			</span>
			<span>·</span>
			<span><span class="kbd">esc</span> back</span>
		{/snippet}
	</Breadcrumbs>

	<div class="mb-reader-scroll mb-scroll" onscroll={handleScroll} bind:this={scrollEl}>
		<div class="mb-reader-head" class:is-compact={scrolled}>
			<div class="sub">
				<div class="sub-line">
					<span class="sub-text">
						{message.subject}
					</span>
					<span class="sub-icons">
						<!-- Task 4.2: mode toggle segmented control -->
						<span class="mode-toggle" role="group" aria-label="Rendering mode">
							<button
								type="button"
								class="mode-btn{mode === 'text' ? ' is-active' : ''}{!has_plain ? ' is-disabled' : ''}"
								onclick={() => selectMode('text')}
								disabled={!has_plain}
								title="Text mode — plain text"
								aria-pressed={mode === 'text'}
								data-testid="reader.mode-text"
							>Aa</button>
							<button
								type="button"
								class="mode-btn{mode === 'simple' ? ' is-active' : ''}{!has_html && !has_plain ? ' is-disabled' : ''}"
								onclick={() => selectMode('simple')}
								title="Simple mode — readable text from HTML"
								aria-pressed={mode === 'simple'}
								data-testid="reader.mode-simple"
							>≈</button>
							<button
								type="button"
								class="mode-btn{mode === 'html' ? ' is-active' : ''}{!has_html ? ' is-disabled' : ''}"
								onclick={() => selectMode('html')}
								disabled={!has_html}
								title="HTML mode — sandboxed iframe"
								aria-pressed={mode === 'html'}
								data-testid="reader.mode-html"
							>&lt;/&gt;</button>
						</span>

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
				{#if scrolled}
					<div class="meta-compact">{compactMeta}</div>
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
						<span class="meta-label">From</span> {message.from || message.addr}
					</div>
					<div><span class="meta-label">To</span>{"   "}{account.address}</div>
				{/if}
				<div>
					<span class="meta-label">Date</span>{"  "}
					{#if ago.label !== message.time.trim()}
						<time datetime={ago.iso} title={ago.iso}>{ago.label}</time>
					{:else}
						{ago.iso}
					{/if}
				</div>
			</div>
		</div>

		<Attachments messageId={message.id} items={attachments} />

		<!-- Task 5.1: remote content banner in HTML mode -->
		{#if mode === 'html' && has_remote > 0 && !remoteLoaded}
			<div class="mb-remote-banner" data-testid="reader.remote-banner">
				<span>This message has remote content.</span>
				<button
					type="button"
					class="mb-remote-load"
					onclick={loadRemoteContent}
					data-testid="reader.load-remote"
				>Load</button>
			</div>
		{/if}

		<div class="mb-reader-body" data-testid="reader-body-scroll" bind:this={bodyEl}>
			{#if mode === 'html'}
				<!-- Task 4.5: sandboxed srcdoc iframe, null origin, no scripts.
				     allow-popups + allow-popups-to-escape-sandbox lets links open in a real
				     browser tab; the opened tab is NOT sandboxed (no inherited restrictions). -->
				<iframe
					sandbox="allow-popups allow-popups-to-escape-sandbox"
					srcdoc={iframeSrcdoc}
					title="Email content"
					class="mb-reader-html-frame"
					data-testid="reader.html-iframe"
				></iframe>
			{:else}
				<!-- Task 4.3/4.4: text and simple modes rendered as escaped DOM text with linkify -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html textHtml}
				{#if parts.sig}
					{"\n"}<span class="mb-sig">{@html linkify(parts.sig)}</span>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.mb-reader-counter {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.mb-reader-counter .num {
		cursor: help;
	}
	.mb-reader-counter .sep {
		opacity: 0.4;
		margin: 0 2px;
	}

	.mode-toggle {
		display: inline-flex;
		border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
		border-radius: 4px;
		overflow: hidden;
		margin-right: 4px;
	}
	.mode-btn {
		background: none;
		border: none;
		border-right: 1px solid color-mix(in srgb, currentColor 15%, transparent);
		padding: 2px 7px;
		font-size: 11px;
		cursor: pointer;
		color: inherit;
		opacity: 0.55;
		font-family: inherit;
		line-height: 1.4;
	}
	.mode-btn:last-child {
		border-right: none;
	}
	.mode-btn.is-active {
		opacity: 1;
		background: color-mix(in srgb, currentColor 12%, transparent);
		font-weight: 600;
	}
	.mode-btn.is-disabled,
	.mode-btn:disabled {
		opacity: 0.25;
		cursor: not-allowed;
	}
	.mode-btn:hover:not(:disabled):not(.is-active) {
		opacity: 0.85;
		background: color-mix(in srgb, currentColor 6%, transparent);
	}

	.mb-remote-banner {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 14px;
		font-size: 12px;
		background: color-mix(in srgb, var(--mb-accent, #6366f1) 10%, transparent);
		border-bottom: 1px solid color-mix(in srgb, var(--mb-accent, #6366f1) 25%, transparent);
	}
	.mb-remote-load {
		background: none;
		border: 1px solid currentColor;
		border-radius: 3px;
		padding: 1px 8px;
		font-size: 11px;
		cursor: pointer;
		color: inherit;
		opacity: 0.8;
	}
	.mb-remote-load:hover {
		opacity: 1;
	}

	.mb-reader-html-frame {
		width: 100%;
		min-height: 300px;
		height: 600px;
		border: none;
		display: block;
	}

	:global(.mb-link) {
		color: var(--mb-accent, #6366f1);
		text-decoration: underline;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 2px;
		word-break: break-all;
	}
	:global(.mb-link:visited) {
		color: color-mix(in srgb, var(--mb-accent, #6366f1) 60%, #666);
	}
	:global(.mb-link:hover) {
		color: color-mix(in srgb, var(--mb-accent, #6366f1) 80%, #000);
		text-decoration: underline dotted;
	}
	:global(.mb-link-icon) {
		display: inline-block;
		font-size: 0.75em;
		opacity: 0.7;
		flex-shrink: 0;
		margin-left: 2px;
	}
</style>
