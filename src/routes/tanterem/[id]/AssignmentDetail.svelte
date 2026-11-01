<script lang="ts">
	import { CalendarDays, Check, ChevronRight, Paperclip, Plus, Send, Trash2, Undo2, X } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Switch from '$lib/ui/Switch.svelte';
	import { fmtDate, fmtSize } from './classroom-format';
	import {
		assignmentStatus,
		uploadUrl,
		type AssignmentMine,
		type AssignmentRow,
		type FeedAssignment,
		type UploadItem
	} from './classroom-task-utils';

	let {
		assignment,
		roomId,
		isOwner,
		mine,
		uploads,
		results,
		loading,
		text = $bindable(''),
		saving,
		textSaved,
		submitBusy,
		uploadBusy,
		editing = $bindable(false),
		editTitle = $bindable(''),
		editDesc = $bindable(''),
		editDue = $bindable(''),
		editRequireText = $bindable(true),
		editRequireImages = $bindable(false),
		editRequireFiles = $bindable(false),
		editRequireAudio = $bindable(false),
		savingEdit,
		deleting,
		confirmDelete = $bindable(false),
		editError,
		inputCls,
		onTextInput,
		onSubmit,
		onAddAttachment,
		onDeleteUpload,
		onSaveEdit,
		onCancelEdit,
		onDeleteAssignment,
		onGradeSelect
	}: {
		assignment: FeedAssignment;
		roomId: string;
		isOwner: boolean;
		mine: AssignmentMine | null;
		uploads: UploadItem[];
		results: AssignmentRow[];
		loading: boolean;
		text: string;
		saving: boolean;
		textSaved: boolean;
		submitBusy: boolean;
		uploadBusy: boolean;
		editing: boolean;
		editTitle: string;
		editDesc: string;
		editDue: string;
		editRequireText: boolean;
		editRequireImages: boolean;
		editRequireFiles: boolean;
		editRequireAudio: boolean;
		savingEdit: boolean;
		deleting: boolean;
		confirmDelete: boolean;
		editError: string | null;
		inputCls: string;
		onTextInput: () => void;
		onSubmit: (want: boolean) => void;
		onAddAttachment: () => void;
		onDeleteUpload: (id: string) => void;
		onSaveEdit: (e: SubmitEvent) => void;
		onCancelEdit: () => void;
		onDeleteAssignment: () => void;
		onGradeSelect: (row: AssignmentRow) => void;
	} = $props();

	const aSubmitted = $derived((mine?.submitted ?? 0) === 1);
	const aPastDue = $derived(assignment.due_date !== null && Date.now() > (assignment.due_date ?? 0));
	const aSubmittedCount = $derived(results.filter((r) => r.submitted === 1).length);
	const aImages = $derived(uploads.filter((u) => u.kind === 'image'));
	const aFiles = $derived(uploads.filter((u) => u.kind === 'file'));
	const aAudios = $derived(uploads.filter((u) => u.kind === 'audio'));
	const aTotal = $derived(aImages.length + aAudios.length + aFiles.length);
</script>

