<script lang="ts">
	import { mutationFetch } from '$lib/mutation-fetch';
	import { toast } from '$lib/toast.svelte';
	import Button from '$lib/ui/Button.svelte';

	/* Tanári értékelés: érdemjegy és szöveges visszajelzés egy beküldéshez. */

	export interface GradeStudent {
		user_id: string;
		name: string;
		submitted: number;
		grade: number | null;
		feedback: string;
	}

	interface Props {
		classroomId: string;
		assignmentId: string;
		student: GradeStudent;
		onSaved: (userId: string, grade: number | null, feedback: string) => void;
	}

	let { classroomId, assignmentId, student, onSaved }: Props = $props();

	let grade = $state<number | null>(null);
	let feedback = $state('');
	let open = $state(false);
	let busy = $state(false);

	function openEditor() {
		grade = student.grade;
		feedback = student.feedback ?? '';
		open = true;
	}

	const grades = [
		{ value: 1, label: 'Elégtelen' }, { value: 2, label: 'Elégséges' },
		{ value: 3, label: 'Közepes' }, { value: 4, label: 'Jó' }, { value: 5, label: 'Jeles' }
	];
	let hasEvaluation = $derived(student.grade != null || !!student.feedback);
	let showEditor = $derived(open || !hasEvaluation);
	let selectedLabel = $derived(grades.find((g) => g.value === grade)?.label);


	async function save() {
		if (busy) return;
		busy = true;
		try {
			const res = await mutationFetch(`/api/classrooms/${classroomId}/assignments/${assignmentId}/grades`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ userId: student.user_id, grade, feedback: feedback.trim() })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült menteni', j.error ?? 'Próbáld újra!');
				return;
			}
			onSaved(student.user_id, j.grade ?? null, j.feedback ?? '');
			open = false;
			toast.success('Értékelés mentve');
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			busy = false;
		}
	}
</script>

{#if student.submitted !== 1}
	<p class="py-2 text-sm text-stone-500 dark:text-stone-400">A diák még nem küldte be a beadandót.</p>
{:else if !showEditor}
	<div class="grid gap-3">
		<div class="flex items-center gap-3">
			{#if student.grade != null}
				<span class="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-500 text-xl font-extrabold text-white">{student.grade}</span>
			{/if}
			<div class="min-w-0 flex-1">
				<p class="text-[15px] font-extrabold text-ink-900 dark:text-white">{grades.find((g) => g.value === student.grade)?.label ?? 'Szöveges értékelés'}</p>
				<p class="text-[12px] text-stone-500 dark:text-stone-400">Mentett értékelés</p>
			</div>
			<Button variant="outline" size="sm" onclick={openEditor}>Módosítás</Button>
		</div>
		{#if student.feedback}
			<p class="text-sm leading-relaxed break-words whitespace-pre-wrap text-stone-600 dark:text-stone-300">{student.feedback}</p>
		{/if}
	</div>
{:else}
	<form onsubmit={(event) => { event.preventDefault(); void save(); }} class="grid gap-4 pt-2">
		<fieldset disabled={busy}>
			<legend class="mb-2 text-[13px] font-semibold text-ink-900 dark:text-white">Érdemjegy</legend>
			<div class="grid grid-cols-5 gap-2">
				{#each grades as g (g.value)}
					<button type="button" aria-label={`${g.value} - ${g.label}`} aria-pressed={grade === g.value}
						onclick={() => grade = grade === g.value ? null : g.value}
						class={['grid min-h-12 place-items-center rounded-xl border text-lg font-extrabold transition active:scale-95 disabled:opacity-60',
							grade === g.value ? 'border-brand-500 bg-brand-500 text-white shadow-sm' : 'border-stone-200 bg-white text-stone-600 hover:border-brand-300 hover:bg-brand-50 dark:border-white/15 dark:bg-white/5 dark:text-stone-200 dark:hover:bg-white/10']}>
						{g.value}
					</button>
				{/each}
			</div>
			<p class="mt-2 text-[12px] text-stone-500 dark:text-stone-400" aria-live="polite">{selectedLabel ?? 'Érdemjegy nélkül is adhatsz visszajelzést.'}</p>
		</fieldset>
		<label class="grid gap-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">
			Visszajelzés a diáknak
			<textarea rows="4" maxlength="2000" placeholder="Mi sikerült jól? Min érdemes még javítani?" bind:value={feedback} disabled={busy}
				class="w-full resize-y rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[15px] font-normal text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white"></textarea>
		</label>
		<div class="flex flex-wrap justify-end gap-2">
			{#if hasEvaluation}<Button variant="outline" disabled={busy} onclick={() => open = false}>Mégse</Button>{/if}
			<Button type="submit" busy={busy}>{busy ? 'Mentés…' : 'Értékelés mentése'}</Button>
		</div>
	</form>
{/if}
