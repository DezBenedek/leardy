<script lang="ts">
	import { ChevronRight, Database, LogOut, Pencil, Trash2 } from '@lucide/svelte';
	import GoogleLoginButton from '$lib/components/GoogleLoginButton.svelte';
	import type { User } from '$lib/state/auth.svelte';

	interface Props {
		user: User | null;
		initial: string;
		exportBusy: boolean;
		onExport: () => void;
		onDeleteRequest: () => void;
		onLogout: () => void;
		onEditName: () => void;
	}

	let { user, initial, exportBusy, onExport, onDeleteRequest, onLogout, onEditName }: Props = $props();
</script>

<div class="mt-3">
	{#if user}
		<div class="flex items-center gap-3.5">
			<span class="grid size-12 shrink-0 place-items-center rounded-full bg-brand-500 text-lg font-extrabold text-white">
				{initial}
			</span>
			<div class="min-w-0 flex-1">
				<p class="truncate text-[16px] font-bold text-ink-900 dark:text-white">{user.name}</p>
				<p class="truncate text-[13px] text-ink-400 dark:text-stone-500">{user.email}</p>
			</div>
		</div>
		<div class="mt-4 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 dark:divide-white/5 dark:border-white/10">
			<button
				type="button"
				onclick={onEditName}
				class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-white/5 dark:active:bg-white/10"
			>
				<Pencil size={18} class="shrink-0 text-stone-400 dark:text-stone-500" />
				<span class="min-w-0 flex-1">
					<span class="block text-[15px] font-semibold text-ink-900 dark:text-white">Név módosítása</span>
				</span>
				<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
			</button>
		</div>
		<button
			onclick={onExport}
			disabled={exportBusy}
			class="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-ink-900 transition hover:bg-stone-50 active:scale-[0.99] disabled:opacity-60 dark:border-white/10 dark:bg-transparent dark:text-white dark:hover:bg-white/5"
		>
			<Database size={17} />
			{exportBusy ? 'Készül…' : 'Adataim letöltése'}
		</button>
		<button
			onclick={onDeleteRequest}
			class="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-red-600 transition hover:bg-red-50 active:scale-[0.99] dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
		>
			<Trash2 size={17} />
			Fiók törlése
		</button>
		<button
			onclick={onLogout}
			class="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-red-600 transition hover:bg-red-50 active:scale-[0.99] dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
		>
			<LogOut size={17} />
			Kijelentkezés
		</button>
	{:else}
		<p class="text-sm leading-relaxed text-stone-500 dark:text-stone-400">
			A mentéshez jelentkezz be.
		</p>
		<div class="mt-4">
			<GoogleLoginButton />
		</div>
	{/if}
</div>
