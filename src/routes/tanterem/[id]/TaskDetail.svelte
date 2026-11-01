<script lang="ts">
	import { CalendarDays, Check, ListChecks, RotateCcw, Send, Target, Undo2 } from '@lucide/svelte';
	import { lessonPath } from '$lib/curriculum/lesson-paths';
	import type { ContentPick } from '$lib/components/ContentPicker.svelte';
	import type { QuizReview } from '$lib/quiz/quiz-review';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import QuizReviewList from '$lib/components/QuizReviewList.svelte';
	import AttachmentList from './AttachmentList.svelte';
	import { fmtDate, step } from './classroom-format';
	import { parseTaskLessons, type FeedTask } from './classroom-task-utils';

	interface MySubmission {
		best_score: number;
		best_total: number;
		best_pct: number;
		attempts: number;
		submitted: number;
		submitted_at: number | null;
	}

	interface TaskResultRow {
		user_id: string;
		name: string;
		best_score: number | null;
		best_total: number | null;
		best_pct: number | null;
		attempts: number | null;
		submitted: number | null;
		submitted_at: number | null;
	}

	let {
		task,
		isOwner,
		myResult,
		taskResults,
		resultsLoading,
		submitBusy,
		quizLoading,
		lastReview,
		editing = $bindable(false),
		editTitle = $bindable(''),
		editLessons = $bindable([] as ContentPick[]),
		editCount = $bindable(10),
		editTarget = $bindable(80),
		editDue = $bindable(''),
		saving,
		editError,
		stepperBtn,
		inputCls,
		onStartQuiz,
		onToggleSubmit,
		onSaveEdit,
		onCancelEdit,
		onOpenLessonPicker
	}: {
		task: FeedTask;
		isOwner: boolean;
		myResult: MySubmission | null;
		taskResults: TaskResultRow[];
		resultsLoading: boolean;
		submitBusy: boolean;
		quizLoading: boolean;
		lastReview: QuizReview | null;
		editing: boolean;
		editTitle: string;
		editLessons: ContentPick[];
		editCount: number;
		editTarget: number;
		editDue: string;
		saving: boolean;
		editError: string | null;
		stepperBtn: string;
		inputCls: string;
		onStartQuiz: () => void;
		onToggleSubmit: (want: boolean) => void;
		onSaveEdit: (e: SubmitEvent) => void;
		onCancelEdit: () => void;
		onOpenLessonPicker: () => void;
	} = $props();

	const lessons = $derived(parseTaskLessons(task));
	const submitted = $derived((myResult?.submitted ?? 0) === 1);
	const pastDue = $derived(task.due_date !== null && Date.now() > (task.due_date ?? 0));
	const submittedCount = $derived(taskResults.filter((r) => (r.submitted ?? 0) === 1).length);
</script>

{#if editing}
	<form id="edit-task" onsubmit={onSaveEdit} class="mt-3 grid gap-3.5" novalidate>
		<Input label="Feladat címe" placeholder="pl. 3. lecke kvíz" bind:value={editTitle} disabled={saving} error={editError} />
		<AttachmentList
			kind="task"
			taskItems={editLessons}
			disabled={saving}
			onAdd={onOpenLessonPicker}
			onRemoveTask={(t) => (editLessons = editLessons.filter((x) => x.lessonId !== t.lessonId))}
		/>
		<div class="grid grid-cols-2 gap-3">
			<div>
				<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">Kérdések száma</p>
				<div class="flex items-center gap-2">
					<button type="button" aria-label="Kevesebb kérdés" class={stepperBtn} onclick={() => (editCount = step(editCount, -1, 1, 100))}>
						−
					</button>
					<span class="w-10 text-center text-[16px] font-extrabold text-ink-900 tabular-nums dark:text-white">
						{editCount}
					</span>
					<button type="button" aria-label="Több kérdés" class={stepperBtn} onclick={() => (editCount = step(editCount, 1, 1, 100))}>
						+
					</button>
				</div>
			</div>
			<div>
				<p class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
					<Target size={14} /> Cél
				</p>
				<div class="flex items-center gap-2">
					<button type="button" aria-label="Kisebb cél" class={stepperBtn} onclick={() => (editTarget = step(editTarget, -5, 10, 100))}>
						−
					</button>
					<span class="w-10 text-center text-[16px] font-extrabold text-ink-900 tabular-nums dark:text-white">
						{editTarget}%
					</span>
					<button type="button" aria-label="Nagyobb cél" class={stepperBtn} onclick={() => (editTarget = step(editTarget, 5, 10, 100))}>
						+
					</button>
				</div>
			</div>
		</div>
		<div>
			<label for="edit-task-due" class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
				<CalendarDays size={14} /> Határidő <span class="font-normal text-stone-400">(üresen hagyható)</span>
			</label>
			<input
				id="edit-task-due"
				type="datetime-local"
				bind:value={editDue}
				disabled={saving}
				class={[inputCls, 'dark:[color-scheme:dark]']}
			/>
		</div>
		<div class="grid gap-2.5">
			<Button variant="outline" block disabled={saving} onclick={onCancelEdit}>
				Mégse
			</Button>
		</div>
	</form>
{:else}
	<div class="mt-3 grid min-w-0 gap-3 overflow-hidden">
		{#if !isOwner}
			<div>
				<Button
					block
					size="lg"
					busy={quizLoading}
					disabled={quizLoading || lessons.length === 0}
					onclick={onStartQuiz}
				>
					<ListChecks size={18} /> {quizLoading ? 'Összeállítás…' : 'Kitöltés'}
				</Button>
			</div>
		{/if}
		{#if task.due_date}
			{@const late = task.due_date < Date.now()}
			<p class="flex items-center gap-1.5 text-[13px] font-bold {late ? 'text-red-600 dark:text-red-300' : 'text-stone-500 dark:text-stone-400'}">
				<CalendarDays size={14} />
				{late ? 'Lejárt: ' : 'Határidő: '}{fmtDate(task.due_date)}
			</p>
		{/if}
		{#if !isOwner}
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
						<Button
							variant="outline"
							block
							disabled={submitBusy || pastDue}
							onclick={() => onToggleSubmit(false)}
						>
							<Undo2 size={16} /> {submitBusy ? '…' : 'Visszavonom'}
						</Button>
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
								onclick={() => onToggleSubmit(true)}
							>
								<Send size={16} /> {submitBusy ? '…' : 'Beküldöm'}
							</Button>
						</div>
					{/if}
				</div>
			{/if}
			{#if lastReview}
				<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
					<QuizReviewList review={lastReview} />
					<div class="mt-2.5 grid grid-cols-2 gap-2">
						<Button
							variant="outline"
							block
							disabled={quizLoading}
							onclick={onStartQuiz}
						>
							<RotateCcw size={16} /> Újra
						</Button>
						{#if !submitted}
							<Button
								block
								disabled={submitBusy || pastDue}
								onclick={() => onToggleSubmit(true)}
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
		{#if lessons.length > 0}
			<div>
				<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">
					Leckék ({lessons.length})
				</p>
				<ul class="grid min-w-0 gap-1.5 overflow-hidden">
					{#each lessons as l (l.id)}
						<li class="min-w-0">
							<a
								href={lessonPath(l.id)}
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
