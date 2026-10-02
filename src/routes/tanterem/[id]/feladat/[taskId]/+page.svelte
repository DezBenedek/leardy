<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft, CalendarDays, Check, Settings } from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { toast } from '$lib/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Input from '$lib/ui/Input.svelte';
	import SearchInput from '$lib/ui/SearchInput.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let room = $derived(data.room);
	let lessons = $derived(data.lessons);
	// Helyi felülírás szerkesztés után; új adat érkezésekor a szerver az igazság.
	let taskPatch = $state<Partial<typeof data.task> | null>(null);
	let task = $derived({ ...data.task, ...(taskPatch ?? {}) });
	let results = $derived(data.results);

	let query = $state('');
	let editOpen = $state(false);

	let editTitle = $state('');
	let editCount = $state(10);
	let editTarget = $state(80);
	let editDue = $state('');
	let savingEdit = $state(false);
	let editError = $state<string | null>(null);

	function goBack() {
		if (typeof history !== 'undefined' && history.length > 1) history.back();
		else void goto(`/tanterem/${room.id}`);
	}

	function fmtDate(ts: number): string {
		try {
			return new Date(ts).toLocaleString('hu-HU', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	}

	function toDueInput(ts: number | null): string {
		if (!ts) return '';
		const d = new Date(ts);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
	}

	function step(value: number, delta: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value + delta));
	}

	let submittedCount = $derived(results.filter((r) => (r.submitted ?? 0) === 1).length);
	let triedCount = $derived(results.filter((r) => (r.attempts ?? 0) > 0).length);
	let totalCount = $derived(results.length);
	let submittedPct = $derived(totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 0);
	let avgPct = $derived.by(() => {
		const pcts = results
			.filter((r) => (r.submitted ?? 0) === 1 && r.best_pct !== null && r.best_pct !== undefined)
			.map((r) => r.best_pct as number);
		if (pcts.length === 0) return null;
		return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
	});
	let pastDue = $derived(task.due_date !== null && task.due_date !== undefined && Date.now() > task.due_date);

	let visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const rows = q
			? results.filter((r) => r.name.toLowerCase().includes(q))
			: [...results];
		return rows.sort((a, b) => {
			const sa = (a.submitted ?? 0) === 1 ? 1 : 0;
			const sb = (b.submitted ?? 0) === 1 ? 1 : 0;
			if (sa !== sb) return sb - sa;
			const pa = a.best_pct ?? -1;
			const pb = b.best_pct ?? -1;
			if (pa !== pb) return pb - pa;
			return a.name.localeCompare(b.name, 'hu');
		});
	});

	function openEdit() {
		editTitle = task.title ?? '';
		editCount = task.question_count ?? 10;
		editTarget = task.target_pct ?? 80;
		editDue = toDueInput(task.due_date ?? null);
		editError = null;
		editOpen = true;
	}

	async function saveEdit(e: SubmitEvent) {
		e.preventDefault();
		if (savingEdit) return;
		savingEdit = true;
		editError = null;
		let due: number | null = null;
		if (editDue.trim() !== '') {
			const t = new Date(editDue).getTime();
			if (!Number.isFinite(t)) {
				editError = 'Hibás határidő.';
				savingEdit = false;
				return;
			}
			due = t;
		}
		try {
			const res = await fetch(`/api/classrooms/${room.id}/tasks/${task.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: editTitle,
					question_count: editCount,
					target_pct: editTarget,
					due_date: due
				})
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				editError = j.error ?? 'Nem sikerült menteni.';
				return;
			}
			taskPatch = {
				title: j.title,
				question_count: j.question_count,
				target_pct: j.target_pct,
				due_date: j.due_date
			};
			editOpen = false;
			toast.success('Feladat frissítve');
		} catch {
			editError = 'Hálózati hiba. Próbáld újra!';
		} finally {
			savingEdit = false;
		}
	}

	const stepperBtn =
		'grid size-9 place-items-center rounded-full border border-stone-200 text-lg font-bold text-ink-600 transition hover:bg-stone-50 active:scale-95 dark:border-white/15 dark:text-stone-300 dark:hover:bg-white/10';
	const statTile = 'rounded-2xl bg-stone-100 p-3 dark:bg-white/10';
</script>

<svelte:head>
	<title>{task.title || 'Kvízfeladat'} | {room.name} | Leardy</title>
</svelte:head>

<div class="flex items-center gap-2">
	<IconButton ariaLabel="Vissza az osztályhoz" size={44} onclick={goBack}>
		<ArrowLeft size={21} />
	</IconButton>
	<div class="min-w-0 flex-1">
		<h1 class="font-display truncate text-[22px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
			{task.title || 'Kvízfeladat'}
		</h1>
		<p class="truncate text-[13px] font-medium text-stone-500 dark:text-stone-400">
			{room.name} · Kvízfeladat
		</p>
	</div>
	<IconButton ariaLabel="Feladat szerkesztése" size={44} onclick={openEdit}>
		<Settings size={20} />
	</IconButton>
</div>

<section aria-label="Állapot" class="mt-4 rounded-[20px] border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
	{#if task.due_date}
		<p class="flex items-center gap-1.5 text-[14px] font-bold {pastDue ? 'text-red-600 dark:text-red-300' : 'text-ink-900 dark:text-white'}">
			<CalendarDays size={16} />
			{pastDue ? 'Lejárt: ' : 'Határidő: '}{fmtDate(task.due_date)}
		</p>
	{:else}
		<p class="flex items-center gap-1.5 text-[14px] font-bold text-stone-500 dark:text-stone-400">
			<CalendarDays size={16} /> Nincs határidő
		</p>
	{/if}
	<div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
		<div class={statTile}>
			<p class="text-[11px] font-extrabold tracking-wide text-stone-400 uppercase dark:text-stone-500">Leckék</p>
			<p class="mt-0.5 text-[17px] font-extrabold text-ink-900 tabular-nums dark:text-white">{lessons.length}</p>
		</div>
		<div class={statTile}>
			<p class="text-[11px] font-extrabold tracking-wide text-stone-400 uppercase dark:text-stone-500">Kérdések</p>
			<p class="mt-0.5 text-[17px] font-extrabold text-ink-900 tabular-nums dark:text-white">{task.question_count}</p>
		</div>
		<div class={statTile}>
			<p class="text-[11px] font-extrabold tracking-wide text-stone-400 uppercase dark:text-stone-500">Cél</p>
			<p class="mt-0.5 text-[17px] font-extrabold text-ink-900 tabular-nums dark:text-white">{task.target_pct}%</p>
		</div>
		<div class={statTile}>
			<p class="text-[11px] font-extrabold tracking-wide text-stone-400 uppercase dark:text-stone-500">Keverés</p>
			<p class="mt-0.5 text-[17px] font-extrabold text-ink-900 dark:text-white">{task.shuffle ? 'Be' : 'Ki'}</p>
		</div>
	</div>
</section>

<section aria-label="Haladás" class="mt-2.5 rounded-[20px] border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
	<div class="flex items-baseline justify-between gap-2">
		<p class="text-[14px] font-bold text-ink-900 dark:text-white">
			Beküldte {submittedCount}/{totalCount}
		</p>
		<p class="text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
			{submittedPct}%
		</p>
	</div>
	<div
		class="mt-2 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10"
		role="progressbar"
		aria-valuenow={submittedCount}
		aria-valuemin={0}
		aria-valuemax={totalCount}
		aria-label="Beküldött feladatok"
	>
		<div
			class="h-full rounded-full bg-brand-500 transition-all duration-300 motion-reduce:transition-none"
			style="width: {submittedPct}%"
		></div>
	</div>
	<p class="mt-2.5 text-[13px] text-stone-500 dark:text-stone-400">
		{#if avgPct !== null}
			Beküldöttek átlaga: <strong class="font-extrabold text-ink-900 tabular-nums dark:text-white">{avgPct}%</strong> ·
		{/if}
		Próbálkozott: <strong class="font-extrabold text-ink-900 tabular-nums dark:text-white">{triedCount} fő</strong> ·
		Még nem kezdte: <strong class="font-extrabold text-ink-900 tabular-nums dark:text-white">{totalCount - triedCount} fő</strong>
	</p>
</section>

<div class="mt-4">
	<SearchInput bind:value={query} placeholder="Keresés név alapján…" ariaLabel="Keresés név alapján" />
</div>

<div class="mt-2.5">
	{#if results.length === 0}
		<EmptyState title="Nincs tag" description="Az osztálynak még nincs tagja, akit listázhatnánk." />
	{:else if visible.length === 0}
		<EmptyState title="Nincs találat" description="Erre a névre nincs diák az osztályban." />
	{:else}
		<ul class="grid min-w-0 gap-1.5 overflow-hidden">
			{#each visible as r (r.user_id)}
				<li class="flex min-w-0 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 dark:border-white/10 dark:bg-stone-900">
					<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
						{r.name}
					</span>
					{#if (r.submitted ?? 0) === 1}
						<span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[12px] font-extrabold text-emerald-700 tabular-nums dark:text-emerald-300">
							<Check size={13} strokeWidth={3} /> {r.best_pct ?? 0}%
						</span>
					{:else if (r.attempts ?? 0) > 0}
						<span class="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-[12px] font-extrabold text-amber-700 tabular-nums dark:text-amber-300">
							{r.best_pct ?? 0}% · {r.attempts}×
						</span>
					{:else}
						<span class="shrink-0 text-[12px] font-semibold text-stone-400 dark:text-stone-500">Nem kezdte</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#if lessons.length > 0}
	<section aria-label="Leckék" class="mt-4">
		<p class="px-1 pb-1.5 text-[13px] font-extrabold tracking-wide text-stone-400 uppercase dark:text-stone-500">
			Leckék ({lessons.length})
		</p>
		<ul class="grid min-w-0 gap-1.5 overflow-hidden">
			{#each lessons as l (l.id)}
				<li class="min-w-0">
					<a
						href="/lecke/{l.id}"
						class="block min-w-0 truncate rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 text-[14px] font-bold text-ink-700 transition hover:bg-stone-50 dark:border-white/10 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-white/5"
					>
						{l.title}
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<Drawer open={editOpen} label="Feladat szerkesztése" title="Feladat szerkesztése" onClose={() => (editOpen = false)}>
	<form onsubmit={saveEdit} class="mt-3 grid gap-3.5" novalidate>
		<Input label="Feladat címe" placeholder="pl. 3. lecke kvíz" bind:value={editTitle} disabled={savingEdit} error={editError} />
		<div class="grid grid-cols-2 gap-3">
			<div>
				<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">Kérdések száma</p>
				<div class="flex items-center gap-2">
					<button type="button" aria-label="Kevesebb kérdés" class={stepperBtn} onclick={() => (editCount = step(editCount, -1, 1, 100))}>
						−
					</button>
					<span class="w-10 text-center text-[16px] font-extrabold text-ink-900 tabular-nums dark:text-white">
						{editCount}
					</span>
					<button type="button" aria-label="Több kérdés" class={stepperBtn} onclick={() => (editCount = step(editCount, 1, 1, 100))}>
						+
					</button>
				</div>
			</div>
			<div>
				<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">Cél</p>
				<div class="flex items-center gap-2">
					<button type="button" aria-label="Kisebb cél" class={stepperBtn} onclick={() => (editTarget = step(editTarget, -5, 10, 100))}>
						−
					</button>
					<span class="w-10 text-center text-[16px] font-extrabold text-ink-900 tabular-nums dark:text-white">
						{editTarget}%
					</span>
					<button type="button" aria-label="Nagyobb cél" class={stepperBtn} onclick={() => (editTarget = step(editTarget, 5, 10, 100))}>
						+
					</button>
				</div>
			</div>
		</div>
		<div>
			<label for="task-due" class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
				<CalendarDays size={14} /> Határidő <span class="font-normal text-stone-400">(üresen hagyható)</span>
			</label>
			<input
				id="task-due"
				type="datetime-local"
				bind:value={editDue}
				disabled={savingEdit}
				class="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:[color-scheme:dark]"
			/>
		</div>
		<div class="grid grid-cols-2 gap-2.5">
			<Button variant="outline" block disabled={savingEdit} onclick={() => (editOpen = false)}>
				Mégse
			</Button>
			<Button type="submit" block busy={savingEdit}>
				{savingEdit ? 'Mentés…' : 'Mentés'}
			</Button>
		</div>
	</form>
</Drawer>
