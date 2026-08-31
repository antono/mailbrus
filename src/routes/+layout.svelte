<script lang="ts">
	// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md
	// openspec/changes/tauri-token-injection/specs/frontend-auth-bootstrap/spec.md
	import { installDispatcher } from '$lib/hotkeys/dispatcher.svelte.ts';
	import { registerKeymap } from '$lib/hotkeys/registry.svelte.ts';
	import { globalKeymap } from '$lib/hotkeys/global.ts';
	import { authGate, initAuthGate } from '$lib/auth.svelte.ts';
	import AuthScreen from '$lib/components/AuthScreen.svelte';
	let { children } = $props();

	$effect(() => {
		const disposeDispatcher = installDispatcher();
		const disposeGlobal = registerKeymap(globalKeymap);
		return () => {
			disposeGlobal();
			disposeDispatcher();
		};
	});

	// Run the boot probe once (client-only: effects don't run during SSR).
	$effect(() => {
		void initAuthGate();
	});
</script>

{#if authGate.state === 'needs-token'}
	<AuthScreen />
{:else if authGate.state === 'checking'}
	<div class="auth-checking" data-testid="auth.checking">Connecting…</div>
{:else}
	{@render children?.()}
{/if}

<style>
	.auth-checking {
		max-width: 28rem;
		margin: 15vh auto;
		text-align: center;
	}
</style>
