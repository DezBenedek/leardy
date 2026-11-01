<script lang="ts">
	import { ChevronDown, Trash2 } from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
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
		saving: boolean;
		subjectId: string;
		onPickSubject: () => void;
		onPickLevel: () => void;
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
		saving,
		subjectId,
		onPickSubject,
		onPickLevel,
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
						Mindenki látja a Felfedezésben
					</span>
				</span>
				<Switch id="deck-published" bind:checked={isPublic} label="Publikálva" />
			</div>
		{:else}
			<p class="mt-4 rounded-2xl bg-stone-100 px-3 py-2.5 text-[12px] font-medium text-stone-500 dark:bg-white/5 dark:text-stone-400">
				A csomagod privát: csak te látod. Publikálni csak tanár tud.
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
