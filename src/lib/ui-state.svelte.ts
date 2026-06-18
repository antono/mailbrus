// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Global keymap)
// openspec/changes/hotkeys-improvement/specs/reader-message-actions/spec.md (compose prefill)
// Overlay toggles shared between the page and the Global keymap registered in +layout.svelte.
import type { ComposeDraft } from '$lib/reply.ts';

export const ui = $state({
	helpOpen: false,
	settingsOpen: false,
	cmdOpen: false,
	aboutOpen: false,
	composeOpen: false,
	canTogglePalette: false,
	// Seed for the compose screen when opened from a reader action (reply/forward).
	// Compose consumes it on mount and clears it back to null.
	composePrefill: null as ComposeDraft | null
});
