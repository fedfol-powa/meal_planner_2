<script lang="ts">
	import '#lib/design/tokens.css';
	import '#lib/design/fonts.css';
	import '#lib/design/global.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<div class="shell">
	<main class="app-content" id="app-content" tabindex="-1">{@render children()}</main>
</div>
