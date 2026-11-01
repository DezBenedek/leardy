<script lang="ts">
	import { HardDrive } from '@lucide/svelte';
	import { fmtBytes } from './settings-ui';
	import type { StorageInfo } from './storage-settings';

	interface Props {
		storageInfo: StorageInfo;
		storageBusy: boolean;
		onClearOffline: () => void;
		onClearAll: () => void;
	}

	let { storageInfo, storageBusy, onClearOffline, onClearAll }: Props = $props();
</script>

<div class="mt-3">
	<div class="rounded-2xl border border-stone-200 p-4 dark:border-white/10">
		<p class="flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
			<HardDrive size={13} /> Helyi adatok
		</p>
		<p class="mt-1 text-[20px] font-extrabold text-ink-900 tabular-nums dark:text-white">
			{fmtBytes(storageInfo.total)}
		</p>
		<ul class="mt-2 grid gap-1 text-[13px] text-stone-500 dark:text-stone-400">
			<li class="flex items-center justify-between gap-2">
				<span>Offline kártyakönyvtár</span>
				<span class="font-bold text-ink-900 tabular-nums dark:text-white">{fmtBytes(storageInfo.lib)}</span>
			</li>
			<li class="flex items-center justify-between gap-2">
				<span>Oldalszűrők</span>
				<span class="font-bold text-ink-900 tabular-nums dark:text-white">{fmtBytes(storageInfo.scope)}</span>
			</li>
			<li class="flex items-center justify-between gap-2">
				<span>Értesítési jelzők</span>
				<span class="font-bold text-ink-900 tabular-nums dark:text-white">{fmtBytes(storageInfo.seen)}</span>
			</li>
		</ul>
		<p class="mt-2 text-[12px] leading-relaxed text-stone-400 dark:text-stone-500">
			A beállításaid megmaradnak.
		</p>
	</div>
	<div class="mt-2.5 grid gap-2">
		<button
			type="button"
			onclick={onClearOffline}
			disabled={storageBusy || storageInfo.lib === 0}
			class="flex w-full items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-[15px] font-bold text-ink-900 transition hover:bg-stone-50 active:scale-[0.99] disabled:opacity-50 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
		>
			{storageBusy ? 'Ürítés…' : 'Offline tárhely ürítése'}
		</button>
		<button
			type="button"
			onclick={onClearAll}
			disabled={storageBusy || storageInfo.total === 0}
			class="flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-[15px] font-bold text-red-600 transition hover:bg-red-50 active:scale-[0.99] disabled:opacity-50 dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
		>
			{storageBusy ? 'Ürítés…' : 'Összes gyorstár ürítése'}
		</button>
	</div>
</div>
