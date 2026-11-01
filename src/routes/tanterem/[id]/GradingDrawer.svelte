<script lang="ts">
	import { FileText } from '@lucide/svelte';
	import AssignmentGrading from '$lib/components/AssignmentGrading.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { fmtDate, fmtSize } from './classroom-format';
	import { assignmentStatus, uploadUrl, type AssignmentRow, type UploadItem } from './classroom-task-utils';

	let {
		student,
		assignmentId,
		roomId,
		onBack,
		onClose,
		onSaved,
		onPreview
	}: {
		student: AssignmentRow | null;
		assignmentId: string | null;
		roomId: string;
		onBack: () => void;
		onClose: () => void;
		onSaved: (userId: string, grade: number | null, feedback: string) => void;
		onPreview: (upload: UploadItem) => void;
	} = $props();
</script>

<Drawer
	open={student !== null && assignmentId !== null}
	label="Beküldés részletei"
	title={student?.name ?? 'Beküldés'}
	onBack={onBack}
	onClose={onClose}
>
	{#if student && assignmentId}
		{@const gs = student}
		{@const gImgs = gs.uploads.filter((u) => u.kind === 'image')}
		{@const gAuds = gs.uploads.filter((u) => u.kind === 'audio')}
		{@const gFiles = gs.uploads.filter((u) => u.kind === 'file')}
		<div class="mt-3 grid min-w-0 gap-3 overflow-hidden">
			<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
				<p class="mb-1 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
					Értékelés
				</p>
				<AssignmentGrading
					classroomId={roomId}
					assignmentId={assignmentId}
					student={gs}
					onSaved={onSaved}
				/>
			</div>
			<p class="text-[13px] font-bold {gs.submitted === 1 ? 'text-emerald-700 dark:text-emerald-300' : 'text-stone-500 dark:text-stone-400'}">
				{assignmentStatus(gs)}{#if gs.submitted === 1 && gs.submitted_at} · {fmtDate(gs.submitted_at)}{/if}
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
										onclick={() => onPreview(u)}
										aria-label="{u.file_name} előnézete"
										class="block w-full overflow-hidden bg-stone-100 transition hover:opacity-90 active:scale-[0.99] dark:bg-white/10"
									>
										<img src={uploadUrl(roomId, assignmentId, u.id)} alt={u.file_name} loading="lazy" class="max-h-64 w-full object-cover" />
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
									<audio controls preload="none" src={uploadUrl(roomId, assignmentId, u.id)} class="mt-1.5 w-full"></audio>
								</li>
							{/each}
						</ul>
					{/if}
					{#if gFiles.length > 0}
						<ul class="grid min-w-0 gap-1.5">
							{#each gFiles as u (u.id)}
								<li>
									<a
										href={uploadUrl(roomId, assignmentId, u.id)}
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
