export interface Account {
	id: string;
	address: string;
	host: string;
	maildir: string;
	unread: number;
	total: number;
}

export interface Folder {
	id: string;
	name: string;
	unread: number;
	total: number;
}

export interface Attachment {
	name: string;
	size: number;
	mime: string;
}

export interface Message {
	id: string;
	from: string;
	addr: string;
	subject: string;
	preview: string;
	time: string;
	unread: boolean;
	flags: string;
	attachments?: Attachment[];
}
