<script lang="ts">
	import type { InputMode } from './types';
	let { index, mode, value, options, disabled, active, verdict, onChange, onPlace }: {
		index: number; mode: InputMode; value: string; options: string[]; disabled: boolean; active: boolean;
		verdict?: boolean; onChange: (value: string) => void; onPlace: () => void;
	} = $props();
	const tone = $derived(verdict === true ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : verdict === false ? 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200' : 'border-brand-300 bg-white text-ink-900 dark:border-brand-500 dark:bg-stone-900 dark:text-white');
	const style = 'h-11 w-full min-w-0 rounded-lg border-2 px-2 text-sm font-semibold shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-100';
</script>

<span data-fill-slot={index} class="block size-full">
	{#if mode === 'text'}
		<input type="text" aria-label={`${index + 1}. hiányzó válasz`} {disabled} {value} maxlength={200} autocomplete="off" oninput={(event) => onChange(event.currentTarget.value)} class={[style, tone]} placeholder={`${index + 1}. …`} />
	{:else if mode === 'dropdown'}
		<select aria-label={`${index + 1}. hiányzó válasz`} {disabled} {value} onchange={(event) => onChange(event.currentTarget.value)} class={[style, tone]}>
			<option value="">{index + 1}. …</option>
			{#each options as option (option)}<option value={option}>{option}</option>{/each}
		</select>
	{:else}
		<button type="button" {disabled} aria-label={`${index + 1}. válaszhely${value ? `: ${value}` : ''}`} onclick={onPlace} class={[style, tone, 'truncate text-left', active && 'ring-2 ring-brand-400 ring-offset-1']} title={value || 'Húzz ide egy szót, vagy válassz a szólistából'}>{value || `${index + 1}. …`}</button>
	{/if}
</span>
