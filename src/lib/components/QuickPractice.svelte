<script lang="ts">
	import type { QuizQuestion } from '$lib/curriculum';
	import QuizModal from '$lib/components/QuizModal.svelte';
	import QuizRunner from '$lib/components/QuizRunner.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';

	/* Buta modal: a kérdéseket a nyitó állítja össze, ezért nyitáskor
	   már a végleges tartalommal mountol. Nincs régi kérdés, nincs váltás. */

	interface Props {
		questions: QuizQuestion[];
		open: boolean;
		onClose: () => void;
	}

	let { questions, open, onClose }: Props = $props();
</script>

<QuizModal {open} label="Gyors gyakorlás" title="Gyors gyakorlás" {onClose}>
	{#if questions.length === 0}
		<EmptyState
			title="Nincs kérdés"
			description="A véletlen kvízhez most nincs elérhető kvízkérdés."
		/>
	{:else}
		{#key questions}
			<div class="pt-1">
				<QuizRunner {questions} title="Véletlen {questions.length} kérdés" />
			</div>
		{/key}
	{/if}
</QuizModal>
