<script lang="ts">
	import { toast } from '$lib/toast.svelte';
	import Button from '$lib/ui/Button.svelte';

	/* Tanari ertekeles egy beadando egy bekuldesere: erdemjegy 1-5 + visszajelzes.
	 * Mentes PATCH /api/classrooms/[id]/assignments/[aid]/grades vegpontra. */

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

	const grades = [1, 2, 3, 4, 5];

	async function save() {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch(`/api/classrooms/${classroomId}/assignments/${assignmentId}/grades`, {
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

<div class="mt-1.5 border-t border-stone-200/70 pt-1.5 dark:border-white/10">
	{#if !open}
		<div class="flex items-center gap-2">
			{#if student.grade !== null && student.grade !== undefined}
				<span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-500 text-[14px] font-extrabold text-white">
					{student.grade}
				</span>
				<span class="min-w-0 flex-1 truncate text-[12px] text-stone-500 dark:text-stone-400">
					{student.feedback !== '' ? student.feedback : 'Értékelve'}
				</span>
			{:else}
				<span class="min-w-0 flex-1 text-[12px] text-stone-400 dark:text-stone-500">
					{student.submitted === 1 ? 'Még nincs értékelve' : 'Még nincs beküldve'}
				</span>
			{/if}
			<button
				type="button"
				onclick={openEditor}
				class="shrink-0 rounded-full border border-stone-200 px-3 py-1.5 text-[12px] font-bold text-ink-700 transition hover:bg-white active:scale-95 dark:border-white/15 dark:text-stone-200 dark:hover:bg-white/10"
			>
				{student.grade !== null && student.grade !== undefined ? 'Módosítom' : 'Értékelek'}
			</button>
		</div>
	{:else}
		<div class="grid gap-2 py-1">
			<div class="flex items-center gap-1.5" role="radiogroup" aria-label="Érdemjegy">
				{#each grades as g (g)}
					<button
						type="button"
						role="radio"
						aria-checked={grade === g}
						onclick={() => (grade = grade === g ? null : g)}
						class={[
							'grid size-9 place-items-center rounded-full text-[15px] font-extrabold transition active:scale-95',
							grade === g
								? 'bg-brand-500 text-white shadow'
								: 'bg-white text-stone-500 hover:bg-stone-200/60 dark:bg-white/5 dark:text-stone-300 dark:hover:bg-white/10'
						]}
					>
						{g}
					</button>
				{/each}
				<span class="ml-1 text-[12px] text-stone-400 dark:text-stone-500">koppints mégegyszer a törléshez</span>
			</div>
			<textarea
				rows="2"
				maxlength="2000"
				placeholder="Visszajelzés a diáknak (nem kötelező)"
				bind:value={feedback}
				disabled={busy}
				class="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-[13px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500"
			></textarea>
			<div class="grid grid-cols-2 gap-2">
				<Button variant="outline" disabled={busy} onclick={() => (open = false)}>Mégse</Button>
				<Button busy={busy} onclick={save}>{busy ? 'Mentés…' : 'Mentés'}</Button>
			</div>
		</div>
	{/if}
</div>
