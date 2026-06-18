// openspec/changes/hotkeys-improvement/specs/reader-message-actions/spec.md
// Thin wrapper over the async Clipboard API. Works in the SPA and the Tauri
// webview when served over a secure origin; resolves false if the write is
// rejected (no permission / insecure context) so callers can degrade quietly.
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}
