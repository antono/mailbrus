<script lang="ts">
	import '../app.css';
	import AccountPicker from '$lib/components/AccountPicker.svelte';
	import FolderPicker from '$lib/components/FolderPicker.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import MailList from '$lib/components/MailList.svelte';
	import Reader from '$lib/components/Reader.svelte';
	import Compose from '$lib/components/Compose.svelte';
	import About from '$lib/components/About.svelte';
	import KeyboardHelp from '$lib/components/KeyboardHelp.svelte';
	import HintBar from '$lib/components/HintBar.svelte';
	import TweaksPanel, { type Tweaks } from '$lib/components/TweaksPanel.svelte';
	import {
		fetchMaildirs,
		fetchFolders,
		fetchMessages,
		searchMessages,
		fetchMessage,
		type Account,
		type Folder,
		type Message
	} from '$lib/api.js';

	const FONT_STACKS: Record<string, string> = {
		sans: 'var(--font-sans)',
		mono: 'var(--font-mono)',
		serif: '"Iowan Old Style", "Charter", "Iowan", Georgia, "Times New Roman", serif'
	};

	// ── Tweaks ────────────────────────────────────────────────────────────────
	let tweaks = $state<Tweaks>({
		dark: false, accent: 'indigo', font: 'sans', density: 'twoline', hintBar: true
	});

	$effect(() => {
		const root = document.documentElement;
		root.classList.toggle('dark', !!tweaks.dark);
		root.setAttribute('data-accent', tweaks.accent || 'indigo');
		root.style.setProperty('--font-app', FONT_STACKS[tweaks.font] || FONT_STACKS.sans);
	});

	// ── State machine ─────────────────────────────────────────────────────────
	let phase = $state<'account' | 'folder' | 'list'>('account');
	let account = $state<Account | null>(null);
	let folder = $state<Folder | null>(null);
	let selectedIdx = $state(0);
	let openMessage = $state<Message | null>(null);
	let cmdOpen = $state(false);
	let composeOpen = $state(false);
	let helpOpen = $state(false);
	let aboutOpen = $state(false);
	let searchOpen = $state(false);
	let searchQuery = $state('');
	let leader = $state<string | null>(null);
	let leaderTimer: ReturnType<typeof setTimeout> | null = null;

	// ── API data ──────────────────────────────────────────────────────────────
	let accounts = $state<Account[]>([]);
	let folderList = $state<Folder[]>([]);
	let currentMessages = $state<Message[]>([]);
	let messageBody = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Load accounts on mount
	$effect(() => {
		loading = true;
		error = null;
		fetchMaildirs()
			.then((data) => { accounts = data; loading = false; })
			.catch((e: Error) => { error = e.message; loading = false; });
	});

	// Fetch message body when a message is opened
	$effect(() => {
		if (!openMessage) { messageBody = ''; return; }
		const id = openMessage.id;
		fetchMessage(id)
			.then((data) => { messageBody = data.body; })
			.catch(() => { messageBody = ''; });
	});

	// ── Helpers ───────────────────────────────────────────────────────────────
	function goToFolder(fId: string) {
		if (!account) return;
		const f = folderList.find((x) => x.id === fId);
		if (f) {
			folder = f;
			selectedIdx = 0;
			searchOpen = false;
			searchQuery = '';
			openMessage = null;
			phase = 'list';
			loadMessages(account.id, f.id);
		}
	}

	function loadMessages(accountId: string, folderId: string) {
		loading = true;
		error = null;
		fetchMessages(accountId, folderId)
			.then((data) => { currentMessages = data.messages; loading = false; })
			.catch((e: Error) => { error = e.message; loading = false; });
	}

	function startLeader(key: string) {
		leader = key;
		if (leaderTimer) clearTimeout(leaderTimer);
		leaderTimer = setTimeout(() => (leader = null), 1200);
	}

	function clearLeader() {
		leader = null;
		if (leaderTimer) clearTimeout(leaderTimer);
	}

	// ── Command palette ───────────────────────────────────────────────────────
	function handleCommand(cmd: string) {
		cmdOpen = false;
		switch (cmd) {
			case 'switch-account': phase = 'account'; break;
			case 'switch-folder': phase = 'folder'; break;
			case 'go-inbox': goToFolder('inbox'); break;
			case 'go-archive': goToFolder('archive'); break;
			case 'compose': composeOpen = true; break;
			case 'keyboard-help': helpOpen = true; break;
			case 'about': aboutOpen = true; break;
			case 'search': searchOpen = true; break;
			case 'toggle-dark': tweaks = { ...tweaks, dark: !tweaks.dark }; break;
		}
	}

	// ── Keyboard handler ──────────────────────────────────────────────────────
	$effect(() => {
		const isTyping = (e: KeyboardEvent) => {
			const tag = ((e.target as HTMLElement).tagName || '').toLowerCase();
			return tag === 'input' || tag === 'textarea' || (e.target as HTMLElement).isContentEditable;
		};

		const onKey = (e: KeyboardEvent) => {
			// ⌘K / Ctrl+K
			if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
				e.preventDefault();
				if (account && folder) cmdOpen = !cmdOpen;
				return;
			}
			// ? keyboard help
			if (e.key === '?' && !isTyping(e) && !cmdOpen && !composeOpen && phase === 'list') {
				e.preventDefault();
				helpOpen = !helpOpen;
				return;
			}
			// modals own keyboard
			if (phase !== 'list' || cmdOpen || composeOpen || helpOpen || aboutOpen) return;
			// reader open
			if (openMessage) {
				if (e.key === 'Escape') { e.preventDefault(); openMessage = null; }
				if (e.key === 'j' || e.key === 'ArrowDown') {
					e.preventDefault();
					const next = Math.min(selectedIdx + 1, currentMessages.length - 1);
					selectedIdx = next;
					openMessage = currentMessages[next] || null;
				}
				if (e.key === 'k' || e.key === 'ArrowUp') {
					e.preventDefault();
					const next = Math.max(selectedIdx - 1, 0);
					selectedIdx = next;
					openMessage = currentMessages[next] || null;
				}
				return;
			}
			if (isTyping(e)) return;
			// g-leader
			if (leader === 'g') {
				if (e.key === 'i') { e.preventDefault(); clearLeader(); goToFolder('inbox'); return; }
				if (e.key === 'a') { e.preventDefault(); clearLeader(); goToFolder('archive'); return; }
				if (e.key === 'A') { e.preventDefault(); clearLeader(); phase = 'account'; return; }
				if (e.key === 'f') { e.preventDefault(); clearLeader(); phase = 'folder'; return; }
				if (e.key === 'd') { e.preventDefault(); clearLeader(); goToFolder('drafts'); return; }
				if (e.key === 's') { e.preventDefault(); clearLeader(); goToFolder('sent'); return; }
				if (e.key === 'g') { e.preventDefault(); clearLeader(); selectedIdx = 0; return; }
				clearLeader();
				return;
			}
			if (e.key === 'g') { e.preventDefault(); startLeader('g'); return; }
			if (e.key === 'G') { e.preventDefault(); selectedIdx = currentMessages.length - 1; return; }
			if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !leader) {
				e.preventDefault(); composeOpen = true; return;
			}
			if (e.key === 'j' || e.key === 'ArrowDown') {
				e.preventDefault();
				selectedIdx = Math.min(selectedIdx + 1, currentMessages.length - 1);
				return;
			}
			if (e.key === 'k' || e.key === 'ArrowUp') {
				e.preventDefault();
				selectedIdx = Math.max(selectedIdx - 1, 0);
				return;
			}
			if (e.key === 'Enter') {
				e.preventDefault();
				if (currentMessages[selectedIdx]) openMessage = currentMessages[selectedIdx];
				return;
			}
			if (e.key === '/') { e.preventDefault(); searchOpen = true; return; }
			if (e.key === 'Escape') {
				e.preventDefault();
				if (searchOpen) { searchOpen = false; searchQuery = ''; return; }
				phase = 'folder';
				return;
			}
		};

		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	function onAccountPick(a: Account) {
		account = a;
		folder = null;
		folderList = [];
		currentMessages = [];
		phase = 'folder';
		loading = true;
		error = null;
		fetchFolders(a.id)
			.then((data) => { folderList = data; loading = false; })
			.catch((e: Error) => { error = e.message; loading = false; });
	}

	function onFolderPick(f: Folder) {
		folder = f;
		selectedIdx = 0;
		searchOpen = false;
		searchQuery = '';
		phase = 'list';
		if (account) loadMessages(account.id, f.id);
	}

	function handleSearchSubmit() {
		if (!searchQuery.trim()) return;
		loading = true;
		error = null;
		searchMessages(searchQuery)
			.then((data) => { currentMessages = data.messages; loading = false; })
			.catch((e: Error) => { error = e.message; loading = false; });
	}

	function handleSearchClose() {
		searchOpen = false;
		searchQuery = '';
		if (account && folder) loadMessages(account.id, folder.id);
	}
