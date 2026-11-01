<script lang="ts">
	import { CalendarDays, Copy, LogOut, RefreshCw, Save, Trash2, TrendingUp, Users } from '@lucide/svelte';
	import type { Subject } from '$lib/curriculum/curriculum';
	import Button from '$lib/ui/Button.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Switch from '$lib/ui/Switch.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import SubjectPicker from '$lib/components/SubjectPicker.svelte';
	import { fmtDateOnly } from './classroom-format';

	let {
		open,
		isOwner,
		roomNotif = $bindable(true),
		setName = $bindable(''),
		setSubjectId = $bindable(''),
		subjects,
		membersCount,
		createdAt,
		displayCode,
		displayName,
		displaySubject,
		membersLabel,
		saving,
		regenBusy,
		confirmLeave,
		leaving,
		onClose,
		onSave,
		onCopyCode,
		onRegenCode,
		onOpenMembers,
		onOpenStats,
		onDeleteRequest,
		onLeaveRequest
	}: {
		open: boolean;
		isOwner: boolean;
		roomNotif: boolean;
		setName: string;
		setSubjectId: string;
		subjects: Subject[];
		membersCount: number;
		createdAt: number;
		displayCode: string;
		displayName: string;
		displaySubject: string;
		membersLabel: string;
		saving: boolean;
		regenBusy: boolean;
		confirmLeave: boolean;
		leaving: boolean;
		onClose: () => void;
		onSave: (e: SubmitEvent) => void;
		onCopyCode: () => void;
		onRegenCode: () => void;
		onOpenMembers: () => void;
		onOpenStats: () => void;
		onDeleteRequest: () => void;
		onLeaveRequest: () => void;
	} = $props();
</script>

<Drawer {open} label="Osztálybeállítások" title="Osztálybeállítások" onClose={onClose}>
	{#snippet actions()}
		{#if isOwner}
			<Button type="submit" form="classroom-settings" size="sm" busy={saving} disabled={setName.trim().length < 3} ariaLabel="Osztálybeállítások mentése"><Save size={17} /> Mentés</Button>
		{/if}
	{/snippet}
	{#if isOwner}
		<div class="mt-3 flex items-center gap-3">
			<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Értesítés</p>
			<Switch bind:checked={roomNotif} label="Értesítés" />
		</div>
		<form id="classroom-settings" onsubmit={onSave} class="mt-3 grid gap-3.5" novalidate>
			<Input label="Osztály neve" required bind:value={setName} disabled={saving} />
			<div>
				<SubjectPicker {subjects} bind:value={setSubjectId} disabled={saving} />
			</div>
			<div class="grid grid-cols-2 gap-2.5">
				<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
					<p class="flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
						<Users size={13} /> Tagok
					</p>
					<p class="mt-1 text-[20px] font-extrabold text-ink-900 tabular-nums dark:text-white">
						{membersCount}
					</p>
				</div>
				<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
					<p class="flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
						<CalendarDays size={13} /> Létrehozva
					</p>
					<p class="mt-1 text-[15px] font-extrabold text-ink-900 dark:text-white">
						{fmtDateOnly(createdAt)}
					</p>
				</div>
			</div>
			<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
				<p class="text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
					Csatlakozási kód
				</p>
				<div class="mt-1.5 flex items-center justify-between gap-2">
					<p class="font-mono text-[24px] font-extrabold tracking-[0.2em] text-ink-900 dark:text-white">
						{displayCode}
					</p>
					<div class="flex shrink-0 gap-2">
						<IconButton ariaLabel="Kód másolása" size={40} onclick={onCopyCode}>
							<Copy size={18} />
						</IconButton>
						<IconButton ariaLabel="Új kód generálása" size={40} disabled={regenBusy} onclick={onRegenCode}>
							<RefreshCw size={18} />
						</IconButton>
					</div>
				</div>
			</div>
			<Button variant="outline" block onclick={onOpenMembers}>
				<Users size={17} /> Tagok ({membersCount})
			</Button>
			<Button variant="outline" block onclick={onOpenStats}>
				<TrendingUp size={17} /> Statisztika
			</Button>
		</form>
		<button
			type="button"
			onclick={onDeleteRequest}
			class="mt-4 flex w-full items-center gap-3 rounded-2xl border border-red-200 p-4 text-left transition hover:bg-red-50 active:scale-[0.99] dark:border-red-500/30 dark:hover:bg-red-500/10"
		>
			<span class="min-w-0 flex-1">
				<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Osztály törlése</span>
				<span class="block text-[13px] text-stone-500 dark:text-stone-400">
					Az üzenetek és feladatok is törlődnek.
				</span>
			</span>
			<span class="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300">
				<Trash2 size={18} />
			</span>
		</button>
	{:else}
		<div class="mt-3 flex items-center gap-3">
			<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Értesítés</p>
			<Switch bind:checked={roomNotif} label="Értesítés" />
		</div>
		<div class="mt-2.5 rounded-2xl border border-stone-200 p-4 dark:border-white/10">
			<p class="text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Osztály</p>
			<p class="mt-1 truncate text-[15px] font-bold text-ink-900 dark:text-white">{displayName}</p>
			<p class="mt-0.5 text-[13px] text-stone-500 dark:text-stone-400">
				{membersLabel}
			</p>
		</div>
		<div class="mt-2.5">
			<Button variant="outline" block onclick={onOpenMembers}>
				<Users size={17} /> Tagok ({membersCount})
			</Button>
		</div>
		{#if !confirmLeave}
			<button
				type="button"
				onclick={onLeaveRequest}
				class="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-red-600 transition hover:bg-red-50 active:scale-[0.99] dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
			>
				<LogOut size={17} />
				Kilépés az osztályból
			</button>
		{/if}
	{/if}
</Drawer>