{#if editing}
	<form id="edit-assignment" onsubmit={onSaveEdit} class="mt-3 grid gap-3.5" novalidate>
		<Input label="Beadandó címe" required placeholder="pl. Olvasónapló 1. fejezet" bind:value={editTitle} disabled={savingEdit} error={editError} />
		<div>
			<label for="edit-assignment-desc" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
				Leírás
			</label>
			<textarea
				id="edit-assignment-desc"
				rows="3"
				maxlength="2000"
				placeholder="Mit kell beadni? (nem kötelező)"
				bind:value={editDesc}
				disabled={savingEdit}
				class={inputCls}
			></textarea>
		</div>
		<div>
			<label for="edit-assignment-due" class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
				<CalendarDays size={14} /> Határidő <span class="font-normal text-stone-400">(üresen hagyható)</span>
			</label>
			<input
				id="edit-assignment-due"
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
		<div class="grid gap-2.5">
			<Button variant="outline" block disabled={savingEdit} onclick={onCancelEdit}>
				Mégse
			</Button>
		</div>
		{#if !confirmDelete}
			<Button variant="danger" block disabled={savingEdit} onclick={() => (confirmDelete = true)}>
				<Trash2 size={16} /> Beadandó törlése
			</Button>
		{:else}
			<div class="grid grid-cols-2 gap-2.5">
				<Button variant="outline" block disabled={deleting} onclick={() => (confirmDelete = false)}>
					Mégse
				</Button>
				<Button variant="danger" block busy={deleting} onclick={onDeleteAssignment}>
					{deleting ? 'Törlés…' : 'Biztosan törlöm'}
				</Button>
			</div>
		{/if}
	</form>
{:else}
	<div class="mt-3 grid min-w-0 gap-3 overflow-hidden">
		{#if assignment.description}
			<p class="text-sm leading-relaxed break-words whitespace-pre-line text-stone-600 dark:text-stone-300">{assignment.description}</p>
		{/if}
		{#if assignment.due_date}
			{@const late = assignment.due_date < Date.now()}
			<p class="flex items-center gap-1.5 text-[13px] font-bold {late ? 'text-red-600 dark:text-red-300' : 'text-stone-500 dark:text-stone-400'}">
				<CalendarDays size={14} />
				{late ? 'Lejárt: ' : 'Határidő: '}{fmtDate(assignment.due_date)}
			</p>
		{/if}
		{#if loading}
			<p class="text-[13px] text-stone-400 dark:text-stone-500">Betöltés…</p>
		{:else if !isOwner}
			{#if aSubmitted && mine && (mine.grade !== null || (mine.feedback ?? '') !== '')}
				<div class="rounded-2xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
					<p class="text-[12px] font-bold text-brand-600 dark:text-brand-300">Tanári értékelés</p>
					{#if mine.grade !== null}
						<p class="flex items-center gap-2 text-[15px] font-extrabold text-ink-900 dark:text-white">
							<span class="grid size-7 place-items-center rounded-full bg-brand-500 text-[14px] text-white">
								{mine.grade}
							</span>
							Érdemjegy
						</p>
					{/if}
					{#if mine.feedback}
						<p class="mt-1 text-sm leading-relaxed break-words whitespace-pre-line text-stone-600 dark:text-stone-300">{mine.feedback}</p>
					{/if}
				</div>
			{/if}
			{#if assignment.require_text}
				<div>
					<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">Szöveges válasz</p>
					{#if aSubmitted}
						<p class="text-sm leading-relaxed break-words whitespace-pre-wrap text-stone-700 dark:text-stone-200">{mine?.text_body || 'Nincs szöveges válasz.'}</p>
					{:else}
						<label for="assignment-text" class="sr-only">Szöveges válasz</label>
						<textarea
							id="assignment-text"
							rows="5"
							maxlength="20000"
							placeholder="Írd ide a beadandót…"
							bind:value={text}
							oninput={onTextInput}
							disabled={submitBusy || aPastDue}
							class={inputCls}
						></textarea>
						<p class="mt-1 text-[12px] text-stone-400 tabular-nums dark:text-stone-500">
							{text.trim().length} karakter{saving ? ' · Mentés…' : textSaved ? ' · Mentve' : ''}
						</p>
					{/if}
				</div>
			{/if}

			{#if assignment.require_images || (assignment.require_audio ?? 0) === 1 || assignment.require_files}
				<div class="rounded-2xl border border-stone-200 {aSubmitted ? 'p-2.5' : 'p-3.5'} dark:border-white/10">
					<div class="mb-1 flex items-center gap-2">
						<p class="flex min-w-0 flex-1 items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
							<Paperclip size={14} /> Csatolmányok ({aTotal})
						</p>
						{#if !aPastDue && !aSubmitted}
							<button
								type="button"
								aria-label="Csatolmány hozzáadása"
								disabled={uploadBusy}
								onclick={onAddAttachment}
								class="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 active:scale-95 disabled:opacity-60"
							>
								<Plus size={17} />
							</button>
						{/if}
					</div>
					{#if aTotal === 0 && !uploadBusy}
						<p class="text-[13px] text-stone-400 dark:text-stone-500">
							Még nincs csatolmány. A + gombbal adhatsz hozzá képet, hangot vagy fájlt.
						</p>
					{/if}
					{#if uploadBusy}
						<p class="text-[13px] text-stone-400 dark:text-stone-500">Feltöltés…</p>
					{/if}
					{#if assignment.require_images && aImages.length > 0}
						<div class="mt-1.5 grid {aSubmitted ? 'grid-cols-4 gap-1' : 'grid-cols-3 gap-1.5'}">
							{#each aImages as u (u.id)}
								<div class="group relative overflow-hidden bg-stone-100 dark:bg-white/10">
									<img src={uploadUrl(roomId, assignment.id, u.id)} alt={u.file_name} loading="lazy" class="aspect-square w-full object-cover" />
									{#if !aSubmitted && !aPastDue}
										<button
											type="button"
											aria-label="Kép törlése"
											onclick={() => onDeleteUpload(u.id)}
											class="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
										>
											<X size={14} />
										</button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
					{#if (assignment.require_audio ?? 0) === 1 && aAudios.length > 0}
						<ul class="mt-1.5 grid {aSubmitted ? 'gap-1' : 'gap-2'}">
							{#each aAudios as u, i (u.id)}
								<li class="rounded-xl bg-stone-100 {aSubmitted ? 'p-1.5' : 'p-2.5'} dark:bg-white/10">
									<div class="flex items-center gap-2">
										<p class="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">
											Hangfelvétel {i + 1} <span class="font-normal text-stone-400">({fmtSize(u.size)})</span>
										</p>
										{#if !aSubmitted && !aPastDue}
											<button
												type="button"
												aria-label="Hangfelvétel törlése"
												onclick={() => onDeleteUpload(u.id)}
												class="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-black/5 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
											>
												<X size={15} />
											</button>
										{/if}
									</div>
									<audio controls preload="none" src={uploadUrl(roomId, assignment.id, u.id)} class="mt-1.5 w-full"></audio>
								</li>
							{/each}
						</ul>
					{/if}
					{#if assignment.require_files && aFiles.length > 0}
						<ul class="mt-1.5 grid {aSubmitted ? 'gap-1' : 'gap-1.5'}">
							{#each aFiles as u (u.id)}
								<li class="flex items-center gap-2 rounded-xl bg-stone-100 {aSubmitted ? 'px-2.5 py-1.5' : 'px-3 py-2'} dark:bg-white/10">
									<a href={uploadUrl(roomId, assignment.id, u.id)} class="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-700 dark:text-stone-200" download>
										{u.file_name} <span class="font-normal text-stone-400">({fmtSize(u.size)})</span>
									</a>
									{#if !aSubmitted && !aPastDue}
										<button
											type="button"
											aria-label="Fájl törlése"
											onclick={() => onDeleteUpload(u.id)}
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
			{#if aSubmitted}
				<p class="flex items-center gap-1.5 text-[14px] font-extrabold text-emerald-700 dark:text-emerald-300">
					<Check size={16} /> {aTotal > 0 ? 'Beküldve' : 'Késznek jelölve'}{#if mine?.submitted_at} · {fmtDate(mine.submitted_at)}{/if}
				</p>
				<Button variant="outline" block disabled={submitBusy || saving || uploadBusy || aPastDue} onclick={() => onSubmit(false)}>
					<Undo2 size={16} /> Visszavonom
				</Button>
			{:else}
				<Button block disabled={submitBusy || saving || uploadBusy || aPastDue} onclick={() => onSubmit(true)}>
					<Send size={16} /> {submitBusy ? '…' : aTotal > 0 ? 'Beküldöm' : 'Megjelölés készként'}
				</Button>
				{#if aPastDue}
					<p class="text-[12px] text-stone-400 dark:text-stone-500">A határidő lejárt, már nem küldhető be.</p>
				{/if}
			{/if}
		{:else}
			<div>
				<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">
					Beküldések ({aSubmittedCount}/{results.length})
				</p>
				{#if loading}
					<p class="text-[13px] text-stone-400 dark:text-stone-500">Betöltés…</p>
				{:else if results.length === 0}
					<p class="text-[13px] text-stone-400 dark:text-stone-500">Még senki sem küldte be.</p>
				{:else}
					<ul class="grid min-w-0 gap-1.5 overflow-hidden">
						{#each results as r (r.user_id)}
							{@const graded = r.grade !== null && r.grade !== undefined}
							{@const done = r.submitted === 1}
							<li class="min-w-0">
								<button
									type="button"
									onclick={() => onGradeSelect(r)}
									aria-label={`${r.name} beküldésének megtekintése`}
									class="flex w-full min-w-0 items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-left transition hover:bg-stone-200/70 active:scale-[0.99] dark:bg-white/10 dark:hover:bg-white/15"
								>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">
											{r.name}
										</span>
										<span class="block truncate text-[12px] {graded || done ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'text-stone-400 dark:text-stone-500'}">
											{assignmentStatus(r)}
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
		{/if}
	</div>
{/if}
