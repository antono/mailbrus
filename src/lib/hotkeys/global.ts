// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Global keymap)
// openspec/changes/ui-sync-trigger/specs/sveltekit-ui/spec.md (Sync via hotkey)
import type { Keymap } from './types.ts';
import { ui } from '../ui-state.svelte.ts';
import { requestSync } from '../syncState.svelte.ts';

export const globalKeymap: Keymap = {
	scope: 'global',
	bindings: [
		{
			keys: ['Ctrl+K'],
			group: 'App',
			description: 'Command palette',
			when: () => ui.canTogglePalette,
			handler: (e) => {
				e.preventDefault();
				ui.cmdOpen = !ui.cmdOpen;
			}
		},
		{
			keys: ['Ctrl+Shift+S'],
			group: 'App',
			description: 'Sync mail',
			handler: (e) => {
				e.preventDefault();
				// `requestSync` no-ops if a sync is already in flight.
				void requestSync().catch((err) => console.error('sync failed', err));
			}
		},
		{
			keys: ['Ctrl+,'],
			group: 'App',
			description: 'Open settings',
			handler: (e) => {
				e.preventDefault();
				ui.settingsOpen = true;
			}
		},
		{
			keys: ['?'],
			group: 'App',
			description: 'Toggle keyboard help',
			handler: (e) => {
				e.preventDefault();
				ui.helpOpen = !ui.helpOpen;
			}
		}
	]
};
