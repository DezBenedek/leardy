<script lang="ts">
	import { BookMarked, BookOpen, GraduationCap, Layers, Plus, Target, X } from '@lucide/svelte';
	import { attachmentTitle } from '$lib/content/message-attachments';
	import type { AttachPick } from '$lib/components/AttachSheet.svelte';
	import type { ContentPick } from '$lib/components/ContentPicker.svelte';
	import { taskLessonTitle } from './classroom-task-utils';

	const attachIcons: Record<string, typeof BookOpen> = {
		subject: GraduationCap,
		lesson: BookOpen,
		quiz: Target,
		deck: Layers,
		topic: BookMarked
	};

	let {
		kind,
		messageItems = [],
		taskItems = [],
		disabled,
		displaySubject = '',
		onAdd,
		onRemoveMessage,
		onRemoveTask
	}: {
		kind: 'message' | 'task';
		messageItems?: AttachPick[];
		taskItems?: ContentPick[];
		disabled: boolean;
		displaySubject?: string;
		onAdd: () => void;
		onRemoveMessage?: (item: AttachPick) => void;
		onRemoveTask?: (item: ContentPick) => void;
	} = $props();
</script>

{#if kind === 'message'}
	<div>
		<div class="mb-1.5 flex items-center justify-between gap-2">
			<p class="text-[13px] font-semibold text-ink-900 dark:text-white">Csatolmány</p>
			<button
				type="button"
				onclick={onAdd}
				disabled={disabled}
				aria-label="Csatolmány választása"
				class="grid size-8 place-items-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95 disabled:pointer-events-none disabled:opacity-60 dark:shadow-black/30"
			>
				<Plus size={18} strokeWidth={3} />
			</button>
		</div>
		{#if messageItems.length > 0}
			<ul class="grid min-w-0 gap-2">
				{#each messageItems as a (a.type + ':' + a.id)}
					{@const AIcon = attachIcons[a.type] ?? BookOpen}
					<li class="flex min-w-0 items-center gap-2 rounded-2xl border border-brand-500/40 bg-brand-50 p-3 dark:bg-brand-500/15">
						<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-white">
							<AIcon size={17} />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
								{a.type === 'deck' ? a.crumb : attachmentTitle(a.crumb, displaySubject)}
							</span>
						</span>
						<button
							type="button"
							onclick={() => onRemoveMessage?.(a)}
							disabled={disabled}
							aria-label="Csatolmány törlése"
							class="grid size-8 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-black/5 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
						>
							<X size={17} />
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-[13px] text-stone-400 dark:text-stone-500">
				A + gombbal csatolhatsz leckét, kvízt, kártyát vagy témakört, akár többet is.
			</p>
		{/if}
	</div>
{:else}
	<div>
		<div class="mb-1.5 flex items-center justify-between gap-2">
			<p class="text-[13px] font-semibold text-ink-900 dark:text-white">
				Leckék{#if taskItems.length > 0} ({taskItems.length}){/if}
			</p>
			<button
				type="button"
				onclick={onAdd}
				disabled={disabled}
				aria-label="Leckék választása"
				class="grid size-8 place-items-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95 disabled:pointer-events-none disabled:opacity-60 dark:shadow-black/30"
			>
				<Plus size={18} strokeWidth={3} />
			</button>
		</div>
		{#if taskItems.length > 0}
			<ul class="grid min-w-0 gap-1.5">
				{#each taskItems as t (t.lessonId)}
					<li class="flex min-w-0 items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/10">
						<Target size={16} class="shrink-0 text-stone-500" />
						<span class="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">
							{taskLessonTitle(t)}
						</span>
						<button
							type="button"
							onclick={() => onRemoveTask?.(t)}
							disabled={disabled}
							aria-label="Lecke kivétele"
							class="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-black/5 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
						>
							<X size={15} />
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-[13px] text-stone-400 dark:text-stone-500">
				A + gombbal válassz kvízes leckéket, akár több témakörből is.
			</p>
		{/if}
	</div>
{/if}
