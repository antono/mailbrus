// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Global keymap)
// Overlay toggles shared between the page and the Global keymap registered in +layout.svelte.
export const ui = $state({
	helpOpen: false,
	settingsOpen: false,
	cmdOpen: false,
	aboutOpen: false,
	composeOpen: false,
	canTogglePalette: false
});
