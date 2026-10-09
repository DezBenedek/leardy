<script lang="ts">
	import { CalendarDays, Check, ChevronRight, FileText, Paperclip, Plus, Send, Undo2, X } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import AttachPickSheet, { type AttachKind } from '$lib/components/AttachPickSheet.svelte';
	import AssignmentImageEditor from '$lib/components/AssignmentImageEditor.svelte';
	import AssignmentAudioRecorder from '$lib/components/AssignmentAudioRecorder.svelte';
	import AssignmentGrading from '$lib/components/AssignmentGrading.svelte';
	import { toast } from '$lib/toast.svelte';

	/* Beadandó-részletező a kezdőlapról: szöveg + egységes Csatolmányok
	   (+ választóval) + beküldés diáknak, eredménylista tanárnak. */

	export interface AssignmentDetail {
		id: string;
		classroomId: string;
		title: string;
		dueDate: number | null;
		roomName: string;
		own: boolean;
		description: string;
		require_text: number;
		require_images: number;
		require_files: number;
		require_audio: number;
	}

	interface AssignmentMine {
		text_body: string | null;
		submitted: number;
		submitted_at: number | null;
		grade: number | null;
		feedback: string;
		graded_at: number | null;
	}

	interface AssignmentUpload {
		id: string;
		kind: string;
		file_name: string;
		mime: string;
		size: number;
	}

	interface AssignmentResultRow {
		user_id: string;
		name: string;
		text_body: string;
		submitted: number;
		submitted_at: number | null;
		grade: number | null;
		feedback: string;
		graded_at: number | null;
		image_count: number;
		file_count: number;
		uploads: AssignmentUpload[];
	}

	interface Props {
		assignment?: AssignmentDetail | null;
		onClose: () => void;
		onChanged?: () => void;
	}

	let { assignment = null, onClose, onChanged }: Props = $props();

	let loading = $state(false);
	let mine = $state<AssignmentMine | null>(null);
	let uploads = $state<AssignmentUpload[]>([]);
	let results = $state<AssignmentResultRow[]>([]);
	let text = $state('');
	let saving = $state(false);
	/** Automatikus mentés jelzése a karakterszám mellett. */
	let textSaved = $state(false);
	let textTimer: ReturnType<typeof setTimeout> | null = null;
	let submitBusy = $state(false);
	let uploadBusy = $state(false);
	let imageEditorOpen = $state(false);
	let audioRecorderOpen = $state(false);
	let attachPickOpen = $state(false);
	let fileInputEl: HTMLInputElement | null = $state(null);
	let selected = $state<AssignmentResultRow | null>(null);
	let preview = $state<AssignmentUpload | null>(null);

	function onGradeSaved(userId: string, grade: number | null, feedback: string) {
		onChanged?.();
		results = results.map((r) =>
			r.user_id === userId ? { ...r, grade, feedback, graded_at: grade !== null || feedback !== '' ? Date.now() : null } : r
		);
		if (selected?.user_id === userId) {
			selected = { ...selected, grade, feedback, graded_at: grade !== null || feedback !== '' ? Date.now() : null };
		}
	}

	function rowStatus(r: AssignmentResultRow): string {
		if (r.grade !== null && r.grade !== undefined) return `Értékelve: ${r.grade}`;
		if (r.submitted === 1) return 'Beküldve';
		const audioCount = r.uploads.filter((u) => u.kind === 'audio').length;
		if (r.text_body || r.image_count > 0 || r.file_count > 0 || audioCount > 0) return 'Dolgozik rajta';
		return 'Még nem kezdte';
	}

	let submitted = $derived((mine?.submitted ?? 0) === 1);
	let pastDue = $derived(assignment?.dueDate != null && Date.now() > assignment.dueDate);
	let images = $derived(uploads.filter((u) => u.kind === 'image'));
	let audios = $derived(uploads.filter((u) => u.kind === 'audio'));
	let files = $derived(uploads.filter((u) => u.kind === 'file'));
	let total = $derived(images.length + audios.length + files.length);
	let submittedCount = $derived(results.filter((r) => r.submitted === 1).length);

	const inputCls =
		'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:ring-brand-500/20';

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

	function fmtDuration(s: number): string {
		if (!Number.isFinite(s) || s < 0) return '';
		const m = Math.floor(s / 60);
		const sec = Math.round(s % 60);
		return m > 0 ? `${m}p ${sec}mp` : `${sec}mp`;
	}

	function audioFileName(blob: Blob): string {
		const t = blob.type || '';
		if (t.includes('mp4') || t.includes('aac') || t.includes('m4a')) return 'hangfelvetel.m4a';
		if (t.includes('webm') || t.includes('opus') || t.includes('ogg')) return 'hangfelvetel.webm';
		return 'hangfelvetel.wav';
	}

	function uploadUrl(aid: string, uploadId: string): string {
		const a = assignment;
		return a ? `/api/classrooms/${a.classroomId}/assignments/${aid}/uploads/${uploadId}` : '#';
	}

	async function loadDetail(a: AssignmentDetail) {
		loading = true;
		try {
			const res = await fetch(`/api/classrooms/${a.classroomId}/assignments/${a.id}/submissions`);
			const j = await res.json().catch(() => ({}));
			if (!res.ok) return;
			if (a.own && Array.isArray(j.results)) {
				results = j.results as AssignmentResultRow[];
				mine = null;
				uploads = [];
			} else {
				mine = (j.mine ?? null) as AssignmentMine | null;
				uploads = Array.isArray(j.uploads) ? (j.uploads as AssignmentUpload[]) : [];
				text = j.mine?.text_body ?? '';
			}
		} catch {
			// csendben: az alapadatok így is látszanak
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		const a = assignment;
		mine = null;
		uploads = [];
		results = [];
		text = '';
		textSaved = false;
		selected = null;
		preview = null;
		if (textTimer) {
			clearTimeout(textTimer);
			textTimer = null;
		}
		if (a) void loadDetail(a);
		else {
			imageEditorOpen = false;
			audioRecorderOpen = false;
			attachPickOpen = false;
		}
	});

	function onAttachPick(kind: AttachKind) {
		if (kind === 'image') imageEditorOpen = true;
		else if (kind === 'audio') audioRecorderOpen = true;
		else fileInputEl?.click();
	}

	async function postUpload(kind: string, file: File, extra?: Record<string, string>) {
		const a = assignment;
		if (!a || uploadBusy) return;
		uploadBusy = true;
		try {
			const form = new FormData();
			form.set('kind', kind);
			form.set('file', file);
			if (extra) for (const [k, v] of Object.entries(extra)) form.set(k, v);
			const res = await fetch(`/api/classrooms/${a.classroomId}/assignments/${a.id}/uploads`, {
				method: 'POST',
				body: form
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Feltöltés sikertelen', j.error ?? 'Próbáld újra!');
				return;
			}
			if (j.upload) uploads = [...uploads, j.upload as AssignmentUpload];
			toast.success(kind === 'image' ? 'Kép feltöltve' : kind === 'audio' ? 'Hangfelvétel feltöltve' : 'Fájl feltöltve');
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			uploadBusy = false;
		}
	}

	async function onImageDone(blob: Blob, width: number, height: number) {
		imageEditorOpen = false;
		await postUpload('image', new File([blob], 'kep.webp', { type: blob.type || 'image/webp' }), {
			width: String(width),
			height: String(height)
		});
	}

	async function onAudioDone(blob: Blob, durationSec: number) {
		audioRecorderOpen = false;
		await postUpload('audio', new File([blob], audioFileName(blob), { type: blob.type || 'audio/webm' }));
		toast.success('Hangfelvétel feltöltve', `${fmtDuration(durationSec)} mentve.`);
	}

	async function onFilePicked(e: Event) {
		const input = e.target as HTMLInputElement;
		const picked = input.files ? [...input.files] : [];
		input.value = '';
		if (picked.length === 0) return;
		for (const f of picked) {
			await postUpload('file', f);
		}
	}

	async function deleteUpload(uploadId: string) {
		const a = assignment;
		if (!a) return;
		try {
			const res = await fetch(
				`/api/classrooms/${a.classroomId}/assignments/${a.id}/uploads/${uploadId}`,
				{ method: 'DELETE' }
			);
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				toast.error('Nem sikerült törölni', j.error ?? '');
				return;
			}
			uploads = uploads.filter((u) => u.id !== uploadId);
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		}
	}

	/** Szöveg automatikus mentése gépelés után (Piszkozat gomb helyett). */
	function scheduleAutosave() {
		textSaved = false;
		if (textTimer) clearTimeout(textTimer);
		textTimer = setTimeout(() => {
			textTimer = null;
			void saveText();
		}, 1000);
	}

	async function saveText() {
		const a = assignment;
		if (!a || saving || a.own) return;
		if (a.dueDate != null && Date.now() > a.dueDate && (mine?.submitted ?? 0) !== 1) return;
		saving = true;
		try {
			const res = await fetch(`/api/classrooms/${a.classroomId}/assignments/${a.id}/submissions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült menteni', j.error ?? 'Próbáld újra!');
				return;
			}
			mine = (j.mine ?? null) as AssignmentMine | null;
			if (Array.isArray(j.uploads)) uploads = j.uploads as AssignmentUpload[];
			textSaved = true;
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			saving = false;
		}
	}

	async function submit(want: boolean) {
		const a = assignment;
		if (!a || submitBusy) return;
		submitBusy = true;
		try {
			const res = await fetch(`/api/classrooms/${a.classroomId}/assignments/${a.id}/submissions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text, submitted: want })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült', j.error ?? 'Próbáld újra!');
				return;
			}
			mine = (j.mine ?? null) as AssignmentMine | null;
			if (Array.isArray(j.uploads)) uploads = j.uploads as AssignmentUpload[];
			toast.success(
				want ? (uploads.length > 0 ? 'Beadandó beküldve' : 'Késznek jelölve!') : 'Beküldés visszavonva'
			);
			onChanged?.();
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			submitBusy = false;
		}
	}
