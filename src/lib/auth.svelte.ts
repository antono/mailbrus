// openspec/changes/tauri-token-injection/specs/frontend-auth-bootstrap/spec.md
// Auth gate: decides whether to show the app or a blocking token-bootstrap screen,
// and recovers when a stored token is rejected mid-session. Token persistence is
// delegated to the existing api.ts plumbing (localStorage + IndexedDB + service worker).
import { getAuthToken, setAuthToken, setUnauthorizedHandler, withAuth } from './api';

export type AuthState = 'checking' | 'authed' | 'needs-token';

/** Boot probe hits the same endpoint the server health check uses. */
const PROBE_PATH = '/api/maildirs';

export const authGate = $state<{ state: AuthState; error: string | null }>({
	state: 'checking',
	error: null
});

/** True when the desktop shell injected the token (vs. a browser bootstrap). */
export function tokenWasInjected(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof (window as unknown as { __MAILBRUS_AUTH_TOKEN__?: unknown }).__MAILBRUS_AUTH_TOKEN__ ===
			'string'
	);
}

/**
 * Boot gate: a single probe decides the initial state.
 * - 200 → authed
 * - 401 → needs-token (any stored token was stale, so drop it)
 * - network error / 5xx → admit; not an auth problem, let the app's own
 *   loading/error handling take over.
 */
export async function initAuthGate(): Promise<void> {
	setUnauthorizedHandler(handleUnauthorized);
	try {
		const res = await fetch(PROBE_PATH, withAuth());
		if (res.status === 401) {
			if (getAuthToken()) setAuthToken(null);
			authGate.state = 'needs-token';
			return;
		}
		authGate.state = 'authed';
	} catch {
		authGate.state = 'authed';
	}
}

/** Validate a user-entered token; on success persist it and unlock the app. */
export async function submitToken(token: string): Promise<boolean> {
	const trimmed = token.trim();
	if (!trimmed) {
		authGate.error = 'Enter an access token.';
		return false;
	}
	setAuthToken(trimmed);
	try {
		const res = await fetch(PROBE_PATH, withAuth());
		if (res.ok) {
			authGate.error = null;
			authGate.state = 'authed';
			return true;
		}
		setAuthToken(null);
		authGate.error = 'That token was rejected. Check the value and try again.';
		return false;
	} catch {
		authGate.error = 'Could not reach the server. Is it running?';
		return false;
	}
}

/** Mid-session recovery: a token was attached but the server returned 401. */
function handleUnauthorized(): void {
	if (getAuthToken()) setAuthToken(null);
	authGate.error = 'Your session expired. Re-enter your access token.';
	authGate.state = 'needs-token';
}
