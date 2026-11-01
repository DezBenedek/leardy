<script lang="ts">
	import { Bell, Check } from '@lucide/svelte';
	import Toggle from '$lib/components/Toggle.svelte';
	import type { AppSettings } from '$lib/state/settings';
	import type { PushState } from '$lib/platform/push-client';

	interface Props {
		settings: AppSettings;
		pushSt: PushState;
		pushKnown: boolean;
		pushBusy: boolean;
		mutedLoading: boolean;
		classroomNames: Record<string, string>;
		onEnablePush: () => void;
		onReminderTime: (e: Event) => void;
		onUnmuteClassroom: (id: string) => void;
		onUnmuteAll: () => void;
		mutedName: (id: string) => string;
	}

	let {
		settings,
		pushSt,
		pushKnown,
		pushBusy,
		mutedLoading,
		classroomNames,
		onEnablePush,
		onReminderTime,
		onUnmuteClassroom,
		onUnmuteAll,
		mutedName
	}: Props = $props();
</script>

<div class="mt-1">
	<div class="flex min-h-14 items-center gap-3 py-2" aria-live="polite">
		<Bell size={21} class="shrink-0 text-stone-400" aria-hidden="true" />
		<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Push üzenetek</p>
		{#if pushKnown && pushSt === 'on'}
			<span role="img" aria-label="Push üzenetek aktívak" class="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
				<Check size={23} strokeWidth={3} aria-hidden="true" />
			</span>
		{:else}
			<button type="button" onclick={onEnablePush} disabled={!pushKnown || pushBusy}
				class="min-h-11 shrink-0 rounded-full bg-brand-500 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60">
				{pushBusy ? 'Aktiválás…' : !pushKnown ? 'Ellenőrzés…' : 'Aktiválás'}
			</button>
		{/if}
	</div>

	<p class="mt-5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Tantermi értesítések</p>
	<ul class="divide-y divide-stone-100 dark:divide-white/5">
		<li class="flex items-center gap-3 py-3">
			<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Tantermi üzenetek</p>
			<Toggle bind:checked={settings.pushClassMessage} label="Tantermi üzenetek" />
		</li>
		<li class="flex items-center gap-3 py-3">
			<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Feladatok és beadandók</p>
			<Toggle bind:checked={settings.pushClassTask} label="Feladatok és beadandók" />
		</li>
		<li class="flex items-center gap-3 py-3">
			<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Jegyek és visszajelzések</p>
			<Toggle bind:checked={settings.pushGrades} label="Jegyek és visszajelzések" />
		</li>
	</ul>

	<p class="mt-5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Emlékeztetők</p>
	<ul class="divide-y divide-stone-100 dark:divide-white/5">
		<li class="py-3">
			<div class="flex items-center gap-3">
				<div class="min-w-0 flex-1">
					<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Napi emlékeztető</p>
				</div>
				<Toggle bind:checked={settings.reminder} label="Napi emlékeztető" />
			</div>
			{#if settings.reminder}
				<label class="mt-3 flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2 dark:bg-white/5">
					<span class="text-[13px] font-medium text-stone-500 dark:text-stone-400">Időpont</span>
					<input type="time" value={settings.reminderTime} onchange={onReminderTime} aria-label="Napi időpont"
						class="min-h-11 w-[118px] rounded-lg border border-stone-200 bg-white px-3 py-2 text-center text-[15px] font-semibold text-ink-900 tabular-nums outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white" />
				</label>
			{/if}
		</li>
		<li class="flex items-center gap-3 py-3">
			<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Határidőfigyelő</p>
			<Toggle bind:checked={settings.dueSoon} label="Határidőfigyelő" />
		</li>
		<li class="flex items-center gap-3 py-3">
			<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Újdonságok</p>
			<Toggle bind:checked={settings.pushFeatures} label="Újdonságok" />
		</li>
	</ul>

	{#if settings.mutedClassrooms.length > 0}
		<p class="mt-5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Némított osztályok</p>
		<div class="mt-2 flex items-center justify-end">
			<button
				type="button"
				onclick={onUnmuteAll}
				class="shrink-0 rounded-full border border-stone-200 px-3.5 py-2 text-[13px] font-bold text-ink-600 dark:border-white/15 dark:text-stone-300"
			>
				Mind feloldom
			</button>
		</div>
		<ul class="mt-2 grid gap-1.5">
			{#each settings.mutedClassrooms as id (id)}
				<li class="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/5">
					<span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-stone-600 dark:text-stone-300">
						{mutedLoading && !classroomNames[id] ? 'Betöltés…' : mutedName(id)}
					</span>
					<button
						type="button"
						onclick={() => onUnmuteClassroom(id)}
						class="shrink-0 text-[13px] font-bold text-brand-600 dark:text-brand-400"
					>
						Feloldom
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
