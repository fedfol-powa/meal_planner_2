<script lang="ts">
	// Confirmation of an irreversible action: the button after the summary (chosen in the round 4 review).
	let { label, disabled = false, onConfirm }: { label: string; disabled?: boolean; onConfirm: () => void } = $props();
</script>

<button type="button" class="text-button danger confirm" {disabled} onclick={onConfirm}>{label}</button>

<style>
	.confirm { margin-top: 20px; }
</style>
