<script lang="ts">
	import { CalendarDays, Check, ListChecks, RotateCcw, Send, Undo2 } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import QuizModal from '$lib/components/QuizModal.svelte';
	import QuizRunner, { type QuizMiss } from '$lib/components/QuizRunner.svelte';
	import QuizReviewList from '$lib/components/QuizReviewList.svelte';
	import { toast } from '$lib/toast.svelte';
	import { loadQuizReview, saveQuizReview, type QuizReview } from '$lib/quiz-review';
	import type { QuizQuestion } from '$lib/curriculum';

	/** Kezdőlapról vagy osztályfalról nyitható kvízfeladat-részletező. */
	export interface TaskDetail {
		id: string;
		classroomId: string;
		title: string;
		dueDate: number;
		roomName: string;
		lessons: { id: string; title: string }[];
		targetPct: number;
		own: boolean;
	}

	interface MySubmission {
		best_score: number;
		best_total: number;
		best_pct: number;
		attempts: number;
		submitted: number;
	}

	interface TaskResultRow {
		user_id: string;
		name: string;
		best_score: number | null;
		best_total: number | null;
		best_pct: number | null;
		attempts: number | null;
		submitted: number | null;
	}

	interface Props {
		task?: TaskDetail | null;
		onClose: () => void;
		/** Beküldés/visszavonás vagy új pontszám után (a szülő újratöltheti a listát). */
		onChanged?: () => void;
	}

	let { task = null, onClose, onChanged }: Props = $props();

	let myResult = $state<MySubmission | null>(null);
	let taskResults = $state<TaskResultRow[]>([]);
	let resultsLoading = $state(false);
	let submitBusy = $state(false);
	/** Utolsó kitöltés átnézete (mit rontott, mi a helyes). */
	let review = $state<QuizReview | null>(null);

	let quizQuestions = $state<QuizQuestion[]>([]);
	let quizOpen = $state(false);
	let quizLoading = $state(false);

	let submitted = $derived((myResult?.submitted ?? 0) === 1);
	let pastDue = $derived(task?.dueDate != null && Date.now() > task.dueDate);
	let submittedCount = $derived(taskResults.filter((r) => (r.submitted ?? 0) === 1).length);

	function fmtDue(ts: number): string {
		try {
			return new Date(ts).toLocaleString('hu-HU', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	}

	async function loadState(t: TaskDetail) {
		resultsLoading = true;
		try {
			const res = await fetch(`/api/classrooms/${t.classroomId}/tasks/${t.id}/submissions`);
			const j = await res.json().catch(() => ({}));
			if (!res.ok) return;
			if (t.own) taskResults = (j.results ?? []) as TaskResultRow[];
			else myResult = (j.mine ?? null) as MySubmission | null;
		} catch {
			// csendben: a drawer tartalma enélkül is látszik
		} finally {
			resultsLoading = false;
		}
	}

	// Feladatváltáskor friss állapot (lezáráskor ürítés).
	$effect(() => {
		const t = task;
		if (t) {
			myResult = null;
			taskResults = [];
			review = loadQuizReview(t.classroomId, t.id);
			void loadState(t);
		} else {
			myResult = null;
			taskResults = [];
			review = null;
			quizOpen = false;
		}
	});

	async function startQuiz() {
		const t = task;
		if (!t || quizLoading) return;
		quizLoading = true;
		try {
			const res = await fetch(`/api/classrooms/${t.classroomId}/tasks/${t.id}/quiz`);
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült összeállítani', j.error ?? 'Próbáld újra!');
				return;
			}
			if (!Array.isArray(j.questions) || j.questions.length === 0) {
				toast.error('Nincs kérdés', 'A leckékhez még nincs kvíz.');
				return;
			}
			quizQuestions = j.questions as QuizQuestion[];
			quizOpen = true;
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			quizLoading = false;
		}
	}

	async function onQuizDone(score: number, total: number, missed: QuizMiss[] = []) {
		const t = task;
		const pct = total > 0 ? Math.round((score / total) * 100) : 0;
		const target = t?.targetPct ?? 80;
		if (!t || t.own) return;
		const r: QuizReview = { score, total, pct, at: Date.now(), missed };
		review = r;
		saveQuizReview(t.classroomId, t.id, r);
		try {
			const res = await fetch(`/api/classrooms/${t.classroomId}/tasks/${t.id}/submissions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ score, total })
			});
			const j = await res.json().catch(() => ({}));
			if (res.ok && j.mine) {
				myResult = j.mine as MySubmission;
				onChanged?.();
			}
		} catch {
			// a pontszám mentése nem kritikus a visszajelzéshez
		}
	}

	async function toggleSubmit(want: boolean) {
		const t = task;
		if (!t || submitBusy) return;
		submitBusy = true;
		try {
			const res = await fetch(`/api/classrooms/${t.classroomId}/tasks/${t.id}/submissions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ submitted: want })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült', j.error ?? 'Próbáld újra!');
				return;
			}
			myResult = (j.mine ?? null) as MySubmission | null;
			toast.success(want ? 'Beküldve!' : 'Visszavonva', t.title || 'Kvízfeladat');
			onChanged?.();
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			submitBusy = false;
		}
	}
</script>

<Drawer
	open={task !== null}
	label="Feladat részletei"
	title={task?.title || 'Kvízfeladat'}
	onClose={onClose}
