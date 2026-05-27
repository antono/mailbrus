// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Per-scope hotkey isolation, Typing guard)
// Pure-logic helpers extracted from dispatcher.svelte.ts so they can be unit-tested
// without a Svelte runtime.
import type { Binding } from './types.ts';

export type EventLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

export function hasModifier(spec: string): boolean {
	return /^(Ctrl|Meta|Cmd|Alt|Shift)\+/i.test(spec);
}

export function bypassesTypingGuard(spec: string): boolean {
	if (hasModifier(spec)) return true;
	if (spec === 'Escape') return true;
	return false;
}

export function matchSingleKey(spec: string, e: EventLike): boolean {
	if (spec.includes('+')) {
		const parts = spec.split('+');
		const baseKey = parts[parts.length - 1];
		const mods = parts.slice(0, -1).map((m) => m.toLowerCase());
		const needCtrl = mods.includes('ctrl') || mods.includes('cmd') || mods.includes('meta');
		const needAlt = mods.includes('alt');
		const needShift = mods.includes('shift');
		if (needCtrl && !(e.ctrlKey || e.metaKey)) return false;
		if (!needCtrl && (e.ctrlKey || e.metaKey)) return false;
		if (needAlt !== e.altKey) return false;
		if (needShift && !e.shiftKey) return false;
		const evKey = e.key;
		if (baseKey.length === 1 && evKey.length === 1) {
			return baseKey.toLowerCase() === evKey.toLowerCase();
		}
		return baseKey === evKey;
	}
	if (e.ctrlKey || e.metaKey || e.altKey) return false;
	return spec === e.key;
}

export function pickMatch(
	bindings: Binding[],
	e: EventLike,
	leader: string | null
): { binding: Binding; consumesLeader: boolean } | null {
	let fallback: Binding | null = null;
	for (const b of bindings) {
		if (b.when && !b.when()) continue;
		if (b.fallback) {
			if (fallback === null) fallback = b;
			continue;
		}
		const ks = b.keys;
		if (ks.length === 0) continue;
		if (ks.length === 1) {
			if (leader !== null) continue;
			if (matchSingleKey(ks[0], e)) return { binding: b, consumesLeader: false };
		} else if (ks.length === 2) {
			if (leader === null) continue;
			if (ks[0] === leader && matchSingleKey(ks[1], e)) {
				return { binding: b, consumesLeader: true };
			}
		}
	}
	if (fallback) return { binding: fallback, consumesLeader: false };
	return null;
}

export function findLeaderStart(bindings: Binding[], e: EventLike): boolean {
	if (e.ctrlKey || e.metaKey || e.altKey) return false;
	for (const b of bindings) {
		if (b.when && !b.when()) continue;
		if (b.keys.length === 2 && matchSingleKey(b.keys[0], e)) return true;
	}
	return false;
}

export function filterByTypingGuard(bindings: Binding[], typing: boolean): Binding[] {
	if (!typing) return bindings;
	return bindings.filter((b) => b.bypassTypingGuard || b.keys.some(bypassesTypingGuard));
}
