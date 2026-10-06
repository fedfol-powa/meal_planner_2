<script lang="ts">
	import BottomSheet from './BottomSheet.svelte';
	import { app } from '#lib/store/app.svelte.ts';

	// Variant "menu" (round 4): the family name above the month opens the list of the user's families.
	const families = $derived(app.db.families.filter((f) => f.members.some((m) => m.userId === app.user.id)));
	let open = $state(false);
</script>

{#if app.variants.familySwitch === 'menu' && families.length > 1}
	<button type="button" class="switcher" aria-haspopup="dialog" onclick={() => (open = true)}>
		{app.family?.name}<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg>
	</button>
	<BottomSheet {open} title={app.t('switcher.title')} onClose={() => (open = false)}>
		<ul class="row-list">
			{#each families as family (family.id)}
				<li>
					<button type="button" class="row-link" aria-pressed={family.id === app.family?.id} onclick={() => { app.switchFamily(family.id); open = false; }}>
						<span class="row-main">{family.name}</span>
						{#if family.id === app.family?.id}<svg class="icon current" aria-label={app.t('you.current')}><use href="#icon-check" /></svg>{/if}
					</button>
				</li>
			{/each}
			<li><a class="row-link" href="/welcome/family"><svg class="icon" aria-hidden="true"><use href="#icon-plus" /></svg><span class="row-main">{app.t('you.createAnother')}</span></a></li>
		</ul>
	</BottomSheet>
{/if}

<style>
	.switcher { display: inline-flex; align-items: center; gap: 2px; min-height: 32px; margin: 0 0 -6px; padding: 0; border: 0; background: none; color: var(--green); font: 700 0.8125rem/1.3 var(--text-font); letter-spacing: 0.035em; text-transform: uppercase; cursor: pointer; }
	.switcher .icon { width: 14px; height: 14px; transform: rotate(90deg); }
	.current { color: var(--green); }
	.row-link[aria-pressed='true'] .row-main { font-weight: 700; }
</style>
