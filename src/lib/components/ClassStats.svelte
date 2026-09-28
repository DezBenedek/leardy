<script lang="ts">
	import { Download, Search } from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import Card from '$lib/ui/Card.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import { toast } from '$lib/toast.svelte';

	/* Tanari osztaly statisztika: osszesito kartyak, diak tabla (kereses +
	 * lemarado szuro), feladatonkenti bekuldesi arany, CSV export. */

	interface StudentRow {
		user_id: string;
		name: string;
		joined_at: number;
		tasks_attempted: number;
		tasks_submitted: number;
		tasks_avg_pct: number | null;
		assignments_submitted: number;
		assignments_avg_grade: number | null;
	}

	interface TaskRow {
		id: string;
		title: string;
		due_date: number | null;
		attempted: number;
		submitted: number;
	}

	interface AssignRow {
		id: string;
		title: string;
		due_date: number | null;
		submitted: number;
		graded: number;
	}

	interface Stats {
		member_count: number;
		task_count: number;
		assignment_count: number;
		students: StudentRow[];
		tasks: TaskRow[];
		assignments: AssignRow[];
	}

	interface Props {
		classroomId: string;
		open: boolean;
		onClose: () => void;
	}

	let { classroomId, open, onClose }: Props = $props();

	let stats = $state<Stats | null>(null);
	let loading = $state(false);
	let failed = $state(false);
	let query = $state('');
	let onlyLagging = $state(false);
	let dueFilter = $state<'all' | 'upcoming' | 'overdue'>('all');

	$effect(() => {
		if (open && !stats && !loading) void load();
	});

	async function load() {
		loading = true;
		failed = false;
		try {
			const res = await fetch(`/api/classrooms/${classroomId}/stats`);
			const j = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(j.error ?? 'Hiba történt.');
			stats = j as Stats;
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	}

	let avgQuiz = $derived.by(() => {
		const xs = (stats?.students ?? []).map((s) => s.tasks_avg_pct).filter((x) => x !== null);
		if (xs.length === 0) return null;
		return Math.round((xs.reduce((a, b) => a + (b ?? 0), 0) / xs.length) * 10) / 10;
	});
	let avgGrade = $derived.by(() => {
		const xs = (stats?.students ?? []).map((s) => s.assignments_avg_grade).filter((x) => x !== null);
		if (xs.length === 0) return null;
		return Math.round((xs.reduce((a, b) => a + (b ?? 0), 0) / xs.length) * 100) / 100;
	});
	let submittedAssigns = $derived((stats?.students ?? []).reduce((a, s) => a + s.assignments_submitted, 0));

	let visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return (stats?.students ?? []).filter((s) => {
			if (q && !s.name.toLowerCase().includes(q)) return false;
			if (onlyLagging && (s.tasks_submitted > 0 || s.assignments_submitted > 0)) return false;
			return true;
		});
	});

	function dueMatch(due: number | null): boolean {
		if (dueFilter === 'all') return true;
		if (due === null) return false;
		const past = due < Date.now();
		return dueFilter === 'overdue' ? past : !past;
	}

	function fmtPct(x: number | null): string {
		return x === null ? '-' : `${x}%`;
	}
	function fmtGrade(x: number | null): string {
		return x === null ? '-' : String(x);
	}

	function csvCell(v: string | number): string {
		const s = String(v);
		return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	}

	function exportCsv() {
		if (!stats) return;
		const rows = [
			['Név', 'Kvíz próbálkozás', 'Kvíz beküldés', 'Kvíz átlag %', 'Beadandó beküldés', 'Beadandó átlag jegy'],
			...visible.map((s) => [
				s.name,
				s.tasks_attempted,
				s.tasks_submitted,
				s.tasks_avg_pct ?? '',
				s.assignments_submitted,
				s.assignments_avg_grade ?? ''
			])
		];
		const csv = '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'osztaly-statisztika.csv';
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 5000);
		toast.success('CSV letöltve', `${visible.length} sor.`);
	}

	const segBtn = (active: boolean) =>
		[
			'rounded-full px-3 py-1.5 text-[13px] font-bold transition active:scale-95',
			active ? 'bg-white text-ink-900 shadow dark:bg-stone-800 dark:text-white' : 'text-stone-500 dark:text-stone-400'
		].join(' ');
</script>

