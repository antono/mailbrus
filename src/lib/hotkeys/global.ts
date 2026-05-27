// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Global keymap)
import type { Keymap } from './types.ts';
import { ui } from '../ui-state.svelte.ts';

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
