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
	import HintOverlay from '$lib/components/HintOverlay.svelte';
	import SettingsPanel from '$lib/components/SettingsPanel.svelte';
	import { assignLabels, type HintTarget } from '$lib/hints.js';
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
	import { requestSync } from '$lib/syncState.svelte.ts';
	import { loadSettings, getSettings, writeSetting, addSearchHistory, setLastFolder, setEmailMode, getSenderEmailMode, setSenderEmailMode, type UiPrefs, type EmailMode } from '$lib/settings.js';
	import { cacheMessages, getLocalMessages } from '$lib/message-cache.js';
	import { enqueue as outboxEnqueue, getOutbox, initOutboxFlusher, type OutboxEntry } from '$lib/outbox.js';
	import { enqueueMutation, initMutationsFlusher } from '$lib/mutations.js';
	import { recordVisit, getRanked } from '$lib/frecency.js';
	import { setBadge, clearBadge } from '$lib/badge.js';
	import { ui } from '$lib/ui-state.svelte.ts';
	import { registerKeymap } from '$lib/hotkeys/registry.svelte.ts';
	import { createListKeymap } from '$lib/hotkeys/keymaps/list.ts';
	import { leaderKey } from '$lib/hotkeys/dispatcher.svelte.ts';

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
	let attachmentAction = $state<'open' | 'download'>('open');

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
	let searchOpen = $state(false);
	let searchQuery = $state('');
	let installPromptEvent = $state<Event | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);
	let readerBodyEl = $state<HTMLDivElement | null>(null);
	let showInstallButton = $state(false);
	let conflictNotice = $state(false);

	// Vimium-style hint mode (list and reader)
	let hintMode = $state(false);
	let hintTargets = $state<HintTarget[]>([]);

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
					// Deep link to a folder with no account selected — select it silently
					// (account is a reactive dep, so the reconciler re-runs, fetches folders,
					// and loads this folder). Do NOT use onAccountPick here: it opens the
					// folder picker and nulls `folder`, which would flash an empty screen on
					// a cold deep-link until a manual reload.
					account = accts[0];
					folderList = [];
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
			if (s.attachment_action) attachmentAction = s.attachment_action;
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
		const settings = getSettings();
		// Resolve mode: per-sender override → global default → undefined (auto-detect)
		const senderOverride = openMessage.from ? getSenderEmailMode(openMessage.from) : null;
		const globalMode = settings.email_mode === 'text' || settings.email_mode === 'simple' ? settings.email_mode : undefined;
		const preferredMode: import('$lib/api.js').RenderMode | undefined = senderOverride ?? globalMode ?? undefined;
		fetchMessage(id, preferredMode)
			.then((data) => {
				messageBody = data.body;
				messageMode = data.mode;
				messageHasPlain = data.has_plain;
				messageHasHtml = data.has_html;
				messageHasRemote = data.has_remote;
				messageFormatFlowed = data.format_flowed;
				messageAttachments = data.attachments ?? [];
				// Plain-text-first default: no per-sender or global preference and the
				// message has a text/plain part → prefer text mode over server default.
				if (data.has_plain && data.mode !== 'text' && !senderOverride && !globalMode) {
					fetchMessage(id, 'text')
						.then((d2) => {
							messageBody = d2.body;
							messageMode = d2.mode;
							messageHasPlain = d2.has_plain;
							messageHasHtml = d2.has_html;
							messageHasRemote = d2.has_remote;
							messageFormatFlowed = d2.format_flowed;
							messageAttachments = d2.attachments ?? [];
						})
						.catch(() => {});
				}
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
			// Persist per-sender override so next open of same sender restores mode.
			if (openMessage.from) {
				setSenderEmailMode(openMessage.from, newMode as EmailMode).catch(() => {});
			}
		}
	}

	// ── Helpers ───────────────────────────────────────────────────────────────
	function goToFolder(fId: string) {
		if (!account) return;
		navigateToFolder(fId);
	}

	/** Resolve a canonical name (e.g. "inbox") to whatever the server actually
	 * returned for the folder ID. Real folder IDs come from the maildir directory
	 * names, which are commonly capitalized ("Inbox", "Archive", …); doing a case-
	 * insensitive match against `folderList` keeps the `g i` / `g a` / `g s` / `g d`
	 * shortcuts working regardless of casing. Returns null if no folder matches. */
	function resolveFolderId(canonical: string): string | null {
		const needle = canonical.toLowerCase();
		const hit = folderList.find(
			(f) => f.id.toLowerCase() === needle || f.name.toLowerCase() === needle
		);
		return hit ? hit.id : null;
	}

	function goCanonical(canonical: string) {
		const id = resolveFolderId(canonical);
		if (id) goToFolder(id);
	}

	async function loadMessages(
		accountId: string,
		folderId: string,
		page = 1,
		onLoaded?: (msgs: import('$lib/api.js').Message[]) => void
	) {
		loading = true;
		error = null;
		// task 6.2: render from IDB immediately as an optimisation — but NEVER gate the
		// network fetch on it. A stalled/blocked IndexedDB open (first-launch SW
		// contention, a pending versionchange, slow disk) would otherwise leave the
		// message list empty and stuck on "loading…" until a manual reload. Fire the
		// network request immediately and let the cache read race it.
		let networkSettled = false;
		if (page === 1) {
			getLocalMessages(folderId)
				.then((local) => {
					if (!networkSettled && local.length) { currentMessages = local; loading = false; }
				})
				.catch(() => {});
		}
		fetchMessages(accountId, folderId, page, currentPerPage)
			.then((data) => {
				networkSettled = true;
				currentMessages = data.messages;
				currentPage = data.page;
				currentPerPage = data.per_page;
				totalCount = data.count;
				loading = false;
				onLoaded?.(data.messages);
				// task 6.1: upsert into IDB after successful fetch (page 1 only)
				if (page === 1) cacheMessages(folderId, data.messages).catch(() => {});
			})
			.catch((e: Error) => {
				networkSettled = true;
				// Only surface the error if nothing is on screen (the cache may have populated).
				if (currentMessages.length === 0) error = e.message;
				loading = false;
			});
	}

	// ── Command palette ───────────────────────────────────────────────────────
	function handleCommand(cmd: string) {
		ui.cmdOpen = false;
		switch (cmd) {
			case 'switch-account': phase = 'account'; break;
			case 'switch-folder': phase = 'folder'; break;
			case 'go-inbox': goCanonical('inbox'); break;
			case 'go-archive': goCanonical('archive'); break;
			case 'compose': ui.composeOpen = true; break;
			case 'sync-mail': void requestSync().catch((e) => console.error('sync failed', e)); break;
			case 'keyboard-help': ui.helpOpen = true; break;
			case 'about': ui.aboutOpen = true; break;
			case 'search': searchOpen = true; break;
			case 'toggle-dark': { uiPrefs.dark = !uiPrefs.dark; break; }
			case 'open-settings': ui.settingsOpen = true; break;
		}
	}

	// Gate Global Ctrl+K behind having an active account+folder.
	$effect(() => { ui.canTogglePalette = !!(account && folder); });

	// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md — list keymap registration.
	// Register the list keymap whenever the list phase is shown. It must stay
	// registered even while an overlay (reader / modal / compose / hint / palette)
	// is open: per-scope isolation already prevents list bindings from firing
	// (only the active scope — the top of the stack — dispatches, and every
	// overlay pushes its own scope). Gating registration on the overlay flags
	// would unregister the list keymap, which also breaks the keyboard-help
	// dialog's introspection of the scope beneath an open modal.
	$effect(() => {
		if (phase !== 'list') return;
		const km = createListKeymap({
			selectNext: () => {
				selectedIdx = Math.min(selectedIdx + 1, currentMessages.length - 1);
			},
			selectPrev: () => {
				selectedIdx = Math.max(selectedIdx - 1, 0);
			},
			openSelected: () => {
				const msg = currentMessages[selectedIdx];
				if (msg && folder) openMessageRoute(folder.id, msg.id);
			},
			jumpTop: () => {
				selectedIdx = 0;
				listEl?.scrollTo({ top: 0 });
			},
			jumpBottom: () => {
				selectedIdx = currentMessages.length - 1;
				if (listEl) listEl.scrollTo({ top: listEl.scrollHeight });
			},
			prevPage: () => handleListPageChange(currentPage - 1),
			nextPage: () => handleListPageChange(currentPage + 1),
			canPrevPage: () => currentPage > 1,
			canNextPage: () => currentMessages.length >= currentPerPage,
			openSearch: () => {
				searchOpen = true;
			},
			openCompose: () => {
				ui.composeOpen = true;
			},
			markRead: () => {
				if (!folder) return;
				const msg = currentMessages[selectedIdx];
				if (!msg) return;
				enqueueMutation('mark_read', msg.id, folder.id).catch(() => {});
				currentMessages = currentMessages.map((m, i) =>
					i === selectedIdx ? { ...m, unread: false } : m
				);
			},
			markUnread: () => {
				if (!folder) return;
				const msg = currentMessages[selectedIdx];
				if (!msg) return;
				enqueueMutation('mark_unread', msg.id, folder.id).catch(() => {});
				currentMessages = currentMessages.map((m, i) =>
					i === selectedIdx ? { ...m, unread: true } : m
				);
			},
			deleteSelected: () => {
				if (!folder) return;
				const msg = currentMessages[selectedIdx];
				if (!msg) return;
				enqueueMutation('delete', msg.id, folder.id).catch(() => {});
				currentMessages = currentMessages.filter((_, i) => i !== selectedIdx);
				selectedIdx = Math.min(selectedIdx, currentMessages.length - 1);
			},
			goInbox: () => goCanonical('inbox'),
			goArchive: () => goCanonical('archive'),
			goSent: () => goCanonical('sent'),
			goDrafts: () => goCanonical('drafts'),
			goFolderPicker: () => {
				phase = 'folder';
			},
			goAccountPicker: () => {
				phase = 'account';
			},
			activateHints: () => {
				if (!listEl) return;
				const rows = Array.from(
					listEl.querySelectorAll<HTMLElement>('[data-testid="mail-list.message-row"]')
				);
				const raw = rows.map((el) => ({ el, onActivate: () => el.click() }));
				hintTargets = assignLabels(raw);
				if (hintTargets.length > 0) hintMode = true;
			},
			escape: () => {
				if (searchOpen) {
					handleSearchClose();
					return;
				}
				phase = 'folder';
			}
		});
		return registerKeymap(km);
	});

	// The dispatcher-owned leader prefix drives the existing on-screen `g` indicator.
	let leader = $derived(leaderKey());

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
			onHome={() => (ui.aboutOpen = true)}
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
		<HintBar onShowHelp={() => (ui.helpOpen = true)}>
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
			onHome={() => (ui.aboutOpen = true)}
			onAccount={() => (phase = 'account')}
			onFolder={() => { openMessage = null; phase = 'folder'; }}
			onModeChange={handleModeChange}
			onNext={() => {
				const next = Math.min(selectedIdx + 1, currentMessages.length - 1);
				selectedIdx = next;
				const nextMsg = currentMessages[next];
				if (nextMsg && folder) openMessageRoute(folder.id, nextMsg.id);
			}}
			onPrev={() => {
				const next = Math.max(selectedIdx - 1, 0);
				selectedIdx = next;
				const prevMsg = currentMessages[next];
				if (prevMsg && folder) openMessageRoute(folder.id, prevMsg.id);
			}}
			onActivateHints={() => {
				if (messageMode === 'html' || !readerBodyEl) return;
				const links = Array.from(
					readerBodyEl.querySelectorAll<HTMLAnchorElement>('a.mb-link')
				);
				const chips = Array.from(
					document.querySelectorAll<HTMLButtonElement>('[data-testid="attachment-chip"]')
				);
				const raw = [
					...links.map((el) => ({
						el: el as HTMLElement,
						onActivate: () => window.open(el.href, '_blank', 'noopener,noreferrer')
					})),
					...chips.map((el) => ({
						el: el as HTMLElement,
						onActivate: () => el.click()
					}))
				];
				hintTargets = assignLabels(raw);
				if (hintTargets.length > 0) hintMode = true;
			}}
			bind:bodyEl={readerBodyEl}
		/>
	{/if}

	{#if hintMode}
		<HintOverlay targets={hintTargets} onCancel={() => (hintMode = false)} />
	{/if}

	{#if ui.aboutOpen}
		<About onClose={() => (ui.aboutOpen = false)} />
	{/if}

	{#if ui.helpOpen}
		<KeyboardHelp onClose={() => (ui.helpOpen = false)} />
	{/if}

	{#if ui.composeOpen && account && folder}
		<Compose
			{account}
			{folder}
			onClose={() => (ui.composeOpen = false)}
			onSent={async (draft) => {
				// task 7.2: try network, fall back to outbox on failure
				try {
					const res = await fetch('/api/send', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(draft)
					});
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					ui.composeOpen = false;
				} catch {
					await outboxEnqueue(draft as Record<string, unknown>);
					ui.composeOpen = false;
				}
			}}
			onHome={() => (ui.aboutOpen = true)}
			onAccount={() => { ui.composeOpen = false; phase = 'account'; }}
			onFolder={() => { ui.composeOpen = false; phase = 'folder'; }}
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

	{#if ui.cmdOpen && account && folder}
		<CommandPalette
			{account}
			{folder}
			onAction={handleCommand}
			onCancel={() => (ui.cmdOpen = false)}
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
		bind:open={ui.settingsOpen}
		{uiPrefs}
		onPrefChange={(k, v) => { uiPrefs[k] = v; }}
		{attachmentAction}
		onAttachmentActionChange={(v) => { attachmentAction = v; writeSetting('attachment_action', v); }}
	/>
</div>
