<script lang="ts">
	import { ChevronRight, MessageCircle, Sparkles } from '@lucide/svelte';
	import { APP_VERSION, appBuildLabel } from '$lib/app/version';
	import { LATEST_CHANGE } from '$lib/app/changelog';
	import { tile } from './settings-ui';

	interface Props {
		onOpenWhatsNew: () => void;
	}

	let { onOpenWhatsNew }: Props = $props();
</script>

<div class="mt-3">
	<div class="flex items-center justify-between py-2.5">
		<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Verzió</p>
		<p class="text-sm text-ink-400 tabular-nums dark:text-stone-500">{APP_VERSION}</p>
	</div>
	<div class="flex items-center justify-between py-2.5">
		<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Utolsó frissítés</p>
		<p class="text-sm text-ink-400 tabular-nums dark:text-stone-500">{appBuildLabel()}</p>
	</div>
	<button
		type="button"
		onclick={onOpenWhatsNew}
		class="mt-1 flex w-full items-center gap-3 rounded-2xl bg-brand-50 p-4 text-left transition hover:bg-brand-100 active:scale-[0.99] dark:bg-brand-500/15 dark:hover:bg-brand-500/25"
	>
		<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-500 text-white">
			<Sparkles size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Újdonságok</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">
				Frissítés - {LATEST_CHANGE.version}: {LATEST_CHANGE.title.toLowerCase()}
			</span>
		</span>
		<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
	</button>
	<a
		href="mailto:hello@leardy.app?subject=Leardy%20visszajelz%C3%A9s%20({APP_VERSION})"
		class="mt-2.5 flex w-full items-center gap-3 rounded-2xl border border-stone-200 p-4 text-left transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:hover:bg-white/5"
	>
		<span class={tile}>
			<MessageCircle size={22} />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Visszajelzés küldése</span>
			<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">Hiba vagy ötlet? Írj nekünk emailt.</span>
		</span>
		<ChevronRight size={19} class="shrink-0 text-stone-300 dark:text-stone-600" />
	</a>
	<div class="mt-2.5 rounded-xl bg-stone-100 p-3.5 dark:bg-white/5">
		<p class="text-[13px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Fejlesztők</p>
		<p class="mt-1.5 text-[15px] font-semibold text-ink-900 dark:text-white">
			<a
				href="https://dezso.hu"
				target="_blank"
				rel="noopener noreferrer"
				class="text-brand-600 underline decoration-brand-300 underline-offset-2 dark:text-brand-400"
			>
				Dezső Benedek Péter
			</a>
			<span class="font-normal text-ink-600 dark:text-stone-400"> és</span>
			<a
				href="https://www.facebook.com/bercel.fidrich.5"
				target="_blank"
				rel="noopener noreferrer"
				class="text-brand-600 underline decoration-brand-300 underline-offset-2 dark:text-brand-400"
			>
				Fidrich Bercel
			</a>
		</p>
	</div>
	<p class="mt-2.5 rounded-xl bg-stone-100 p-3.5 text-[13px] leading-relaxed text-ink-600 dark:bg-white/5 dark:text-stone-400">
		A Ferences Ösztöndíj Programra készült a 2026/27-es tanévben.
	</p>
</div>
