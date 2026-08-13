<script lang="ts">
	// openspec/changes/tauri-token-injection/specs/frontend-auth-bootstrap/spec.md
	import { authGate, submitToken, tokenWasInjected } from '$lib/auth.svelte.ts';

	// Desktop injects a token; if that path 401s the user can't usefully re-enter
	// it, so offer a reload (which re-runs the injection script) instead of input.
	const injected = tokenWasInjected();

	let token = $state('');
	let busy = $state(false);

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		await submitToken(token);
		busy = false;
	}

	function reload() {
		location.reload();
	}
</script>

<div class="auth-screen" data-testid="auth.screen">
	{#if injected}
		<h1>Connection lost</h1>
		<p>The local server rejected this window's access token. Reloading re-establishes it.</p>
		<button type="button" data-testid="auth.reload" onclick={reload}>Reload</button>
	{:else}
		<h1>Access token required</h1>
		<p>
			This server was started with <code>--auth</code>. Paste its access token to continue.
		</p>
		<form onsubmit={onSubmit}>
			<input
				type="password"
				bind:value={token}
				placeholder="Access token"
				autocomplete="off"
				data-testid="auth.token-input"
			/>
			<button type="submit" disabled={busy} data-testid="auth.submit">
				{busy ? 'Checking…' : 'Continue'}
			</button>
		</form>
	{/if}

	{#if authGate.error}
		<p class="auth-error" data-testid="auth.error">{authGate.error}</p>
	{/if}
</div>

<style>
	.auth-screen {
		max-width: 28rem;
		margin: 15vh auto;
		padding: 2rem;
		text-align: center;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1rem;
	}
	input {
		padding: 0.5rem 0.75rem;
		font: inherit;
	}
	.auth-error {
		margin-top: 1rem;
		color: var(--color-error, #c0392b);
	}
</style>
