<script lang="ts">
	import { BookMarked, BookOpen, GraduationCap, Layers, Target, Trash2 } from '@lucide/svelte';
	import { attachmentTitle } from '$lib/content/message-attachments';
	import type { AttachPick } from '$lib/components/AttachSheet.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import AttachmentList from './AttachmentList.svelte';
	import { attachHrefFor, messageChips, type FeedMessage } from './classroom-task-utils';
	import { fmtTime } from './classroom-format';

	const attachIcons: Record<string, typeof BookOpen> = {
		subject: GraduationCap,
		lesson: BookOpen,
		quiz: Target,
		deck: Layers,
		topic: BookMarked
	};

	let {
		msg,
		displaySubject,
		editing = $bindable(false),
		editTitle = $bindable(''),
		editBody = $bindable(''),
		editAttaches = $bindable([] as AttachPick[]),
		saving,
		editError,
		inputCls,
		onSave,
		onCancel,
		onDeleteRequest,
		onOpenAttach
	}: {
		msg: FeedMessage;
		displaySubject: string;
		editing: boolean;
		editTitle: string;
		editBody: string;
		editAttaches: AttachPick[];
		saving: boolean;
		editError: string | null;
		inputCls: string;
		onSave: (e: SubmitEvent) => void;
		onCancel: () => void;
		onDeleteRequest: () => void;
		onOpenAttach: () => void;
	} = $props();

	const chips = $derived(messageChips(msg));
</script>

{#if editing}
	<form id="edit-message" onsubmit={onSave} class="mt-3 grid gap-3.5" novalidate>
		<Input label="Cím" required placeholder="Üzenet címe" bind:value={editTitle} disabled={saving} error={editError} />
		<div>
			<label for="edit-msg-body" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
				Leírás
			</label>
			<textarea
				id="edit-msg-body"
				rows="3"
				maxlength="2000"
				bind:value={editBody}
				disabled={saving}
				class={inputCls}
			></textarea>
		</div>
		<AttachmentList
			kind="message"
			messageItems={editAttaches}
			disabled={saving}
			{displaySubject}
			onAdd={onOpenAttach}
			onRemoveMessage={(a) => (editAttaches = editAttaches.filter((x) => x !== a))}
		/>
		<div class="grid gap-2.5">
			<Button variant="outline" block disabled={saving} onclick={onCancel}>
				Mégse
			</Button>
			<Button variant="danger" block disabled={saving} onclick={onDeleteRequest}>
				<Trash2 size={17} /> Üzenet törlése
			</Button>
		</div>
	</form>
{:else}
	<div class="mt-3 grid min-w-0 gap-3 overflow-hidden">
		{#if msg.body}
			<p class="text-sm leading-relaxed break-words whitespace-pre-line text-stone-600 dark:text-stone-300">{msg.body}</p>
		{/if}
		<p class="text-[12px] text-stone-400 dark:text-stone-500">
			{msg.teacher_name ?? ''} · {fmtTime(msg.created_at)}
		</p>
		{#if chips.length > 0}
			<div>
				<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">
					Csatolmányok ({chips.length})
				</p>
				<ul class="grid min-w-0 gap-1.5 overflow-hidden">
					{#each chips as c (c.ref_type + ':' + c.ref_id)}
						{@const href = attachHrefFor(c.ref_type, c.ref_id)}
						{@const AIcon = attachIcons[c.ref_type] ?? BookOpen}
						<li class="min-w-0">
							{#if href}
								<a
									{href}
									class="flex min-w-0 items-center gap-1.5 rounded-xl bg-stone-100 px-3 py-2 text-[13px] font-bold text-ink-700 transition hover:bg-stone-200/70 dark:bg-white/10 dark:text-stone-200 dark:hover:bg-white/15"
								>
									<AIcon size={16} aria-hidden="true" />
									<span class="min-w-0 flex-1 truncate">{c.ref_type === 'deck' ? c.ref_title : attachmentTitle(c.ref_title ?? '', displaySubject)}</span>
								</a>
							{:else}
								<p class="flex min-w-0 items-center gap-1.5 rounded-xl bg-stone-100 px-3 py-2 text-[13px] font-bold text-stone-500 dark:bg-white/10 dark:text-stone-400">
									{#if c.ref_type === 'topic'}<BookMarked size={14} />{/if}
									<span class="min-w-0 flex-1 truncate">{c.ref_type === 'deck' ? c.ref_title : attachmentTitle(c.ref_title ?? '', displaySubject)}</span>
								</p>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
{/if}
