<script lang="ts">
	import { createBackNavigation } from '$lib/back-navigation';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		CalendarDays,
		Check,
		ChevronRight,
		FileText,
		Settings,
		Trash2,
		X
	} from '@lucide/svelte';
	import AssignmentGrading from '$lib/components/AssignmentGrading.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import Switch from '$lib/ui/Switch.svelte';
	import { toast } from '$lib/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Input from '$lib/ui/Input.svelte';
	import SearchInput from '$lib/ui/SearchInput.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let room = $derived(data.room);
	// Helyi felülírás szerkesztés és értékelés után;
	// új adat érkezésekor a szerver az igazság.
	let assignmentPatch = $state<Partial<typeof data.assignment> | null>(null);
	let assignment = $derived({ ...data.assignment, ...(assignmentPatch ?? {}) });
	let gradeOverrides = $state<
		Record<string, { grade: number | null; feedback: string; graded_at: number | null }>
	>({});
	let results = $derived(
		data.results.map((r) => {
			const o = gradeOverrides[r.user_id];
			return o ? { ...r, ...o } : r;
		})
	);

	let query = $state('');
	let filter = $state('all');
	let gradingUserId = $state<string | null>(null);
	let previewId = $state<string | null>(null);

	let editOpen = $state(false);
	let editTitle = $state('');
	let editDesc = $state('');
	let editDue = $state('');
	let editRequireText = $state(true);
	let editRequireImages = $state(false);
	let editRequireFiles = $state(false);
	let editRequireAudio = $state(false);
	let savingEdit = $state(false);
	let editError = $state<string | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state(false);

	const goBack = createBackNavigation(() => resolve('/tanterem/[id]', { id: room.id }));

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

	function fmtSize(bytes: number): string {
		if (!Number.isFinite(bytes) || bytes < 0) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	}

	function toDueInput(ts: number | null): string {
		if (!ts) return '';
		const d = new Date(ts);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
	}

	function uploadUrl(aid: string, uploadId: string): string {
		return `/api/classrooms/${room.id}/assignments/${aid}/uploads/${uploadId}`;
	}

	function statusOf(r: (typeof results)[number]): 'graded' | 'submitted' | 'working' | 'missing' {
		if (r.grade !== null && r.grade !== undefined) return 'graded';
		if (r.submitted === 1) return 'submitted';
		if (r.text_body || r.image_count > 0 || r.file_count > 0 || r.uploads.some((u) => u.kind === 'audio'))
			return 'working';
		return 'missing';
	}

	function statusLabel(r: (typeof results)[number]): string {
		const s = statusOf(r);
		if (s === 'graded') return `Értékelve: ${r.grade}`;
		if (s === 'submitted') return 'Beküldve';
		if (s === 'working') return 'Dolgozik rajta';
		return 'Még nem küldött';
	}

	function reqSummary(): string {
		const parts: string[] = [];
		if (assignment.require_text) parts.push('Szöveg');
		if (assignment.require_images)
			parts.push(assignment.max_images > 0 ? `Kép (max. ${assignment.max_images})` : 'Kép');
		if ((assignment.require_audio ?? 0) === 1) parts.push('Hang');
		if (assignment.require_files)
			parts.push(assignment.max_files > 0 ? `Fájl (max. ${assignment.max_files})` : 'Fájl');
		return parts.length > 0 ? parts.join(' · ') : 'Szabad beküldés';
	}

	let submittedCount = $derived(results.filter((r) => r.submitted === 1).length);
	let gradedCount = $derived(results.filter((r) => r.grade !== null && r.grade !== undefined).length);
	let totalCount = $derived(results.length);
	let submittedPct = $derived(totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 0);
	let gradedPct = $derived(totalCount > 0 ? Math.round((gradedCount / totalCount) * 100) : 0);
	let pastDue = $derived(
		assignment.due_date !== null && assignment.due_date !== undefined && Date.now() > assignment.due_date
	);

	let visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		let rows = results;
		if (filter === 'submitted') rows = rows.filter((r) => r.submitted === 1);
		else if (filter === 'ungraded')
			rows = rows.filter((r) => r.submitted === 1 && (r.grade === null || r.grade === undefined));
		else if (filter === 'missing') rows = rows.filter((r) => r.submitted !== 1);
		if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
		return [...rows].sort((a, b) => {
			const order = (r: (typeof results)[number]) => {
				const s = statusOf(r);
				return s === 'submitted' ? 0 : s === 'working' ? 1 : s === 'missing' ? 2 : 3;
			};
			const d = order(a) - order(b);
			return d !== 0 ? d : a.name.localeCompare(b.name, 'hu');
		});
	});

	let gradingStudent = $derived(
		gradingUserId ? (results.find((r) => r.user_id === gradingUserId) ?? null) : null
	);
	let previewUpload = $derived(
		gradingStudent && previewId
			? (gradingStudent.uploads.find((u) => u.id === previewId) ?? null)
			: null
	);

	function openEdit() {
		editTitle = assignment.title ?? '';
		editDesc = assignment.description ?? '';
		editDue = toDueInput(assignment.due_date ?? null);
		editRequireText = assignment.require_text === 1;
		editRequireImages = assignment.require_images === 1;
		editRequireFiles = assignment.require_files === 1;
		editRequireAudio = (assignment.require_audio ?? 0) === 1;
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
			const res = await fetch(`/api/classrooms/${room.id}/assignments/${assignment.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: editTitle,
					description: editDesc,
					due_date: due,
					require_text: editRequireText,
					require_images: editRequireImages,
					require_files: editRequireFiles,
					require_audio: editRequireAudio
				})
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				editError = j.error ?? 'Nem sikerült menteni.';
				return;
			}
			assignmentPatch = {
				title: j.title ?? editTitle,
				description: editDesc,
				due_date: due,
				require_text: editRequireText ? 1 : 0,
				require_images: editRequireImages ? 1 : 0,
				require_files: editRequireFiles ? 1 : 0,
				require_audio: editRequireAudio ? 1 : 0
			};
			editOpen = false;
			toast.success('Beadandó frissítve');
		} catch {
			editError = 'Hálózati hiba. Próbáld újra!';
		} finally {
			savingEdit = false;
		}
	}

	async function deleteAssignment() {
		if (deleting) return;
		deleting = true;
		try {
			const res = await fetch(`/api/classrooms/${room.id}/assignments/${assignment.id}`, {
				method: 'DELETE'
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült törölni', j.error ?? 'Próbáld újra!');
				return;
			}
			deleteOpen = false;
			toast.success('Beadandó törölve');
			void goto(`/tanterem/${room.id}`);
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			deleting = false;
		}
	}

	function onGradeSaved(userId: string, grade: number | null, feedback: string) {
		gradeOverrides = {
			...gradeOverrides,
			[userId]: {
				grade,
				feedback,
				graded_at: grade !== null || feedback !== '' ? Date.now() : null
			}
		};
	}

	const inputCls =
		'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:ring-brand-500/20';
</script>

<svelte:head>
	<title>{assignment.title || 'Beadandó'} | {room.name} | Leardy</title>
</svelte:head>

<div class="flex items-center gap-2">
	<IconButton ariaLabel="Vissza az osztályhoz" size={44} onclick={goBack}>
		<ArrowLeft size={21} />
	</IconButton>
	<div class="min-w-0 flex-1">
		<h1 class="font-display truncate text-[22px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
			{assignment.title || 'Beadandó'}
		</h1>
		<p class="truncate text-[13px] font-medium text-stone-500 dark:text-stone-400">
			{room.name} · Beadandó
		</p>
	</div>
	<IconButton ariaLabel="Beadandó szerkesztése" size={44} onclick={openEdit}>
		<Settings size={20} />
	</IconButton>
</div>

<section aria-label="Részletek" class="mt-4 rounded-[20px] border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
	{#if assignment.description}
		<p class="text-sm leading-relaxed break-words whitespace-pre-line text-stone-600 dark:text-stone-300">{assignment.description}</p>
	{/if}
	{#if assignment.due_date}
		<p class="mt-2 flex items-center gap-1.5 text-[14px] font-bold {pastDue ? 'text-red-600 dark:text-red-300' : 'text-ink-900 dark:text-white'}">
			<CalendarDays size={16} />
			{pastDue ? 'Lejárt: ' : 'Határidő: '}{fmtDate(assignment.due_date)}
		</p>
	{/if}
	<p class="mt-2 inline-block rounded-full bg-amber-500/10 px-2.5 py-1 text-[12px] font-extrabold text-amber-700 dark:text-amber-300">
		{reqSummary()}
	</p>
</section>

<section aria-label="Haladás" class="mt-2.5 rounded-[20px] border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
	<div class="flex items-baseline justify-between gap-2">
		<p class="text-[14px] font-bold text-ink-900 dark:text-white">Beküldte {submittedCount}/{totalCount}</p>
		<p class="text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-400">{submittedPct}%</p>
	</div>
	<div
		class="mt-2 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10"
		role="progressbar"
		aria-valuenow={submittedCount}
		aria-valuemin={0}
		aria-valuemax={totalCount}
		aria-label="Beküldött beadandók"
	>
		<div class="h-full rounded-full bg-brand-500 transition-all duration-300 motion-reduce:transition-none" style="width: {submittedPct}%"></div>
	</div>
	<div class="mt-3 flex items-baseline justify-between gap-2">
		<p class="text-[14px] font-bold text-ink-900 dark:text-white">Értékelve {gradedCount}/{totalCount}</p>
		<p class="text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-400">{gradedPct}%</p>
	</div>
	<div
		class="mt-2 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10"
		role="progressbar"
		aria-valuenow={gradedCount}
		aria-valuemin={0}
		aria-valuemax={totalCount}
		aria-label="Értékelt beadandók"
	>
		<div class="h-full rounded-full bg-emerald-500 transition-all duration-300 motion-reduce:transition-none" style="width: {gradedPct}%"></div>
	</div>
</section>

<div class="mt-4 grid gap-2.5">
	<SearchInput bind:value={query} placeholder="Keresés név alapján…" ariaLabel="Keresés név alapján" />
	<Segmented
		ariaLabel="Szűrés állapot szerint"
		bind:value={filter}
		options={[
			{ value: 'all', label: 'Mind' },
			{ value: 'submitted', label: 'Beküldött' },
			{ value: 'ungraded', label: 'Értékeletlen' },
			{ value: 'missing', label: 'Hiányzik' }
		]}
	/>
</div>

<div class="mt-2.5">
	{#if results.length === 0}
		<EmptyState title="Nincs tag" description="Az osztálynak még nincs tagja, akit listázhatnánk." />
	{:else if visible.length === 0}
		<EmptyState title="Nincs találat" description="Ehhez a szűréshez nincs diák." />
	{:else}
		<ul class="grid min-w-0 gap-1.5 overflow-hidden">
			{#each visible as r (r.user_id)}
				{@const graded = r.grade !== null && r.grade !== undefined}
				{@const done = r.submitted === 1}
				<li class="min-w-0">
					<button
						type="button"
						onclick={() => (gradingUserId = r.user_id)}
						aria-label={`${r.name} beküldésének megtekintése`}
						class="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 text-left transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:bg-stone-900 dark:hover:bg-white/5"
					>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[14px] font-bold text-ink-900 dark:text-white">
								{r.name}
							</span>
							<span class="block truncate text-[12px] {graded || done ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'text-stone-400 dark:text-stone-500'}">
								{statusLabel(r)}
							</span>
						</span>
						{#if graded}
							<span
								class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-500 text-[14px] font-extrabold text-white"
								title="Értékelve: {r.grade}"
							>
								{r.grade}
							</span>
						{:else if done}
							<span
								class="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
								title="Beküldve"
							>
								<Check size={15} strokeWidth={3} />
							</span>
						{/if}
						<ChevronRight size={16} class="shrink-0 text-stone-400 dark:text-stone-500" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<Drawer
	open={gradingUserId !== null}
	label="Beküldés részletei"
	title={gradingStudent?.name ?? 'Beküldés'}
	onBack={() => {
		gradingUserId = null;
		previewId = null;
	}}
	onClose={() => {
		gradingUserId = null;
		previewId = null;
	}}
>
	{#if gradingStudent}
		{@const gs = gradingStudent}
		{@const gImgs = gs.uploads.filter((u) => u.kind === 'image')}
		{@const gAuds = gs.uploads.filter((u) => u.kind === 'audio')}
		{@const gFiles = gs.uploads.filter((u) => u.kind === 'file')}
		<div class="mt-3 grid min-w-0 gap-3 overflow-hidden">
			<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
				<p class="mb-1 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
					Értékelés
				</p>
				<AssignmentGrading
					classroomId={room.id}
					assignmentId={assignment.id}
					student={gs}
					onSaved={onGradeSaved}
				/>
			</div>
			<p class="text-[13px] font-bold {gs.submitted === 1 ? 'text-emerald-700 dark:text-emerald-300' : 'text-stone-500 dark:text-stone-400'}">
				{statusLabel(gs)}{#if gs.submitted === 1 && gs.submitted_at} · {fmtDate(gs.submitted_at)}{/if}
			</p>
			{#if gs.text_body}
				<div class="rounded-2xl bg-stone-100 p-3.5 dark:bg-white/10">
					<p class="text-sm leading-relaxed break-words whitespace-pre-line text-stone-700 dark:text-stone-200">{gs.text_body}</p>
				</div>
			{/if}
			{#if gs.uploads.length === 0}
				<p class="text-[13px] text-stone-400 dark:text-stone-500">Nincs feltöltött fájl.</p>
			{:else}
				<div class="grid min-w-0 gap-2">
					<p class="text-[13px] font-semibold text-ink-900 dark:text-white">
						Feltöltések ({gs.uploads.length})
					</p>
					{#if gImgs.length > 0}
						<ul class="grid min-w-0 gap-2">
							{#each gImgs as u (u.id)}
								<li class="min-w-0">
									<button
										type="button"
										onclick={() => (previewId = u.id)}
										aria-label="{u.file_name} előnézete"
										class="block w-full overflow-hidden rounded-xl bg-stone-100 transition hover:opacity-90 active:scale-[0.99] dark:bg-white/10"
									>
										<img src={uploadUrl(assignment.id, u.id)} alt={u.file_name} loading="lazy" class="max-h-64 w-full object-cover" />
									</button>
									<p class="mt-0.5 truncate text-[12px] text-stone-400 dark:text-stone-500">{u.file_name}</p>
								</li>
							{/each}
						</ul>
					{/if}
					{#if gAuds.length > 0}
						<ul class="grid min-w-0 gap-2">
							{#each gAuds as u, i (u.id)}
								<li class="rounded-xl bg-stone-100 p-2.5 dark:bg-white/10">
									<p class="truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">
										Hangfelvétel {i + 1} <span class="font-normal text-stone-400">({fmtSize(u.size)})</span>
									</p>
									<audio controls preload="none" src={uploadUrl(assignment.id, u.id)} class="mt-1.5 w-full"></audio>
								</li>
							{/each}
						</ul>
					{/if}
					{#if gFiles.length > 0}
						<ul class="grid min-w-0 gap-1.5">
							{#each gFiles as u (u.id)}
								<li>
									<a
										href={uploadUrl(assignment.id, u.id)}
										target="_blank"
										rel="noreferrer"
										class="flex min-w-0 items-center gap-2 rounded-xl bg-stone-100 px-3 py-2.5 text-[13px] font-bold text-ink-700 transition hover:bg-stone-200/70 dark:bg-white/10 dark:text-stone-200 dark:hover:bg-white/15"
									>
										<FileText size={15} class="shrink-0" />
										<span class="min-w-0 flex-1 truncate">{u.file_name} <span class="font-normal text-stone-400">({fmtSize(u.size)})</span></span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</Drawer>

{#if previewUpload && gradingStudent}
	<div class="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" role="presentation">
		<button type="button" tabindex="-1" aria-label="Előnézet bezárása" onclick={() => (previewId = null)} class="absolute inset-0"></button>
		<div class="relative max-h-full max-w-full overflow-auto">
			<img src={uploadUrl(assignment.id, previewUpload.id)} alt={previewUpload.file_name} class="max-h-[80dvh] w-auto max-w-full rounded-xl" />
			<button
				type="button"
				onclick={() => (previewId = null)}
				aria-label="Bezárás"
				class="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
			>
				<X size={18} />
			</button>
		</div>
	</div>
{/if}

<Drawer open={editOpen} label="Beadandó szerkesztése" title="Beadandó szerkesztése" onClose={() => (editOpen = false)}>
	<form onsubmit={saveEdit} class="mt-3 grid gap-3.5" novalidate>
		<Input label="Beadandó címe" required placeholder="pl. Olvasónapló 1. fejezet" bind:value={editTitle} disabled={savingEdit} error={editError} />
		<div>
			<label for="edit-desc" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
				Leírás
			</label>
			<textarea
				id="edit-desc"
				rows="3"
				maxlength="2000"
				placeholder="Mit kell beadni? (nem kötelező)"
				bind:value={editDesc}
				disabled={savingEdit}
				class={inputCls}
			></textarea>
		</div>
		<div>
			<label for="edit-due" class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
				<CalendarDays size={14} /> Határidő <span class="font-normal text-stone-400">(üresen hagyható)</span>
			</label>
			<input
				id="edit-due"
				type="datetime-local"
				bind:value={editDue}
				disabled={savingEdit}
				class={[inputCls, 'dark:[color-scheme:dark]']}
			/>
		</div>
		<div class="grid gap-2">
			<p class="text-[13px] font-semibold text-ink-900 dark:text-white">Mit kell beadni?</p>
			<div class="flex items-center justify-between gap-2">
				<span class="text-[14px] font-bold text-ink-900 dark:text-white">Szöveg kérése</span>
				<Switch bind:checked={editRequireText} disabled={savingEdit} label="Szöveg kérése" />
			</div>
			<div class="flex items-center justify-between gap-2">
				<span class="text-[14px] font-bold text-ink-900 dark:text-white">Kép feltöltés</span>
				<Switch bind:checked={editRequireImages} disabled={savingEdit} label="Kép feltöltés kérése" />
			</div>
			<div class="flex items-center justify-between gap-2">
				<span class="text-[14px] font-bold text-ink-900 dark:text-white">Hangfelvétel</span>
				<Switch bind:checked={editRequireAudio} disabled={savingEdit} label="Hangfelvétel kérése" />
			</div>
			<div class="flex items-center justify-between gap-2">
				<span class="text-[14px] font-bold text-ink-900 dark:text-white">Fájl feltöltés</span>
				<Switch bind:checked={editRequireFiles} disabled={savingEdit} label="Fájl feltöltés kérése" />
			</div>
		</div>
		<div class="grid grid-cols-2 gap-2.5">
			<Button variant="outline" block disabled={savingEdit} onclick={() => (editOpen = false)}>
				Mégse
			</Button>
			<Button type="submit" block busy={savingEdit}>
				{savingEdit ? 'Mentés…' : 'Mentés'}
			</Button>
		</div>
		<Button variant="danger" block disabled={savingEdit} onclick={() => (deleteOpen = true)}>
			<Trash2 size={16} /> Beadandó törlése
		</Button>
	</form>
</Drawer>

<ConfirmDialog
	open={deleteOpen}
	title="Beadandó törlése"
	description="A beadandó és minden beküldés végleg törlődik. Ez nem vonható vissza."
	confirmLabel="Törlöm"
	busy={deleting}
	onClose={() => {
		if (!deleting) deleteOpen = false;
	}}
	onConfirm={deleteAssignment}
/>
