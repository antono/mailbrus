declare const self: ServiceWorkerGlobalScope;

const debug = new URLSearchParams(self.location.search).get('debug') === '1';

export function pwaLog(namespace: string, ...args: unknown[]): void {
	if (debug) console.debug(`[${namespace}]`, ...args);
}
