<script lang="ts">
	import Wordmark from './Wordmark.svelte';
	import logoUrl from '$lib/assets/mailbrus.svg';

	let { onClose }: { onClose: () => void } = $props();

	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') { e.preventDefault(); onClose(); }
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="mb-curtain"
	onclick={(e) => { if ((e.target as HTMLElement).classList.contains('mb-curtain')) onClose(); }}
>
	<div class="mb-about" role="dialog" aria-modal="true" aria-label="About Mailbrus">
		<button type="button" class="mb-about-close" onclick={onClose} aria-label="Close">×</button>
		<div class="mb-about-logo">
			<img src={logoUrl} alt="Mailbrus" class="mb-about-logo-img" />
		</div>
		<div class="mb-about-wordmark">
			<Wordmark size={36} />
		</div>
		<p class="mb-about-tag">
			A keyboard-oriented, no-bullshit,<br />
			text-only email client.
		</p>
		<div class="mb-about-divider" aria-hidden="true"></div>
		<dl class="mb-about-meta">
			<div class="mb-about-meta-row">
				<dt>source</dt>
				<dd>
					<a
						href="https://github.com/antono/mailbrus"
						target="_blank"
						rel="noopener noreferrer"
						class="mb-about-link"
					>
						github.com/antono/mailbrus
						<span class="mb-about-link-arrow" aria-hidden="true">↗</span>
					</a>
					<span class="mb-about-meta-tbd">tbd</span>
				</dd>
			</div>
			<div class="mb-about-meta-row">
				<dt>license</dt>
				<dd>MIT</dd>
			</div>
			<div class="mb-about-meta-row">
				<dt>version</dt>
				<dd>0.4.2 <span class="mb-about-meta-mute">(prototype)</span></dd>
			</div>
		</dl>
		<div class="mb-about-foot">
			<span class="kbd-group">
				<span class="kbd">esc</span>
				<span class="kbd-label">close</span>
			</span>
		</div>
	</div>
</div>
