import { pwaLog } from './pwa-log';

export function setBadge(n: number): void {
	if ('setAppBadge' in navigator) {
		navigator.setAppBadge(n).then(() => pwaLog('badge', `set ${n}`)).catch(() => {});
	}
}

export function clearBadge(): void {
	if ('clearAppBadge' in navigator) {
		navigator.clearAppBadge().then(() => pwaLog('badge', 'clear')).catch(() => {});
	}
}
