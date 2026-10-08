/** FNV-1a: a stable 32-bit seed from a text such as "family:week". */
export function seedFrom(text: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

export type Random = () => number;

/** Mulberry32: small, fast and deterministic, enough to choose among good candidates. */
export function createRandom(seed: number): Random {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function weightedPick<T>(choices: { item: T; weight: number }[], random: Random): T {
	if (choices.length === 0) throw new Error('weightedPick: no choices');
	const total = choices.reduce((sum, c) => sum + Math.max(c.weight, 0), 0);
	if (total <= 0) return choices[0].item;
	let rest = random() * total;
	for (const choice of choices) {
		rest -= Math.max(choice.weight, 0);
		if (rest < 0) return choice.item;
	}
	return choices[choices.length - 1].item;
}
