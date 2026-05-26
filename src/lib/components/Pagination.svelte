<script lang="ts">
	let {
		page,
		perPage,
		count,
		onPageChange
	}: {
		page: number;
		perPage: number;
		count: number;
		onPageChange: (page: number) => void;
	} = $props();

	const lastPage = $derived(Math.ceil(count / perPage));
</script>

{#if count > perPage}
	<div class="mb-pagination">
		<button
			type="button"
			class="mb-pagination-btn"
			disabled={page <= 1}
			onclick={() => onPageChange(page - 1)}
			aria-label="Previous page"
		>‹ Prev</button>
		{#key page}
			<span class="mb-pagination-info pg-counter" data-testid="pagination.counter">{page} / {lastPage}</span>
		{/key}
		<button
			type="button"
			class="mb-pagination-btn"
			disabled={page >= lastPage}
			onclick={() => onPageChange(page + 1)}
			aria-label="Next page"
		>Next ›</button>
	</div>
{/if}

<style>
	.mb-pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		border-top: 1px solid var(--border, #e5e7eb);
		font-size: 0.8125rem;
		color: var(--fg-muted, #6b7280);
	}

	.mb-pagination-btn {
		padding: 0.25rem 0.625rem;
		border: 1px solid var(--border, #e5e7eb);
		border-radius: 4px;
		background: var(--bg, #fff);
		color: var(--fg, #111);
		font-size: 0.8125rem;
		cursor: pointer;
		transition: background 0.1s;
	}

	.mb-pagination-btn:hover:not(:disabled) {
		background: var(--bg-hover, #f3f4f6);
	}

	.mb-pagination-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	:global(.dark) .mb-pagination {
		border-color: var(--border-dark, #374151);
		color: var(--fg-muted-dark, #9ca3af);
	}

	:global(.dark) .mb-pagination-btn {
		border-color: var(--border-dark, #374151);
		background: var(--bg-dark, #1f2937);
		color: var(--fg-dark, #f9fafb);
	}

	:global(.dark) .mb-pagination-btn:hover:not(:disabled) {
		background: var(--bg-hover-dark, #374151);
	}
</style>
