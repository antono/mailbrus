export interface RouteDescriptor {
	folderId?: string;
	messageId?: string;
	query?: string;
}

const base = '';

export function parsePath(url: URL): RouteDescriptor {
	const path = url.pathname.replace(base, '') || '/';
	const segments = path.split('/').filter(Boolean);

	if (segments[0] === 'search') {
		return { query: url.searchParams.get('q') ?? '' };
	}

	if (segments[0] === 'folder' && segments[1]) {
		const folderId = decodeURIComponent(segments[1]);
		if (segments[2] === 'message' && segments[3]) {
			return { folderId, messageId: decodeURIComponent(segments[3]) };
		}
		return { folderId };
	}

	return {};
}

export function buildPath(descriptor: RouteDescriptor): string {
	const { folderId, messageId, query } = descriptor;

	if (query !== undefined) {
		const params = new URLSearchParams({ q: query });
		return `${base}/search?${params}`;
	}

	if (folderId && messageId) {
		return `${base}/folder/${encodeURIComponent(folderId)}/message/${encodeURIComponent(messageId)}`;
	}

	if (folderId) {
		return `${base}/folder/${encodeURIComponent(folderId)}`;
	}

	return `${base}/`;
}

export function buildFolderUrl(folderId: string): string {
	return buildPath({ folderId });
}

export function buildMessageUrl(folderId: string, messageId: string): string {
	return buildPath({ folderId, messageId });
}

export function buildSearchUrl(query: string): string {
	return buildPath({ query });
}