<Drawer open={open} label="Statisztika" title="Osztály statisztika" wide onClose={onClose}>
	{#if loading}
		<div role="status" aria-label="Betöltés" class="mt-3 grid gap-2.5">
			{#each [0, 1, 2] as i (i)}
				<Card><Skeleton cls="h-[18px] w-2/3 rounded-lg" /></Card>
			{/each}
			<span class="sr-only">Betöltés…</span>
		</div>
	{:else if failed || !stats}
		<div class="mt-3">
			<EmptyState title="Nem sikerült betölteni" description="Próbáld újra később." />
		</div>
	{:else}
		<div class="mt-3 grid grid-cols-2 gap-2.5">
			<Card>
				<p class="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Tagok</p>
				<p class="mt-0.5 text-[22px] font-extrabold text-ink-900 tabular-nums dark:text-white">{stats.member_count}</p>
			</Card>
			<Card>
				<p class="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Kvíz átlag</p>
				<p class="mt-0.5 text-[22px] font-extrabold text-ink-900 tabular-nums dark:text-white">{avgQuiz === null ? '-' : `${avgQuiz}%`}</p>
			</Card>
			<Card>
				<p class="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Beadandó beküldés</p>
				<p class="mt-0.5 text-[22px] font-extrabold text-ink-900 tabular-nums dark:text-white">{submittedAssigns}</p>
			</Card>
			<Card>
				<p class="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">Jegy átlag</p>
				<p class="mt-0.5 text-[22px] font-extrabold text-ink-900 tabular-nums dark:text-white">{avgGrade === null ? '-' : avgGrade}</p>
			</Card>
		</div>

		<div class="mt-4">
			<div class="flex items-center gap-2">
				<div class="relative min-w-0 flex-1">
					<Search size={16} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
					<input
						type="search"
						placeholder="Keresés névben…"
						bind:value={query}
						aria-label="Keresés névben"
						class="w-full rounded-xl border border-stone-200 bg-white py-2 pr-3 pl-9 text-[14px] text-ink-900 outline-none placeholder:text-stone-400 focus:border-brand-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
					/>
				</div>
				<button
					type="button"
					onclick={() => (onlyLagging = !onlyLagging)}
					aria-pressed={onlyLagging}
					class={[
						'shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-bold transition active:scale-95',
						onlyLagging
							? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-white'
							: 'border-stone-200 text-stone-500 dark:border-white/10 dark:text-stone-400'
					]}
				>
					Lemaradók
				</button>
				<button
					type="button"
					onclick={exportCsv}
					aria-label="CSV export"
					class="grid size-9 shrink-0 place-items-center rounded-full border border-stone-200 text-stone-500 transition hover:bg-stone-50 active:scale-95 dark:border-white/10 dark:text-stone-300 dark:hover:bg-white/10"
				>
					<Download size={17} />
				</button>
			</div>
			{#if visible.length === 0}
				<p class="mt-2 text-[13px] text-stone-400 dark:text-stone-500">Nincs találat.</p>
			{:else}
				<ul class="mt-2 grid gap-1.5">
					{#each visible as s (s.user_id)}
						<li class="rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/10">
							<p class="truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">{s.name}</p>
							<p class="mt-0.5 text-[12px] text-stone-500 tabular-nums dark:text-stone-400">
								Kvíz: {s.tasks_attempted} próba · {s.tasks_submitted} beküldve · átl. {fmtPct(s.tasks_avg_pct)}
								· Beadandó: {s.assignments_submitted} beküldve · jegy átl. {fmtGrade(s.assignments_avg_grade)}
							</p>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="mt-4">
			<div class="flex items-center justify-between gap-2">
				<h3 class="px-1 text-[15px] font-extrabold text-ink-900 dark:text-white">Feladatok és beadandók</h3>
				<div class="flex shrink-0 gap-0.5 rounded-full bg-stone-100 p-0.5 dark:bg-white/10" role="group" aria-label="Határidő szűrő">
					<button type="button" onclick={() => (dueFilter = 'all')} class={segBtn(dueFilter === 'all')}>Mind</button>
					<button type="button" onclick={() => (dueFilter = 'upcoming')} class={segBtn(dueFilter === 'upcoming')}>Esedékes</button>
					<button type="button" onclick={() => (dueFilter = 'overdue')} class={segBtn(dueFilter === 'overdue')}>Lejárt</button>
				</div>
			</div>
			<ul class="mt-2 grid gap-1.5">
				{#each stats.tasks.filter((t) => dueMatch(t.due_date)) as t (t.id)}
					<li class="rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/10">
						<p class="truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">{t.title || 'Kvízfeladat'}</p>
						<p class="mt-0.5 text-[12px] text-stone-500 tabular-nums dark:text-stone-400">
							Kvíz · {t.attempted}/{stats.member_count} próbálta · {t.submitted}/{stats.member_count} beküldte
						</p>
					</li>
				{/each}
				{#each stats.assignments.filter((a) => dueMatch(a.due_date)) as a (a.id)}
					<li class="rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/10">
						<p class="truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">{a.title || 'Beadandó'}</p>
						<p class="mt-0.5 text-[12px] text-stone-500 tabular-nums dark:text-stone-400">
							Beadandó · {a.submitted}/{stats.member_count} beküldte · {a.graded} értékelve
						</p>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</Drawer>
