// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md
export type Scope = 'list' | 'reader' | 'compose' | 'palette' | 'modal' | 'hint';

export type KeymapScope = Scope | 'global';

export type Binding = {
	keys: string[];
	group: string;
	description: string;
	when?: () => boolean;
	/**
	 * Set to `true` for bindings that must fire even while focus is in a text input —
	 * used by the palette scope so its navigation keys (`ArrowDown`, `Enter`,
	 * `Ctrl+N`, etc.) work while the search query is focused.
	 */
	bypassTypingGuard?: boolean;
	/**
	 * Set to `true` to make this binding fire only when no other binding in the
	 * current dispatch pass matched. Used by hint mode to cancel on any
	 * unrecognised keypress per the vimium-link-hints spec.
	 */
	fallback?: boolean;
	handler: (e: KeyboardEvent) => void;
};

export type Keymap = {
	scope: KeymapScope;
	bindings: Binding[];
};

export const EXCLUSIVE_SCOPES: ReadonlySet<Scope> = new Set(['palette', 'modal', 'hint']);
