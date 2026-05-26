<script lang="ts">
	import Wordmark from './Wordmark.svelte';

	let { onClose }: { onClose: () => void } = $props();

	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' || e.key === '?') {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});

	const sections = [
		{
			label: 'Navigation',
			items: [
				{ keys: [['j'], ['↓']], desc: 'Next message' },
				{ keys: [['k'], ['↑']], desc: 'Previous message' },
				{ keys: [['g', 'g']], desc: 'Top of list' },
				{ keys: [['G']], desc: 'Bottom of list' },
				{ keys: [['h']], desc: 'Previous page' },
				{ keys: [['l']], desc: 'Next page' }
			]
		},
		{
			label: 'Actions',
			items: [
				{ keys: [['↵']], desc: 'Open selected message' },
				{ keys: [['f']], desc: 'Open message by hint' },
				{ keys: [['/']], desc: 'Search this folder' },
				{ keys: [['c']], desc: 'Compose new message' },
				{ keys: [['Esc']], desc: 'Go back / close' }
			]
		},
		{
			label: 'Go to',
			items: [
				{ keys: [['g', 'i']], desc: 'Inbox' },
				{ keys: [['g', 'a']], desc: 'Archive' },
				{ keys: [['g', 's']], desc: 'Sent' },
				{ keys: [['g', 'd']], desc: 'Drafts' },
				{ keys: [['g', 'f']], desc: 'Folder picker' },
				{ keys: [['g', 'A']], desc: 'Account picker' }
			]
		},
		{
			label: 'App',
			items: [
				{ keys: [['⌘', 'K']], desc: 'Command palette' },
				{ keys: [['?']], desc: 'This help' }
			]
		},
		{
			label: 'Inside palettes',
			items: [
				{ keys: [['1'], ['–'], ['9']], desc: 'Jump to row' },
				{ keys: [['↑'], ['Ctrl', 'P']], desc: 'Move up' },
				{ keys: [['↓'], ['Ctrl', 'N']], desc: 'Move down' },
				{ keys: [['↵']], desc: 'Confirm' },
				{ keys: [['Esc']], desc: 'Cancel' }
			]
		},
		{
			label: 'Reader',
			items: [
				{ keys: [['j'], ['k']], desc: 'Next / previous message' },
				{ keys: [['J'], ['K']], desc: 'Scroll down / up' },
				{ keys: [['PgDn'], ['PgUp']], desc: 'Scroll 3/4 page down / up' },
				{ keys: [['g', 'g']], desc: 'Scroll to top' },
				{ keys: [['G']], desc: 'Scroll to bottom' },
				{ keys: [['f']], desc: 'Follow link / attachment by hint' },
				{ keys: [['Esc']], desc: 'Close reader' }
			]
		},
		{
			label: 'Compose',
			items: [
				{ keys: [['⌘', '↵']], desc: 'Send' },
				{ keys: [['⌘', 'S']], desc: 'Save draft' },
				{ keys: [['Esc']], desc: 'Discard' }
			]
		}
	];
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="mb-curtain"
	onclick={(e) => { if ((e.target as HTMLElement).classList.contains('mb-curtain')) onClose(); }}
>
	<div class="mb-help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" data-testid="keyboard-help.dialog">
		<div class="head">
			<div class="eyebrow">
				<span>keyboard shortcuts</span>
				<Wordmark size={11} />
			</div>
			<div class="title">All hotkeys</div>
		</div>
		<div class="mb-help-grid mb-scroll">
			{#each sections as section}
				<div class="mb-help-sect">
					<div class="mb-help-sect-label">{section.label}</div>
					<div class="mb-help-rows">
						{#each section.items as it}
							<div class="mb-help-row">
								<div class="mb-help-keys">
									{#each it.keys as grp}
										<span class="mb-help-keygroup">
											{#each grp as k}
												<span class="kbd">{k}</span>
											{/each}
										</span>
									{/each}
								</div>
								<div class="mb-help-desc">{it.desc}</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
		<div class="foot">
			<span class="kbd-group"><span class="kbd">?</span><span class="kbd-label">toggle</span></span>
			<span class="kbd-group" style="margin-left: auto">
				<span class="kbd">esc</span><span class="kbd-label">close</span>
			</span>
		</div>
	</div>
</div>