>
	{#if task}
		{@const t = task}
		<div class="mt-3 grid min-w-0 gap-3 overflow-hidden">
			{#if !t.own}
				<div>
					<Button
						block
						size="lg"
						busy={quizLoading}
						disabled={quizLoading || t.lessons.length === 0}
						onclick={startQuiz}
					>
						<ListChecks size={18} /> {quizLoading ? 'Összeállítás…' : 'Kitöltés'}
					</Button>
				</div>
			{/if}
			{#if t.dueDate}
				{@const late = t.dueDate < Date.now()}
				<p class="flex items-center gap-1.5 text-[13px] font-bold {late ? 'text-red-600 dark:text-red-300' : 'text-stone-500 dark:text-stone-400'}">
					<CalendarDays size={14} />
					{late ? 'Lejárt: ' : 'Határidő: '}{fmtDue(t.dueDate)}
				</p>
			{/if}
			{#if !t.own}
				{#if resultsLoading && !myResult}
					<p class="text-[13px] text-stone-400 dark:text-stone-500">Betöltés…</p>
				{:else}
				<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
					{#if submitted}
						<p class="flex items-center gap-1.5 text-[14px] font-extrabold text-emerald-700 dark:text-emerald-300">
							<Check size={16} /> Beküldve
						</p>
						{#if myResult && myResult.attempts > 0}
							<p class="mt-1 text-[13px] text-stone-500 dark:text-stone-400">
								Legjobb: {myResult.best_score}/{myResult.best_total} ({myResult.best_pct}%)
							</p>
						{/if}
						<div class="mt-2">
							<Button
								variant="outline"
								block
								disabled={submitBusy || pastDue}
								onclick={() => toggleSubmit(false)}
							>
								<Undo2 size={16} /> {submitBusy ? '…' : 'Visszavonom'}
							</Button>
						</div>
						{#if pastDue}
							<p class="mt-1.5 text-[12px] text-stone-400 dark:text-stone-500">
								Határidő után már nem vonható vissza.
							</p>
						{/if}
					{:else}
						{#if myResult && myResult.attempts > 0}
							<p class="text-[14px] font-extrabold text-ink-900 dark:text-white">
								Legjobb: {myResult.best_score}/{myResult.best_total} ({myResult.best_pct}%)
							</p>
							<p class="mt-0.5 text-[13px] text-stone-500 dark:text-stone-400">
								{myResult.attempts} próbálkozás
							</p>
						{:else}
							<p class="text-[13px] text-stone-500 dark:text-stone-400">
								Töltsd ki a kvízt, az eredmény mentődik. A cél alatt is beküldheted.
							</p>
						{/if}
						<div class="mt-2">
							<Button
								block
								disabled={submitBusy || !myResult || myResult.attempts === 0}
								onclick={() => toggleSubmit(true)}
							>
								<Send size={16} /> {submitBusy ? '…' : 'Beküldöm'}
							</Button>
						</div>
					{/if}
				</div>
				{/if}
				{#if review}
					<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
						<QuizReviewList {review} />
						<div class="mt-2.5 grid grid-cols-2 gap-2">
							<Button variant="outline" block disabled={quizLoading} onclick={startQuiz}>
								<RotateCcw size={16} /> Újra
							</Button>
							{#if !submitted}
								<Button
									block
									disabled={submitBusy || pastDue}
									onclick={() => toggleSubmit(true)}
								>
									<Send size={16} /> {submitBusy ? '…' : 'Beküldöm'}
								</Button>
							{/if}
						</div>
					</div>
				{/if}
			{:else}
				<div>
					<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">
						Kitöltések ({submittedCount}/{taskResults.length})
					</p>
					{#if resultsLoading}
						<p class="text-[13px] text-stone-400 dark:text-stone-500">Betöltés…</p>
					{:else if taskResults.length === 0}
						<p class="text-[13px] text-stone-400 dark:text-stone-500">Még senki sem töltötte ki!</p>
					{:else}
						<ul class="grid min-w-0 gap-1.5 overflow-hidden">
							{#each taskResults as r (r.user_id)}
								<li class="flex min-w-0 items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/10">
									<span class="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">
										{r.name}
									</span>
									{#if (r.submitted ?? 0) === 1}
										<span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
											<Check size={12} /> {r.best_pct ?? 0}%
										</span>
									{:else if (r.attempts ?? 0) > 0}
										<span class="shrink-0 text-[12px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
											{r.best_pct ?? 0}%
										</span>
									{:else}
										<span class="shrink-0 text-[12px] text-stone-400 dark:text-stone-500">–</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
			{#if t.lessons.length > 0}
				<div>
					<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">
						Leckék ({t.lessons.length})
					</p>
					<ul class="grid min-w-0 gap-1.5 overflow-hidden">
						{#each t.lessons as l (l.id)}
							<li class="min-w-0">
								<a
									href="/lecke/{l.id}"
									class="block min-w-0 truncate rounded-xl bg-stone-100 px-3 py-2 text-[13px] font-bold text-ink-700 transition hover:bg-stone-200/70 dark:bg-white/10 dark:text-stone-200 dark:hover:bg-white/15"
								>
									{l.title}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}
</Drawer>

<QuizModal
	open={quizOpen}
	label={task?.title || 'Kvíz'}
	title={task?.title || 'Kvízfeladat'}
	onClose={() => (quizOpen = false)}
>
	{#if quizQuestions.length > 0}
		{#key quizQuestions.map((q) => q.id).join(',')}
			<QuizRunner
				questions={quizQuestions}
				title={task?.title || 'Kvízfeladat'}
				targetPct={task?.targetPct ?? null}
				onReview={() => (quizOpen = false)}
				onDone={onQuizDone}
			/>
		{/key}
	{/if}
</QuizModal>
