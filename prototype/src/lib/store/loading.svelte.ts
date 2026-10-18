import { app } from './app.svelte.ts';
import type { SlowLoad } from './persistence';

/** Round 7: simulated network time, chosen in the Prova panel. */
const DURATION_MS: Record<SlowLoad, number> = { off: 0, brief: 150, medium: 1500, long: 4000, endless: Infinity };

/**
 * The skeleton becomes visible only after this delay: shorter loads keep the space reserved
 * but show nothing, so a fast answer does not flash a placeholder.
 */
export const SKELETON_DELAY_MS = 200;

// Simulated query cache: a key loads once, then shows at once (as cached data would, also offline).
const loaded = new Set<string>();
const cache = $state({ generation: 0 });

/** Forgets the simulated cache, so every view loads again. */
export function clearSimulatedCache() {
	loaded.clear();
	cache.generation++;
}

export interface SimulatedLoad {
	/** Data not arrived yet: the view keeps the space of the content. */
	readonly pending: boolean;
	/** Pending for longer than SKELETON_DELAY_MS: the skeleton is shown. */
	readonly visible: boolean;
}

/** Simulates loading the data identified by `key` (call during component init). */
export function simulatedLoad(key: () => string): SimulatedLoad {
	// Pending from the first render, so the content never shows for a frame before the skeleton.
	let pending = $state(!!DURATION_MS[app.settings.slowLoad] && !loaded.has(`${key()}#${cache.generation}`));
	let visible = $state(false);
	$effect(() => {
		const k = `${key()}#${cache.generation}`;
		const ms = DURATION_MS[app.settings.slowLoad];
		if (!ms || loaded.has(k)) {
			pending = false;
			visible = false;
			return;
		}
		pending = true;
		visible = false;
		const show = setTimeout(() => (visible = true), SKELETON_DELAY_MS);
		const done = Number.isFinite(ms)
			? setTimeout(() => {
				loaded.add(k);
				pending = false;
				visible = false;
			}, ms)
			: undefined;
		return () => {
			clearTimeout(show);
			clearTimeout(done);
		};
	});
	return {
		get pending() { return pending; },
		get visible() { return visible; }
	};
}
