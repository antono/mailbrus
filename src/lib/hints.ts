export type HintTarget = {
	el: HTMLElement;
	label: string;
	onActivate: () => void;
};

const HINT_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export function assignLabels<T extends { el: HTMLElement; onActivate: () => void }>(
	items: T[]
): HintTarget[] {
	return items.slice(0, HINT_LETTERS.length).map((item, i) => ({
		el: item.el,
		label: HINT_LETTERS[i],
		onActivate: item.onActivate
	}));
}
