<script lang="ts">
	import { BookOpen, ChevronRight, Code2, School, ShieldAlert } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { LayoutData } from './$types';

	let { data }: { data: LayoutData } = $props();
	let allowed = $derived(new Set(data.allowed ?? []));
	let summary = $state<{ total: number; banned: number; muted: number; actionsWeek: number; roles: Record<string, number> } | null>(null);

	onMount(async () => {
		try {
			const res = await fetch('/api/admin/summary', { credentials: 'same-origin' });
			if (res.ok) summary = await res.json();
		} catch {
			// néma hiba: a kártyák nélküle is látszanak
		}
	});

	const cards = [
		{ id: 'iskola', href: '/admin/iskola', title: 'Iskola', desc: 'Saját iskola diákjainak statisztikája', Icon: School },
		{ id: 'moderalas', href: '/admin/moderalas', title: 'Moderálás', desc: 'Ideiglenes tiltás és némítás', Icon: ShieldAlert },
		{ id: 'tananyag', href: '/admin/tananyag', title: 'Tananyag', desc: 'Minden lecke szerkesztése', Icon: BookOpen },
		{ id: 'fejleszto', href: '/admin/fejleszto', title: 'Fejlesztő', desc: 'Szerepek és API kulcsok', Icon: Code2 }
	];
</script>

<div class="grid gap-3 sm:grid-cols-2">
	{#if summary}
		<div class="grid grid-cols-4 gap-2.5 sm:col-span-2">
			{#each [
				{ v: String(summary.total), l: 'Felhasználó' },
				{ v: String(summary.banned), l: 'Tiltva' },
				{ v: String(summary.muted), l: 'Némítva' },
				{ v: String(summary.actionsWeek), l: 'Művelet / 7 nap' }
			] as kpi (kpi.l)}
				<div class="rounded-2xl border border-stone-200 bg-white p-3 text-center dark:border-white/10 dark:bg-stone-900">
					<p class="text-[19px] font-extrabold text-ink-900 dark:text-white">{kpi.v}</p>
					<p class="text-[11px] font-medium text-stone-500">{kpi.l}</p>
				</div>
			{/each}
		</div>
	{/if}
	{#each cards.filter((c) => allowed.has(c.id)) as card, i (card.id)}
		<a
			href={card.href}
			class="admin-card group flex items-center gap-3.5 rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.99] dark:border-white/10 dark:bg-stone-900"
			style:animation-delay={`${i * 70}ms`}
		>
			<span class="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-500/10 text-brand-600 transition-transform duration-300 group-hover:scale-110 dark:text-brand-300">
				<card.Icon size={22} />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-[15px] font-extrabold text-ink-900 dark:text-white">{card.title}</span>
				<span class="block truncate text-[13px] text-stone-500 dark:text-stone-400">{card.desc}</span>
			</span>
			<ChevronRight size={18} class="shrink-0 text-stone-300 transition-transform duration-300 group-hover:translate-x-1 dark:text-stone-600" />
		</a>
	{/each}
</div>

<style>
	.admin-card {
		opacity: 0;
		animation: admin-in 480ms cubic-bezier(0.22, 1.2, 0.32, 1) forwards;
	}
	@keyframes admin-in {
		from { opacity: 0; transform: translateY(14px) scale(0.99); }
		to { opacity: 1; transform: translateY(0) scale(1); }
	}
	@media (prefers-reduced-motion: reduce) {
		.admin-card { animation: none; opacity: 1; }
	}
</style>
