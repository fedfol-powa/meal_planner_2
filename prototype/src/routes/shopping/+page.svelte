<script lang="ts">
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { app } from '#lib/store/app.svelte.ts';
</script>

<section class="secondary-view app-view">
	<StateNotice title={app.t('shopping.title')} body={app.t('common.comingSoon')} />
</section>
