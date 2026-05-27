// openspec/changes/isolate-hotkeys/specs/ui-hotkeys/spec.md (Per-scope hotkey isolation, Typing guard)
import type { Binding } from './types.ts';
import { EXCLUSIVE_SCOPES } from './types.ts';
import { activeScope } from './scope.svelte.ts';
import { globalBindings, scopeBindings } from './registry.svelte.ts';
import {
	pickMatch,
	findLeaderStart,
	filterByTypingGuard
} from './dispatcher-core.ts';

const LEADER_TIMEOUT_MS = 1200;

const _leader = $state<{ key: string | null }>({ key: null });
let _leaderTimer: ReturnType<typeof setTimeout> | null = null;

export function leaderKey(): string | null {
	return _leader.key;
}

function setLeader(k: string | null) {
	_leader.key = k;
	if (_leaderTimer) {
		clearTimeout(_leaderTimer);
		_leaderTimer = null;
	}
	if (k !== null) {
		_leaderTimer = setTimeout(() => {
			_leader.key = null;
			_leaderTimer = null;
		}, LEADER_TIMEOUT_MS);
	}
}

export function clearLeader() {
	setLeader(null);
}

export function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName.toLowerCase();
	if (tag === 'input' || tag === 'textarea') return true;
	if (target.isContentEditable) return true;
	return false;
}

/** Try to fire one matching binding from the given set. Pure — does not touch leader state. */
function tryMatch(bindings: Binding[], e: KeyboardEvent, typing: boolean): boolean {
	const leader = _leader.key;
	const filtered = filterByTypingGuard(bindings, typing);
	const m = pickMatch(filtered, e, leader);
	if (!m) return false;
	if (m.consumesLeader) clearLeader();
	m.binding.handler(e);
	return true;
}

let _installed = false;

const MODIFIER_ONLY_KEYS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta']);

export function installDispatcher(): () => void {
	if (_installed) return () => {};
	_installed = true;
	const onKey = (e: KeyboardEvent) => {
		// Modifier-only keydowns (Shift/Ctrl/Alt/Meta on their own) are never bindings
		// and must not cancel a pending leader — they always arrive a few ms before
		// the "real" key in chorded combos like `Shift+A`.
		if (MODIFIER_ONLY_KEYS.has(e.key)) return;

		const typing = isTypingTarget(e.target);

		const globals = globalBindings();
		const scope = activeScope();
		const scoped = scopeBindings(scope);

		// 1. Direct match: try Global, then the active scope. Either firing stops here.
		if (tryMatch(globals, e, typing)) {
			e.stopImmediatePropagation();
			return;
		}
		if (tryMatch(scoped, e, typing)) {
			e.stopImmediatePropagation();
			return;
		}

		// 2. Leader cancel: a pending leader prefix followed by an unmatched key
		//    cancels the leader and swallows the key (matches the legacy behavior).
		if (_leader.key !== null && !typing) {
			clearLeader();
			e.stopImmediatePropagation();
			return;
		}

		// 3. Leader start: if any visible 2-key binding starts with this key, capture
		//    it as the leader prefix instead of firing anything.
		if (!typing) {
			const gFiltered = filterByTypingGuard(globals, typing);
			const sFiltered = filterByTypingGuard(scoped, typing);
			if (findLeaderStart(gFiltered, e) || findLeaderStart(sFiltered, e)) {
				setLeader(e.key);
				e.preventDefault();
				return;
			}
		}

		// 4. Exclusive scope swallow: keep the underlying view's keys from leaking through.
		if (EXCLUSIVE_SCOPES.has(scope) && !typing) {
			e.stopImmediatePropagation();
		}
	};
	window.addEventListener('keydown', onKey, true);
	return () => {
		window.removeEventListener('keydown', onKey, true);
		_installed = false;
	};
}

export function _resetForTests(): void {
	_leader.key = null;
	if (_leaderTimer) {
		clearTimeout(_leaderTimer);
		_leaderTimer = null;
	}
	_installed = false;
}