</script>

<Drawer
	open={assignment !== null}
	label="Beadandó részletei"
	title={assignment?.title || 'Beadandó'}
	onClose={onClose}
>
	{#if assignment}
		{@const a = assignment}
		{@const late = a.dueDate != null && a.dueDate < Date.now()}
		<div class="mt-3 grid min-w-0 gap-3 overflow-hidden">
			{#if a.description}
				<p class="text-sm leading-relaxed break-words whitespace-pre-line text-stone-600 dark:text-stone-300">{a.description}</p>
			{/if}
			<p class="flex items-center gap-1.5 text-[13px] font-bold {late ? 'text-red-600 dark:text-red-300' : 'text-stone-500 dark:text-stone-400'}">
				<CalendarDays size={14} />
				{#if a.dueDate != null}{late ? 'Lejárt: ' : 'Határidő: '}{fmtDate(a.dueDate)}{:else}Nincs határidő{/if}
			</p>
			{#if loading}
				<p class="text-[13px] text-stone-400 dark:text-stone-500">Betöltés…</p>
			{:else if !a.own}
				{#if a.require_text}
					<div>
						<label for="home-assignment-text" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
							Szöveges válasz
						</label>
						<textarea
							id="home-assignment-text"
							rows="5"
							maxlength="20000"
							placeholder="Írd ide a beadandót…"
							bind:value={text}
							oninput={scheduleAutosave}
							disabled={submitBusy || (submitted && pastDue)}
							class={inputCls}
						></textarea>
						<p class="mt-1 text-[12px] text-stone-400 tabular-nums dark:text-stone-500">
							{text.trim().length} karakter{saving ? ' · Mentés…' : textSaved ? ' · Mentve' : ''}
						</p>
					</div>
				{/if}
				{#if submitted && mine && (mine.grade !== null || (mine.feedback ?? '') !== '')}
					<div class="rounded-2xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
						{#if mine.grade !== null}
							<p class="flex items-center gap-2 text-[15px] font-extrabold text-ink-900 dark:text-white">
								<span class="grid size-7 place-items-center rounded-full bg-brand-500 text-[14px] text-white">
									{mine.grade}
								</span>
								Tanári értékelés
							</p>
						{/if}
						{#if mine.feedback}
							<p class="mt-1 text-sm leading-relaxed break-words whitespace-pre-line text-stone-600 dark:text-stone-300">{mine.feedback}</p>
						{/if}
					</div>
				{/if}
				{#if a.require_images || a.require_audio || a.require_files}
					<div class="rounded-2xl border border-stone-200 {submitted ? 'p-2.5' : 'p-3.5'} dark:border-white/10">
						<div class="mb-1 flex items-center gap-2">
							<p class="flex min-w-0 flex-1 items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
								<Paperclip size={14} /> Csatolmányok ({total})
							</p>
							{#if !pastDue && !submitted}
								<button
									type="button"
									aria-label="Csatolmány hozzáadása"
									disabled={uploadBusy}
									onclick={() => (attachPickOpen = true)}
									class="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 active:scale-95 disabled:opacity-60"
								>
									<Plus size={17} />
								</button>
							{/if}
						</div>
						{#if total === 0 && !uploadBusy}
							<p class="text-[13px] text-stone-400 dark:text-stone-500">
								Még nincs csatolmány. A + gombbal adhatsz hozzá képet, hangot vagy fájlt.
							</p>
						{/if}
						{#if uploadBusy}
							<p class="text-[13px] text-stone-400 dark:text-stone-500">Feltöltés…</p>
						{/if}
						{#if a.require_images && images.length > 0}
							<div class="mt-1.5 grid {submitted ? 'grid-cols-4 gap-1' : 'grid-cols-3 gap-1.5'}">
								{#each images as u (u.id)}
									<div class="group relative overflow-hidden rounded-lg bg-stone-100 dark:bg-white/10">
										<img src={uploadUrl(a.id, u.id)} alt={u.file_name} loading="lazy" class="aspect-square w-full object-cover" />
										{#if !submitted && !pastDue}
											<button
												type="button"
												aria-label="Kép törlése"
												onclick={() => deleteUpload(u.id)}
												class="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
											>
												<X size={14} />
											</button>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
						{#if a.require_audio && audios.length > 0}
							<ul class="mt-1.5 grid {submitted ? 'gap-1' : 'gap-2'}">
								{#each audios as u, i (u.id)}
									<li class="rounded-xl bg-stone-100 {submitted ? 'p-1.5' : 'p-2.5'} dark:bg-white/10">
										<div class="flex items-center gap-2">
											<p class="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">
												Hangfelvétel {i + 1} <span class="font-normal text-stone-400">({fmtSize(u.size)})</span>
											</p>
											{#if !submitted && !pastDue}
												<button
													type="button"
													aria-label="Hangfelvétel törlése"
													onclick={() => deleteUpload(u.id)}
													class="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-black/5 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
												>
													<X size={15} />
												</button>
											{/if}
										</div>
										<audio controls preload="none" src={uploadUrl(a.id, u.id)} class="mt-1.5 w-full"></audio>
									</li>
								{/each}
							</ul>
						{/if}
						{#if a.require_files && files.length > 0}
							<ul class="mt-1.5 grid {submitted ? 'gap-1' : 'gap-1.5'}">
								{#each files as u (u.id)}
									<li class="flex items-center gap-2 rounded-xl bg-stone-100 {submitted ? 'px-2.5 py-1.5' : 'px-3 py-2'} dark:bg-white/10">
										<a href={uploadUrl(a.id, u.id)} class="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-700 dark:text-stone-200" download>
											{u.file_name} <span class="font-normal text-stone-400">({fmtSize(u.size)})</span>
										</a>
										{#if !submitted && !pastDue}
											<button
												type="button"
												aria-label="Fájl törlése"
												onclick={() => deleteUpload(u.id)}
												class="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-black/5 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
											>
												<X size={15} />
											</button>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
				{#if submitted}
					<p class="flex items-center gap-1.5 text-[14px] font-extrabold text-emerald-700 dark:text-emerald-300">
						<Check size={16} /> {total > 0 ? 'Beküldve' : 'Késznek jelölve'}{#if mine?.submitted_at} · {fmtDate(mine.submitted_at)}{/if}
					</p>
					<Button variant="outline" block disabled={submitBusy || pastDue} onclick={() => submit(false)}>
						<Undo2 size={16} /> {submitBusy ? '…' : 'Visszavonom'}
					</Button>
					{#if pastDue}
						<p class="text-[12px] text-stone-400 dark:text-stone-500">
							Határidő után már nem vonható vissza.
						</p>
					{/if}
				{:else}
					<Button block disabled={submitBusy} onclick={() => submit(true)}>
						<Send size={16} /> {submitBusy ? '…' : total > 0 ? 'Beküldöm' : 'Megjelölés készként'}
					</Button>
				{/if}
			{:else}
				<div>
					<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">
						Beadások ({submittedCount}/{results.length})
					</p>
					{#if results.length === 0}
						<p class="text-[13px] text-stone-400 dark:text-stone-500">Még senki sem adta be!</p>
					{:else}
						<ul class="grid min-w-0 gap-1.5 overflow-hidden">
							{#each results as r (r.user_id)}
								{@const graded = r.grade !== null && r.grade !== undefined}
								{@const done = r.submitted === 1}
								<li class="min-w-0">
									<button
										type="button"
										onclick={() => (selected = r)}
										aria-label={`${r.name} beküldésének megtekintése`}
										class="flex w-full min-w-0 items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-left transition hover:bg-stone-200/70 active:scale-[0.99] dark:bg-white/10 dark:hover:bg-white/15"
									>
										<span class="min-w-0 flex-1">
											<span class="block truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">
												{r.name}
											</span>
											<span class="block truncate text-[12px] {graded || done ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'text-stone-400 dark:text-stone-500'}">
												{rowStatus(r)}
											</span>
										</span>
										{#if graded}
											<span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-500 text-[14px] font-extrabold text-white" title="Értékelve: {r.grade}">
												{r.grade}
											</span>
										{:else if done}
											<span class="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" title="Beküldve">
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
			{/if}
		</div>
	{/if}
</Drawer>

<Drawer
	open={selected !== null && assignment !== null}
	label="Beküldés részletei"
	title={selected?.name ?? 'Beküldés'}
	onBack={() => {
		selected = null;
		preview = null;
	}}
	onClose={() => {
		selected = null;
		preview = null;
	}}
>
	{#if selected && assignment}
		{@const s = selected}
		{@const sImgs = s.uploads.filter((u) => u.kind === 'image')}
		{@const sAuds = s.uploads.filter((u) => u.kind === 'audio')}
		{@const sFiles = s.uploads.filter((u) => u.kind === 'file')}
		<div class="mt-3 grid min-w-0 gap-3 overflow-hidden">
			<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
				<p class="mb-1 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
					Értékelés
				</p>
				<AssignmentGrading
					classroomId={assignment.classroomId}
					assignmentId={assignment.id}
					student={s}
					onSaved={onGradeSaved}
				/>
			</div>
			<p class="text-[13px] font-bold {s.submitted === 1 ? 'text-emerald-700 dark:text-emerald-300' : 'text-stone-500 dark:text-stone-400'}">
				{rowStatus(s)}{#if s.submitted === 1 && s.submitted_at} · {fmtDate(s.submitted_at)}{/if}
			</p>
			{#if s.text_body}
				<div class="rounded-2xl bg-stone-100 p-3.5 dark:bg-white/10">
					<p class="text-sm leading-relaxed break-words whitespace-pre-line text-stone-700 dark:text-stone-200">{s.text_body}</p>
				</div>
			{/if}
			{#if s.uploads.length === 0}
				<p class="text-[13px] text-stone-400 dark:text-stone-500">Nincs feltöltött fájl.</p>
			{:else}
				<div class="grid min-w-0 gap-2">
					<p class="text-[13px] font-semibold text-ink-900 dark:text-white">
						Feltöltések ({s.uploads.length})
					</p>
					{#if sImgs.length > 0}
						<ul class="grid min-w-0 gap-2">
							{#each sImgs as u (u.id)}
								<li class="min-w-0">
									<button
										type="button"
										onclick={() => (preview = u)}
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
					{#if sAuds.length > 0}
						<ul class="grid min-w-0 gap-2">
							{#each sAuds as u, i (u.id)}
								<li class="rounded-xl bg-stone-100 p-2.5 dark:bg-white/10">
									<p class="truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">
										Hangfelvétel {i + 1} <span class="font-normal text-stone-400">({fmtSize(u.size)})</span>
									</p>
									<audio controls preload="none" src={uploadUrl(assignment.id, u.id)} class="mt-1.5 w-full"></audio>
								</li>
							{/each}
						</ul>
					{/if}
					{#if sFiles.length > 0}
						<ul class="grid min-w-0 gap-1.5">
							{#each sFiles as u (u.id)}
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

{#if preview && assignment}
	<div class="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" role="presentation">
		<button type="button" tabindex="-1" aria-label="Előnézet bezárása" onclick={() => (preview = null)} class="absolute inset-0"></button>
		<div class="relative max-h-full max-w-full overflow-auto">
			<img src={uploadUrl(assignment.id, preview.id)} alt={preview.file_name} class="max-h-[80dvh] w-auto max-w-full rounded-xl" />
			<button
				type="button"
				onclick={() => (preview = null)}
				aria-label="Bezárás"
				class="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
			>
				<X size={18} />
			</button>
		</div>
	</div>
{/if}

<input
	bind:this={fileInputEl}
	type="file"
	multiple
	class="hidden"
	aria-hidden="true"
	tabindex="-1"
	onchange={onFilePicked}
/>

<AssignmentImageEditor
	open={imageEditorOpen}
	onClose={() => (imageEditorOpen = false)}
	onDone={onImageDone}
/>

<AssignmentAudioRecorder
	open={audioRecorderOpen}
	onClose={() => (audioRecorderOpen = false)}
	onDone={onAudioDone}
/>

<AttachPickSheet
	open={attachPickOpen}
	allowImage={assignment !== null && assignment.require_images === 1}
	allowAudio={assignment !== null && (assignment.require_audio ?? 0) === 1}
	allowFile={assignment !== null && assignment.require_files === 1}
	onPick={onAttachPick}
	onClose={() => (attachPickOpen = false)}
/>
