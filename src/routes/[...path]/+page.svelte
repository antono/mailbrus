<script lang="ts">
	import '../../app.css';
	import AccountPicker from '$lib/components/AccountPicker.svelte';
	import FolderPicker from '$lib/components/FolderPicker.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import MailList from '$lib/components/MailList.svelte';
	import Reader from '$lib/components/Reader.svelte';
	import Compose from '$lib/components/Compose.svelte';
	import About from '$lib/components/About.svelte';
	import KeyboardHelp from '$lib/components/KeyboardHelp.svelte';
	import HintBar from '$lib/components/HintBar.svelte';
	import SettingsPanel from '$lib/components/SettingsPanel.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { parsePath, buildFolderUrl, buildMessageUrl, buildSearchUrl } from '$lib/url.js';
	import {
		fetchMaildirs,
		fetchFolders,
		fetchMessages,
		searchMessages,
		fetchMessage,
		type Account,
		type Folder,
		type Message,
		type RenderMode,
	} from '$lib/api.js';
	import { loadSettings, getSettings, writeSetting, addSearchHistory, setLastFolder, setEmailMode, type UiPrefs, type EmailMode } from '$lib/settings.js';
	import { cacheMessages, getLocalMessages } from '$lib/message-cache.js';
	import { enqueue as outboxEnqueue, getOutbox, initOutboxFlusher, type OutboxEntry } from '$lib/outbox.js';
	import { enqueueMutation, initMutationsFlusher } from '$lib/mutations.js';
	import { recordVisit, getRanked } from '$lib/frecency.js';
	import { setBadge, clearBadge } from '$lib/badge.js';

	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
	}

	const FONT_STACKS: Record<string, string> = {
		sans: 'var(--font-sans)',
		mono: 'var(--font-mono)'
	};

	const FONT_SIZES: Record<string, string> = { xs: '11px', sm: '12px', md: '13px', lg: '15px' };
	const FONT_SIZE_SCALES: Record<string, number> = { xs: 0.85, sm: 0.925, md: 1, lg: 1.125 };

	// ── UI Preferences ────────────────────────────────────────────────────────
	let uiPrefs = $state<UiPrefs>({
		dark: false, accent: 'indigo', font: 'sans', fontSize: 'md', density: 'twoline', hintBar: true
	});
	let settingsOpen = $state(false);

	// Apply CSS vars whenever any ui pref changes (deep $state tracks property mutations)
	$effect(() => {
		const root = document.documentElement;
		root.classList.toggle('dark', !!uiPrefs.dark);
		root.setAttribute('data-accent', uiPrefs.accent || 'indigo');
		root.style.setProperty('--font-app', FONT_STACKS[uiPrefs.font] || FONT_STACKS.sans);
		root.style.setProperty('--font-size-app', FONT_SIZES[uiPrefs.fontSize] || FONT_SIZES.md);
		const scale = FONT_SIZE_SCALES[uiPrefs.fontSize] ?? 1;
		root.style.setProperty('--font-size-scale', String(scale));
	});

	// Persist to IDB whenever ui prefs change
	let _prefsLoaded = $state(false);
	$effect(() => {
		// read all fields to establish deps
		const snap = { ...uiPrefs };
		if (_prefsLoaded) writeSetting('ui_prefs', snap);
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
	let installPromptEvent = $state<Event | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);
	let showInstallButton = $state(false);
	let conflictNotice = $state(false);

	// ── API data ──────────────────────────────────────────────────────────────
	let accounts = $state<Account[]>([]);
	let folderList = $state<Folder[]>([]);
	let rankedFolderIds = $state<string[]>([]);
	let outboxEntries = $state<OutboxEntry[]>([]);
	let currentMessages = $state<Message[]>([]);
	let messageBody = $state('');
	let messageMode = $state<RenderMode>('text');
	let messageHasPlain = $state(false);
	let messageHasHtml = $state(false);
	let messageHasRemote = $state(0);
	let messageFormatFlowed = $state(false);
	let messageAttachments = $state<{ name: string; size: number; mime: string }[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// ── Pagination state ──────────────────────────────────────────────────────
	let currentPage = $state(1);
	let totalCount = $state(0);
	let currentPerPage = $state(25);
	let searchPage = $state(1);

	// ── URL-driven routing ────────────────────────────────────────────────────

	// $derived route descriptor — pure read from page.url, never writes history
	const routeDescriptor = $derived(parsePath(page.url));

	const NAV_OPTS = { noScroll: true, keepFocus: true };
	const REPLACE_OPTS = { ...NAV_OPTS, replaceState: true };

	// Nav helpers — the only place history is written; goto() updates page.url
	function navigateToFolder(folderId: string) {
		goto(buildFolderUrl(folderId), NAV_OPTS);
	}

	function openMessageRoute(folderId: string, messageId: string) {
		goto(buildMessageUrl(folderId, messageId), NAV_OPTS);
	}

	function closeReaderRoute(folderId: string) {
		goto(buildFolderUrl(folderId), NAV_OPTS);
	}

	function runSearchRoute(query: string) {
		goto(buildSearchUrl(query), NAV_OPTS);
	}

	function replaceRoute(url: string) {
		goto(url, REPLACE_OPTS);
	}

	function goBack() {
		history.back();
	}

	// Tracks what the reconciler last loaded to stay idempotent (plain vars, not $state)
	let _lastFolderId: string | null = null;
	let _lastMessageId: string | null = null;
	let _lastQuery: string | null = null;

	// Single reconciler: URL descriptor + account + accounts → app state.
	// These are reactive dependencies; all other state is read via untrack().
	$effect(() => {
		const { folderId, messageId, query } = routeDescriptor; // reactive: URL
		const acct = account; // reactive: account changes trigger re-run
		const accts = accounts; // reactive: enables auto-select when accounts load

		untrack(() => {
			// Search route
			if (query !== undefined) {
				if (!acct) {
					// Deep-link search without account — auto-select or show picker
					if (accts.length > 0) { onAccountPick(accts[0]); }
					else { phase = 'account'; }
					return;
				}
				if (query === _lastQuery && searchOpen) return;
				_lastQuery = query;
				_lastFolderId = null;
				_lastMessageId = null;
				searchOpen = true;
				searchQuery = query;
				openMessage = null;
				if (query) {
					searchPage = 1;
					loading = true;
					error = null;
					searchMessages(query, 1, currentPerPage)
						.then((data) => {
							currentMessages = data.messages;
							totalCount = data.count;
							searchPage = data.page;
							loading = false;
						})
						.catch((e: Error) => { error = e.message; loading = false; });
				}
				return;
			}

			// Folder or folder+message route
			if (folderId) {
				const folderChanged = folderId !== _lastFolderId;
				const messageChanged = messageId !== _lastMessageId;

				if (!folderChanged && !messageChanged) return;

				_lastQuery = null;
				searchOpen = false;
				searchQuery = '';

				const tryOpenMessage = (msgs: Message[]) => {
					if (!messageId || messageId === _lastMessageId) return;
					_lastMessageId = messageId;
					const msg = msgs.find((m) => m.id === messageId);
					if (msg) {
						openMessage = msg;
						selectedIdx = msgs.indexOf(msg);
					} else {
						// D7: message not in loaded list — fall back to folder URL
						replaceRoute(buildFolderUrl(folderId!));
						_lastMessageId = null;
					}
				};

				const resolveAndLoad = () => {
					const f = folderList.find((x) => x.id === folderId);
					if (!f) {
						replaceRoute('/');
						return;
					}
					if (folderChanged) {
						folder = f;
						_lastFolderId = folderId;
						selectedIdx = 0;
						currentPage = 1;
						if (acct) {
							if (messageId) {
								// Load messages then open the message once the list arrives
								loadMessages(acct.id, f.id, 1, tryOpenMessage);
							} else {
								loadMessages(acct.id, f.id, 1);
							}
						}
					} else if (messageId && messageId !== _lastMessageId) {
						// Same folder, new messageId — try from already-loaded list
						tryOpenMessage(currentMessages);
					} else if (!messageId && _lastMessageId) {
						_lastMessageId = null;
						openMessage = null;
					}
					if (phase !== 'list') phase = 'list';
				};

				if (folderList.length > 0) {
					resolveAndLoad();
				} else if (acct) {
					loading = true;
					fetchFolders(acct.id)
						.then((data) => {
							folderList = data;
							loading = false;
							getRanked('folders').then((ids) => { rankedFolderIds = ids; }).catch(() => {});
							resolveAndLoad();
						})
						.catch((e: Error) => { error = e.message; loading = false; });
				} else if (accts.length > 0) {
					// Deep link with no account selected — auto-select the only/first account
					// The reconciler will re-run when account is set (account is a reactive dep)
					onAccountPick(accts[0]);
				} else {
					// Accounts not yet loaded; they'll load soon and trigger onAccountPick
					// If still no account after load, show account picker
					phase = 'account';
				}
				return;
			}

			// Root path — clear any URL-driven state; leave account/folder picker phase alone
			_lastFolderId = null;
			_lastMessageId = null;
			_lastQuery = null;
			openMessage = null;
			searchOpen = false;
			searchQuery = '';
		});
	});

	// Load accounts and init PWA on mount
	$effect(() => {
		// Settings
		loadSettings().then((s) => {
			if (s.ui_prefs) Object.assign(uiPrefs, s.ui_prefs);
			_prefsLoaded = true;
			if (s.last_folder) { /* restored on folder navigation */ }
		});

		// Service Worker registration (task 2.2, 12.2)
		if ('serviceWorker' in navigator) {
			const debug = typeof localStorage !== 'undefined' && localStorage.getItem('mailbrus:debug') === 'true';
			navigator.serviceWorker
				.register(`/sw.js${debug ? '?debug=1' : ''}`, { updateViaCache: 'none' })
				.catch(() => {});
		}

		// Install prompt capture (task 1.6)
		const onBeforeInstall = (e: Event) => {
			e.preventDefault();
			installPromptEvent = e;
			// hide if already standalone (task 1.7)
			if (!window.matchMedia('(display-mode: standalone)').matches) {
				showInstallButton = true;
			}
		};
		window.addEventListener('beforeinstallprompt', onBeforeInstall);

		// Outbox + mutations fallback flushers (task 7.4, 8.8)
		initOutboxFlusher();
		initMutationsFlusher();

		// Load outbox entries and refresh on updates (task 7.5)
		const refreshOutbox = () => getOutbox().then((e) => (outboxEntries = e)).catch(() => {});
		refreshOutbox();
		window.addEventListener('outbox-updated', refreshOutbox);

		// Conflict notice (task 8.7)
		const onConflict = () => { conflictNotice = true; setTimeout(() => (conflictNotice = false), 5000); };
		window.addEventListener('mutations-conflict', onConflict);

		// Badge: watch unread count (task 11.2-11.3)
		const updateBadge = () => {
			const unread = accounts.reduce((n, a) => n + (a.unread ?? 0), 0);
			if (unread > 0) setBadge(unread); else clearBadge();
		};
		const badgeTimer = setInterval(updateBadge, 10_000);

		loading = true;
		error = null;
		fetchMaildirs()
			.then((data) => { accounts = data; loading = false; updateBadge(); })
			.catch((e: Error) => { error = e.message; loading = false; });

		return () => {
			window.removeEventListener('beforeinstallprompt', onBeforeInstall);
			window.removeEventListener('mutations-conflict', onConflict);
			window.removeEventListener('outbox-updated', refreshOutbox);
			clearInterval(badgeTimer);
		};
	});

	// Task 6.3: resolve initial mode from settings when a message is opened
	$effect(() => {
		if (!openMessage) {
			messageBody = '';
			messageMode = 'text';
			messageHasPlain = false;
			messageHasHtml = false;
			messageHasRemote = 0;
			messageFormatFlowed = false;
			messageAttachments = [];
			return;
		}
		const id = openMessage.id;
		// HTML mode is per-message only; only text/simple are restored from settings.
		const stored = getSettings().email_mode;
		const preferredMode = stored === 'text' || stored === 'simple' ? stored : undefined;
		fetchMessage(id, preferredMode)
			.then((data) => {
				messageBody = data.body;
				messageMode = data.mode;
				messageHasPlain = data.has_plain;
				messageHasHtml = data.has_html;
				messageHasRemote = data.has_remote;
				messageFormatFlowed = data.format_flowed;
				messageAttachments = data.attachments ?? [];
			})
			.catch(() => { messageBody = ''; messageMode = 'text'; });
	});

	// Task 6.3: re-fetch when user switches modes
	function handleModeChange(newMode: RenderMode) {
		if (!openMessage) return;
		fetchMessage(openMessage.id, newMode)
			.then((data) => {
				messageBody = data.body;
				messageMode = data.mode;
				messageHasPlain = data.has_plain;
				messageHasHtml = data.has_html;
				messageHasRemote = data.has_remote;
				messageFormatFlowed = data.format_flowed;
				messageAttachments = data.attachments ?? [];
			})
			.catch(() => {});
		// HTML mode is per-message only — never persisted as global default.
		if (newMode === 'text' || newMode === 'simple') {
			setEmailMode(newMode as EmailMode);
		}
	}

	// ── Helpers ───────────────────────────────────────────────────────────────
	function goToFolder(fId: string) {
		if (!account) return;
		navigateToFolder(fId);
	}

	async function loadMessages(
		accountId: string,
		folderId: string,
		page = 1,
		onLoaded?: (msgs: import('$lib/api.js').Message[]) => void
	) {
		loading = true;
		error = null;
		// task 6.2: render from IDB immediately, then update from network
		const local = await getLocalMessages(folderId).catch(() => []);
		if (local.length && page === 1) { currentMessages = local; loading = false; }
		fetchMessages(accountId, folderId, page, currentPerPage)
			.then((data) => {
				currentMessages = data.messages;
				currentPage = data.page;
				currentPerPage = data.per_page;
				totalCount = data.count;
				loading = false;
				onLoaded?.(data.messages);
				// task 6.1: upsert into IDB after successful fetch (page 1 only)
				if (page === 1) cacheMessages(folderId, data.messages).catch(() => {});
			})
			.catch((e: Error) => { if (!local.length) error = e.message; loading = false; });
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
			case 'toggle-dark': { uiPrefs.dark = !uiPrefs.dark; break; }
			case 'open-settings': settingsOpen = true; break;
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
				if (account && folder) { clearLeader(); cmdOpen = !cmdOpen; }
				return;
			}
			// ⌘, / Ctrl+, — open settings
			if ((e.metaKey || e.ctrlKey) && e.key === ',') {
				e.preventDefault();
				settingsOpen = true;
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
				if (e.key === 'Escape') {
					e.preventDefault();
					if (folder) closeReaderRoute(folder.id); else goBack();
					return;
				}
				if (e.key === 'j' || e.key === 'ArrowDown') {
					e.preventDefault();
					const next = Math.min(selectedIdx + 1, currentMessages.length - 1);
					selectedIdx = next;
					const nextMsg = currentMessages[next];
					if (nextMsg && folder) openMessageRoute(folder.id, nextMsg.id);
					return;
				}
				if (e.key === 'k' || e.key === 'ArrowUp') {
					e.preventDefault();
					const next = Math.max(selectedIdx - 1, 0);
					selectedIdx = next;
					const prevMsg = currentMessages[next];
					if (prevMsg && folder) openMessageRoute(folder.id, prevMsg.id);
					return;
				}
				if (leader === 'g' && e.key === 'g') {
					e.preventDefault();
					clearLeader();
					document.querySelector('[data-testid="reader-body-scroll"]')?.scrollTo({ top: 0 });
					return;
				}
				if (e.key === 'g' && !leader) { e.preventDefault(); startLeader('g'); return; }
				if (e.key === 'G') {
					e.preventDefault();
					const el = document.querySelector<HTMLElement>('[data-testid="reader-body-scroll"]');
					el?.scrollTo({ top: el.scrollHeight });
					return;
				}
				if (leader) clearLeader();
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
				if (e.key === 'g') { e.preventDefault(); clearLeader(); selectedIdx = 0; listEl?.scrollTo({ top: 0 }); return; }
				clearLeader();
				return;
			}
			if (e.key === 'g') { e.preventDefault(); startLeader('g'); return; }
			if (e.key === 'G') { e.preventDefault(); selectedIdx = currentMessages.length - 1; listEl?.scrollTo({ top: listEl.scrollHeight }); return; }
			if (e.key === 'h' && !leader && currentPage > 1) { e.preventDefault(); handleListPageChange(currentPage - 1); return; }
			if (e.key === 'l' && !leader && currentMessages.length >= currentPerPage) { e.preventDefault(); handleListPageChange(currentPage + 1); return; }
			if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !leader) {
				e.preventDefault(); clearLeader(); composeOpen = true; return;
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
				const msg = currentMessages[selectedIdx];
				if (msg && folder) openMessageRoute(folder.id, msg.id);
				return;
			}
			// task 8.2: mark read (r), mark unread (u), delete (d/#)
			if ((e.key === 'r' || e.key === 'u') && folder) {
				e.preventDefault();
				const msg = currentMessages[selectedIdx];
				if (msg) {
					const op = e.key === 'u' ? 'mark_unread' : 'mark_read';
					enqueueMutation(op, msg.id, folder.id).catch(() => {});
					// optimistic local update
					currentMessages = currentMessages.map((m, i) =>
						i === selectedIdx ? { ...m, unread: op === 'mark_unread' } : m
					);
				}
				return;
			}
			if ((e.key === 'd' || e.key === '#') && folder) {
				e.preventDefault();
				const msg = currentMessages[selectedIdx];
				if (msg) {
					enqueueMutation('delete', msg.id, folder.id).catch(() => {});
					currentMessages = currentMessages.filter((_, i) => i !== selectedIdx);
					selectedIdx = Math.min(selectedIdx, currentMessages.length - 1);
				}
				return;
			}
			if (e.key === '/') { e.preventDefault(); searchOpen = true; return; }
			if (e.key === 'Escape') {
				e.preventDefault();
				if (searchOpen) { handleSearchClose(); return; }
				clearLeader();
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
		rankedFolderIds = [];
		currentMessages = [];
		phase = 'folder';
		loading = true;
		error = null;
		fetchFolders(a.id)
			.then((data) => {
				folderList = data;
				loading = false;
				// task 9.4: load frecency order for folder picker
				getRanked('folders').then((ids) => { rankedFolderIds = ids; }).catch(() => {});
			})
			.catch((e: Error) => { error = e.message; loading = false; });
	}

	function onFolderPick(f: Folder) {
		// task 5.5: persist last folder; task 9.3: record frecency
		setLastFolder(f.id).catch(() => {});
		recordVisit('folders', f.id).catch(() => {});
		navigateToFolder(f.id);
	}

	function handleSearchSubmit() {
		if (!searchQuery.trim()) return;
		// task 5.7 + 9.7: record search history and frecency
		addSearchHistory(searchQuery).catch(() => {});
		recordVisit('searches', searchQuery).catch(() => {});
		runSearchRoute(searchQuery);
	}

	function handleSearchQueryChange(q: string) {
		searchQuery = q;
		// replace for in-place edits so history isn't polluted (task 4.5)
		replaceRoute(buildSearchUrl(q));
	}

	function handleListPageChange(page: number) {
		if (!account || !folder) return;
		loadMessages(account.id, folder.id, page);
	}

	function handleSearchPageChange(page: number) {
		searchPage = page;
		loading = true;
		error = null;
		searchMessages(searchQuery, searchPage, currentPerPage)
			.then((data) => {
				currentMessages = data.messages;
				totalCount = data.count;
				loading = false;
			})
			.catch((e: Error) => { error = e.message; loading = false; });
	}

	function handleSearchClose() {
		if (folder) {
			navigateToFolder(folder.id);
		} else {
			replaceRoute('/');
		}
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
			{outboxEntries}
			density={uiPrefs.density}
			{selectedIdx}
			onSelectIdx={(i) => (selectedIdx = i)}
			{searchOpen}
			{searchQuery}
			onSearchChange={handleSearchQueryChange}
			onSearchSubmit={handleSearchSubmit}
			onSearchClose={handleSearchClose}
			onOpen={(m) => { if (folder) openMessageRoute(folder.id, m.id); }}
			onHome={() => (aboutOpen = true)}
			onAccount={() => (phase = 'account')}
			onFolder={() => (phase = 'folder')}
			page={searchOpen ? searchPage : currentPage}
			perPage={currentPerPage}
			count={totalCount}
			onPageChange={searchOpen ? handleSearchPageChange : handleListPageChange}
			bind:listEl
		/>
	{/if}

	{#if phase === 'list' && uiPrefs.hintBar && !openMessage}
		<HintBar onShowHelp={() => (helpOpen = true)}>
			<span class="hint"><span class="kbd">j</span><span class="kbd">k</span> move</span>
			<span class="hint"><span class="kbd">↵</span> open</span>
			<span class="hint"><span class="kbd">esc</span> back</span>
			<span class="hint"><span class="kbd">/</span> search</span>
			<span class="hint"><span class="kbd">c</span> compose</span>
			<span class="hint"><span class="kbd">g</span><span class="kbd">i</span> inbox</span>
			<span class="hint"><span class="kbd">g</span><span class="kbd">a</span> archive</span>
			<span class="hint"><span class="kbd">r</span> read</span>
			<span class="hint"><span class="kbd">u</span> unread</span>
			<span class="hint"><span class="kbd">d</span> delete</span>
			<span class="hint"><span class="kbd">h</span> prev-page</span>
			<span class="hint"><span class="kbd">l</span> next-page</span>
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
			mode={messageMode}
			has_plain={messageHasPlain}
			has_html={messageHasHtml}
			has_remote={messageHasRemote}
			format_flowed={messageFormatFlowed}
			attachments={messageAttachments}
			onClose={() => { if (folder) closeReaderRoute(folder.id); else goBack(); }}
			onHome={() => (aboutOpen = true)}
			onAccount={() => (phase = 'account')}
			onFolder={() => { openMessage = null; phase = 'folder'; }}
			onModeChange={handleModeChange}
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
			onSent={async (draft) => {
				// task 7.2: try network, fall back to outbox on failure
				try {
					const res = await fetch('/api/send', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(draft)
					});
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					composeOpen = false;
				} catch {
					await outboxEnqueue(draft as Record<string, unknown>);
					composeOpen = false;
				}
			}}
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
			rankedIds={rankedFolderIds}
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
			<span class="key">g</span> — i inbox · a archive · s sent · d drafts · f folder · A account · g top · h prev-page · l next-page
		</div>
	{/if}

	{#if showInstallButton}
		<button
			class="mb-install-btn"
			onclick={() => {
				(installPromptEvent as BeforeInstallPromptEvent)?.prompt?.();
				showInstallButton = false;
			}}
		>Install Mailbrus</button>
	{/if}

	{#if conflictNotice}
		<div class="mb-conflict-notice" role="alert">Some changes could not be applied.</div>
	{/if}

	{#if loading}
		<div class="mb-loading" aria-live="polite">loading…</div>
	{/if}

	<SettingsPanel
		bind:open={settingsOpen}
		{uiPrefs}
		onPrefChange={(k, v) => { uiPrefs[k] = v; }}
	/>
</div>
