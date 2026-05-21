export function pwaLog(namespace: string, ...args: unknown[]): void {
	if (typeof localStorage !== 'undefined' && localStorage.getItem('mailbrus:debug') === 'true') {
		console.debug(`[${namespace}]`, ...args);
	}
}