</script>

<div class="mb-app" data-screen-label="Mailbrus">
	{#if error}
		<div class="mb-error" role="alert">{error}</div>
	{/if}

	{#if account && folder}
		<MailList
			{account}
			{folder}
			messages={currentMessages}
			density={tweaks.density}
			{selectedIdx}
			onSelectIdx={(i) => (selectedIdx = i)}
			{searchOpen}
			{searchQuery}
			onSearchChange={(q) => (searchQuery = q)}
			onSearchSubmit={handleSearchSubmit}
			onSearchClose={handleSearchClose}
			onOpen={(m) => (openMessage = m)}
			onHome={() => (aboutOpen = true)}
			onAccount={() => (phase = 'account')}
			onFolder={() => (phase = 'folder')}
		/>
	{/if}

	{#if phase === 'list' && tweaks.hintBar && !openMessage}
		<HintBar onShowHelp={() => (helpOpen = true)}>
			<span class="hint"><span class="kbd">j</span><span class="kbd">k</span> move</span>
			<span class="hint"><span class="kbd">↵</span> open</span>
			<span class="hint"><span class="kbd">esc</span> back</span>
			<span class="hint"><span class="kbd">/</span> search</span>
			<span class="hint"><span class="kbd">c</span> compose</span>
			<span class="hint"><span class="kbd">g</span><span class="kbd">i</span> inbox</span>
			<span class="hint"><span class="kbd">g</span><span class="kbd">a</span> archive</span>
			<span class="hint"><span class="kbd">g</span><span class="kbd">f</span> folder</span>
			<span class="hint"><span class="kbd">g</span><span class="kbd" style="text-transform: none">A</span> account</span>
		</HintBar>
	{/if}

	{#if openMessage && account && folder}
		<Reader
			message={openMessage}
			{account}
			{folder}
			body={messageBody}
			onClose={() => (openMessage = null)}
			onHome={() => (aboutOpen = true)}
			onAccount={() => { openMessage = null; phase = 'account'; }}
			onFolder={() => { openMessage = null; phase = 'folder'; }}
		/>
	{/if}

	{#if aboutOpen}
		<About onClose={() => (aboutOpen = false)} />
	{/if}

	{#if helpOpen}
		<KeyboardHelp onClose={() => (helpOpen = false)} />
	{/if}

	{#if composeOpen && account && folder}
		<Compose
			{account}
			{folder}
			onClose={() => (composeOpen = false)}
			onSent={() => (composeOpen = false)}
			onHome={() => (aboutOpen = true)}
			onAccount={() => { composeOpen = false; phase = 'account'; }}
			onFolder={() => { composeOpen = false; phase = 'folder'; }}
		/>
	{/if}

	{#if phase === 'account'}
		<AccountPicker
			{accounts}
			returning={!!account}
			onSelect={onAccountPick}
			onCancel={() => { if (account && folder) phase = 'list'; }}
		/>
	{/if}

	{#if phase === 'folder' && account}
		<FolderPicker
			{account}
			folders={folderList}
			onSelect={onFolderPick}
			onCancel={() => { if (folder) phase = 'list'; else phase = 'account'; }}
		/>
	{/if}

	{#if cmdOpen && account && folder}
		<CommandPalette
			{account}
			{folder}
			onAction={handleCommand}
			onCancel={() => (cmdOpen = false)}
		/>
	{/if}

	{#if leader === 'g' && phase === 'list'}
		<div class="mb-leader">
			<span class="key">g</span> — i inbox · a archive · s sent · d drafts · f folder · A account · g top
		</div>
	{/if}

	{#if loading}
		<div class="mb-loading" aria-live="polite">loading…</div>
	{/if}

	<TweaksPanel onTweakChange={(t) => (tweaks = t)} />
</div>
