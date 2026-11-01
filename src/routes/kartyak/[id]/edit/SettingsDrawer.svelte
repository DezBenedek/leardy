<script lang="ts">
	import { ChevronDown, Trash2, X } from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import type { ContentPick } from '$lib/components/ContentPicker.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Switch from '$lib/ui/Switch.svelte';
	import { inputCls, pickRowBtn } from './edit-ui';

	interface Props {
		open: boolean;
		onClose: () => void;
		loading: boolean;
		loadError: string | null;
		title: string;
		subjectTitle: string;
		levelTitle: string;
		levelLabel: string;
		autoKindLabel: string;
		isTeacher: boolean;
		isPublic: boolean;
		attachedLessons: ContentPick[];
		saving: boolean;
		subjectId: string;
		onPickSubject: () => void;
		onPickLevel: () => void;
		onOpenLessonPicker: () => void;
		onRemoveLesson: (id: string) => void;
		onDelete: () => void;
	}

	let {
		open,
		onClose,
		loading,
		loadError,
		title = $bindable(),
		subjectTitle,
		levelTitle,
		levelLabel,
		autoKindLabel,
		isTeacher,
		isPublic = $bindable(),
		attachedLessons,
		saving,
		subjectId,
		onPickSubject,
		onPickLevel,
		onOpenLessonPicker,
		onRemoveLesson,
		onDelete
	}: Props = $props();
</script>

<Drawer {open} label="Csomag beállításai" title="Beállítások" {onClose}>
	{#if !loading && !loadError}
		<label class="mt-2 block text-[13px] font-semibold text-ink-900 dark:text-white" for="deck-name">
			Név
			<input
				id="deck-name"
				bind:value={title}
				placeholder="Pl. Angol szavak 1"
				maxlength={80}
				class="mt-1.5 {inputCls}"
			/>
		</label>
		<div class="mt-4 grid gap-2">
			<button type="button" onclick={onPickSubject} class={pickRowBtn}>
				<span class="min-w-0 flex-1">
					<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Tantárgy</span>
					<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
						{subjectTitle || 'Válassz…'}
					</span>
				</span>
				<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
			</button>
			<button type="button" onclick={onPickLevel} disabled={!subjectId} class={pickRowBtn}>
				<span class="min-w-0 flex-1">
					<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">{levelLabel}</span>
					<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
						{levelTitle || 'Válassz…'}
					</span>
				</span>
				<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
			</button>
		</div>

		<p class="mt-4 text-[13px] font-semibold text-ink-900 dark:text-white">
			Kártyák típusa: {autoKindLabel}
		</p>

		{#if isTeacher}
			<div class="mt-3 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-transparent">
				<span class="min-w-0 flex-1">
					<span class="block text-[14px] font-extrabold text-ink-900 dark:text-white">Publikálva</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">
						Mindenki látja a Felfedezésben és a csatolt leckénél
					</span>
				</span>
				<Switch id="deck-published" bind:checked={isPublic} label="Publikálva" />
			</div>

			<p class="mt-4 text-[13px] font-semibold text-ink-900 dark:text-white">
				Csatolás <span class="font-normal text-stone-400 dark:text-stone-500">(opcionális, több lecke is lehet)</span>
			</p>
			<div class="mt-1.5 grid gap-2">
				<button type="button" onclick={onOpenLessonPicker} class={pickRowBtn}>
					<span class="min-w-0 flex-1">
						<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Leckék</span>
						<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
							{attachedLessons.length > 0 ? `${attachedLessons.length} lecke csatolva` : 'Nincs csatolva'}
						</span>
					</span>
					<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
				</button>
				{#if attachedLessons.length > 0}
					<ul class="grid gap-1.5">
						{#each attachedLessons as a (a.lessonId)}
							<li class="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-transparent">
								<span class="min-w-0 flex-1">
									<span class="block truncate text-[13px] font-bold text-ink-900 dark:text-white">
										{a.lessonTitle}
									</span>
									<span class="block truncate text-[11px] font-medium text-stone-500 dark:text-stone-400">
										{a.crumb}
									</span>
								</span>
								<button
									type="button"
									onclick={() => onRemoveLesson(a.lessonId)}
									aria-label="{a.lessonTitle} csatolás törlése"
									class="grid size-8 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
								>
									<X size={15} />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else}
			<p class="mt-4 rounded-2xl bg-stone-100 px-3 py-2.5 text-[12px] font-medium text-stone-500 dark:bg-white/5 dark:text-stone-400">
				A csomagod privát: csak te látod. Leckéhez csatolni és publikálni csak tanár tud.
			</p>
		{/if}

		<div class="mt-6 border-t border-stone-200 pt-4 dark:border-white/10">
			<Button variant="outline" block disabled={saving} onclick={onDelete}>
				<Trash2 size={16} />
				Csomag törlése
			</Button>
		</div>
	{/if}
</Drawer>
