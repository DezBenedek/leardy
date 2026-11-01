<script lang="ts">
	import FontFamilyPicker from '$lib/components/FontFamilyPicker.svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import { theme } from '$lib/state/theme.svelte';
	import type { AppSettings } from '$lib/state/settings';
	import { themeOptions } from './settings-ui';

	interface Props {
		settings: AppSettings;
	}

	let { settings }: Props = $props();
</script>

<p class="mt-3 text-[13px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Téma</p>
<div
	role="radiogroup"
	aria-label="Téma"
	class="mt-2 grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1 dark:bg-white/10"
>
	{#each themeOptions as opt (opt.id)}
		{@const Icon = opt.icon}
		{@const selected = theme.choice === opt.id}
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			onclick={() => theme.set(opt.id)}
			class={[
				'flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 transition active:scale-[0.97]',
				selected
					? 'bg-white text-ink-900 shadow-sm dark:bg-stone-800 dark:text-white dark:shadow-black/40'
					: 'text-stone-500 hover:text-ink-900 dark:text-stone-400 dark:hover:text-white'
			]}
		>
			<Icon size={20} />
			<span class={['text-[13px] leading-none', selected ? 'font-extrabold' : 'font-semibold']}>
				{opt.label}
			</span>
		</button>
	{/each}
</div>
<div class="mt-3">
	<FontFamilyPicker bind:value={settings.fontFamily} label="Betűtípus" />
</div>
<ul class="mt-3 divide-y divide-stone-100 dark:divide-white/5">
	<li class="flex items-center gap-3 py-3">
		<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Mozgás csökkentése</p>
		<Toggle bind:checked={settings.reduceMotion} label="Mozgás csökkentése" />
	</li>
	<li class="flex items-center gap-3 py-3">
		<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Kompakt lista</p>
		<Toggle bind:checked={settings.compactList} label="Kompakt lista" />
	</li>
</ul>
