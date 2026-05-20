<script lang="ts">
	import { resolveGravatar, initials } from '$lib/utils.js';

	let { email, name, size = 32 }: { email: string; name?: string; size?: number } = $props();

	let url = $state<string | null>(null);
	let errored = $state(false);

	$effect(() => {
		url = null;
		errored = false;
		resolveGravatar(email).then((u) => {
			url = u;
		});
	});

	let showImg = $derived(url && !errored);
</script>

<span
	class="mb-avatar"
	style="width: {size}px; height: {size}px; font-size: {Math.round(size * 0.36)}px"
	aria-hidden="true"
>
	{#if showImg}
		<img
			src={url!}
			alt=""
			width={size}
			height={size}
			loading="lazy"
			onerror={() => (errored = true)}
		/>
	{/if}
	<span class="mb-avatar-fallback">{initials(name || email)}</span>
</span>
