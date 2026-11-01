<script lang="ts">
	import { CalendarDays, Shuffle, Target } from '@lucide/svelte';
	import type { ContentPick } from '$lib/components/ContentPicker.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import AttachmentList from './AttachmentList.svelte';
	import { step } from './classroom-format';

	let {
		title = $bindable(''),
		lessons = $bindable([] as ContentPick[]),
		questionCount = $bindable(10),
		targetPct = $bindable(80),
		shuffleMode = $bindable('mixed'),
		dueInput = $bindable(''),
		creating,
		error,
		stepperBtn,
		inputCls,
		onSubmit,
		onOpenLessonPicker
	}: {
		title: string;
		lessons: ContentPick[];
		questionCount: number;
		targetPct: number;
		shuffleMode: string;
		dueInput: string;
		creating: boolean;
		error: string | null;
		stepperBtn: string;
		inputCls: string;
		onSubmit: (e: SubmitEvent) => void;
		onOpenLessonPicker: () => void;
	} = $props();
</script>

<form onsubmit={onSubmit} class="mt-3 grid gap-3.5" novalidate>
	<Input label="Feladat címe" placeholder="pl. 3. lecke kvíz (nem kötelező)" bind:value={title} disabled={creating} error={error} />
	<AttachmentList
		kind="task"
		taskItems={lessons}
		disabled={creating}
		onAdd={onOpenLessonPicker}
		onRemoveTask={(t) => (lessons = lessons.filter((x) => x.lessonId !== t.lessonId))}
	/>

	<div class="grid grid-cols-2 gap-3">
		<div>
			<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">Kérdések száma</p>
			<div class="flex items-center gap-2">
				<button type="button" aria-label="Kevesebb kérdés" class={stepperBtn} onclick={() => (questionCount = step(questionCount, -1, 5, 100))}>
					−
				</button>
				<span class="w-10 text-center text-[16px] font-extrabold text-ink-900 tabular-nums dark:text-white">
					{questionCount}
				</span>
				<button type="button" aria-label="Több kérdés" class={stepperBtn} onclick={() => (questionCount = step(questionCount, 1, 5, 100))}>
					+
				</button>
			</div>
		</div>
		<div>
			<p class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
				<Target size={14} /> Célszázalék
			</p>
			<div class="flex items-center gap-2">
				<button type="button" aria-label="Kisebb cél" class={stepperBtn} onclick={() => (targetPct = step(targetPct, -5, 10, 100))}>
					−
				</button>
				<span class="w-10 text-center text-[16px] font-extrabold text-ink-900 tabular-nums dark:text-white">
					{targetPct}%
				</span>
				<button type="button" aria-label="Nagyobb cél" class={stepperBtn} onclick={() => (targetPct = step(targetPct, 5, 10, 100))}>
					+
				</button>
			</div>
		</div>
	</div>

	<div>
		<p class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
			<Shuffle size={14} /> Sorrend
		</p>
		<Segmented
			ariaLabel="Kérdéssorrend"
			bind:value={shuffleMode}
			options={[
				{ value: 'mixed', label: 'Kevert mindenkinek' },
				{ value: 'fixed', label: 'Fix sorrend' }
			]}
		/>
	</div>

	<div>
		<label for="task-due" class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
			<CalendarDays size={14} /> Határidő <span class="font-normal text-stone-400">(üresen hagyható)</span>
		</label>
		<input
			id="task-due"
			type="datetime-local"
			bind:value={dueInput}
			disabled={creating}
			class={[inputCls, 'dark:[color-scheme:dark]']}
		/>
	</div>

	<Button type="submit" block busy={creating} disabled={lessons.length === 0}>
		{creating ? 'Kiosztás…' : 'Feladat kiosztása'}
	</Button>
</form>
