<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { cardInput, pickRowBtn } from './library-ui';

	interface Props {
		open: boolean;
		onClose: () => void;
		dTitle: string;
		dSubjectTitle: string;
		dLevelLabel: string;
		dLevelTitle: string;
		dSubject: string;
		dBusy: boolean;
		onPickSubject: () => void;
		onPickLevel: () => void;
		onSave: () => void;
	}

	let {
		open,
		onClose,
		dTitle = $bindable(),
		dSubjectTitle,
		dLevelLabel,
		dLevelTitle,
		dSubject,
		dBusy,
		onPickSubject,
		onPickLevel,
		onSave
	}: Props = $props();
</script>

<Sheet {open} label="Új kártyacsomag" title="Új kártyacsomag" {onClose}>
	<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Alapértelmezetten csak te látod.</p>
	<label class="mt-4 block text-[13px] font-semibold text-ink-900 dark:text-white" for="deck-title">
		Cím
		<input
			id="deck-title"
			bind:value={dTitle}
			placeholder="Pl. Angol szavak 1"
			class="mt-1.5 {cardInput} w-full"
		/>
	</label>
	<div class="mt-3 grid gap-2">
		<button type="button" onclick={onPickSubject} class={pickRowBtn}>
			<span class="min-w-0 flex-1">
				<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Tantárgy</span>
				<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
					{dSubjectTitle || 'Válassz…'}
				</span>
			</span>
			<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
		</button>
		<button type="button" onclick={onPickLevel} disabled={!dSubject} class={pickRowBtn}>
			<span class="min-w-0 flex-1">
				<span class="block text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">{dLevelLabel}</span>
				<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
					{dLevelTitle || 'Válassz…'}
				</span>
			</span>
			<ChevronDown size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
		</button>
	</div>
	<div class="mt-4">
		<Button block size="lg" disabled={dBusy} onclick={onSave}>
			{dBusy ? 'Mentés…' : 'Csomag létrehozása'}
		</Button>
	</div>
</Sheet>
