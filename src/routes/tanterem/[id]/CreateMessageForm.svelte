<script lang="ts">
	import type { AttachPick } from '$lib/components/AttachSheet.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import AttachmentList from './AttachmentList.svelte';

	let {
		title = $bindable(''),
		body = $bindable(''),
		attaches = $bindable([] as AttachPick[]),
		sending,
		error,
		inputCls,
		displaySubject,
		onSubmit,
		onOpenAttach
	}: {
		title: string;
		body: string;
		attaches: AttachPick[];
		sending: boolean;
		error: string | null;
		inputCls: string;
		displaySubject: string;
		onSubmit: (e: SubmitEvent) => void;
		onOpenAttach: () => void;
	} = $props();
</script>

<form onsubmit={onSubmit} class="mt-3 grid gap-3.5" novalidate>
	<Input label="Cím" required placeholder="pl. Holnapi óra" bind:value={title} disabled={sending} error={error} />
	<div>
		<label for="msg-body" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
			Leírás
		</label>
		<textarea
			id="msg-body"
			rows="3"
			maxlength="2000"
			placeholder="Részletek az osztálynak (nem kötelező)"
			bind:value={body}
			disabled={sending}
			class={inputCls}
		></textarea>
	</div>
	<AttachmentList
		kind="message"
		messageItems={attaches}
		disabled={sending}
		{displaySubject}
		onAdd={onOpenAttach}
		onRemoveMessage={(a) => (attaches = attaches.filter((x) => x !== a))}
	/>

	<Button type="submit" block busy={sending} disabled={title.trim().length < 3}>
		{sending ? 'Küldés…' : 'Üzenet küldése'}
	</Button>
</form>
