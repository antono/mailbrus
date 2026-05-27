// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Per-scope hotkey isolation)
// `?` is handled by the Global keymap (toggles help closed); only `Escape` lives here.
import type { Keymap } from '../types.ts';

export type ModalKeymapCtx = {
	close: () => void;
};

export function createModalKeymap(ctx: ModalKeymapCtx): Keymap {
	return {
		scope: 'modal',
		bindings: [
			{
				keys: ['Escape'],
				group: 'Modal',
				description: 'Close',
				handler: (e) => {
					e.preventDefault();
					ctx.close();
				}
			}
		]
	};
}
