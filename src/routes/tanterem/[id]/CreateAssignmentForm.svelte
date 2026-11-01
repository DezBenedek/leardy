<script lang="ts">
	import { CalendarDays, FileText, FileUp, Image as ImageIcon, Mic } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Switch from '$lib/ui/Switch.svelte';

	let {
		title = $bindable(''),
		desc = $bindable(''),
		due = $bindable(''),
		requireText = $bindable(true),
		requireImages = $bindable(false),
		requireFiles = $bindable(false),
		requireAudio = $bindable(false),
		creating,
		error,
		inputCls,
		onSubmit
	}: {
		title: string;
		desc: string;
		due: string;
		requireText: boolean;
		requireImages: boolean;
		requireFiles: boolean;
		requireAudio: boolean;
		creating: boolean;
		error: string | null;
		inputCls: string;
		onSubmit: (e: SubmitEvent) => void;
	} = $props();
</script>

<form onsubmit={onSubmit} class="mt-3 grid gap-3.5" novalidate>
	<Input label="Beadandó címe" required placeholder="pl. Olvasónapló 1. fejezet" bind:value={title} disabled={creating} error={error} />
	<div>
		<label for="assignment-desc" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
			Leírás
		</label>
		<textarea
			id="assignment-desc"
			rows="3"
			maxlength="2000"
			placeholder="Mit kell beadni? (nem kötelező)"
			bind:value={desc}
			disabled={creating}
			class={inputCls}
		></textarea>
	</div>
	<div>
		<label for="assignment-due" class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
			<CalendarDays size={14} /> Határidő <span class="font-normal text-stone-400">(üresen hagyható)</span>
		</label>
		<input
			id="assignment-due"
			type="datetime-local"
			bind:value={due}
			disabled={creating}
			class={[inputCls, 'dark:[color-scheme:dark]']}
		/>
	</div>
	<div class="grid gap-2">
		<p class="text-[13px] font-semibold text-ink-900 dark:text-white">Mit kell beadni?</p>
		<div class="flex items-center justify-between gap-2">
			<span class="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-900 dark:text-white"><FileText size={15} /> Szöveg</span>
			<Switch bind:checked={requireText} disabled={creating} label="Szöveg kérése" />
		</div>
		<div class="flex items-center justify-between gap-2">
			<span class="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-900 dark:text-white"><ImageIcon size={15} /> Kép feltöltés</span>
			<Switch bind:checked={requireImages} disabled={creating} label="Kép feltöltés kérése" />
		</div>
		<div class="flex items-center justify-between gap-2">
			<span class="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-900 dark:text-white"><Mic size={15} /> Hangfelvétel</span>
			<Switch bind:checked={requireAudio} disabled={creating} label="Hangfelvétel kérése" />
		</div>
		<div class="flex items-center justify-between gap-2">
			<span class="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-900 dark:text-white"><FileUp size={15} /> Fájl feltöltés</span>
			<Switch bind:checked={requireFiles} disabled={creating} label="Fájl feltöltés kérése" />
		</div>
	</div>
	<Button type="submit" block busy={creating}>
		{creating ? 'Kiosztás…' : 'Beadandó kiosztása'}
	</Button>
</form>
