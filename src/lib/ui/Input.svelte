<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props {
		value?: string;
		id?: string;
		label?: string;
		hint?: string;
		error?: string | null;
		type?: string;
		placeholder?: string;
		disabled?: boolean;
		required?: boolean;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		name?: string;
	}

	let {
		value = $bindable(''),
		id = `ui-${Math.random().toString(36).slice(2, 8)}`,
		label,
		hint,
		error = null,
		type = 'text',
		placeholder,
		disabled = false,
		required = false,
		autocomplete,
		name
	}: Props = $props();

	let describedBy = $derived(
		[error ? `${id}-err` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined
	);
</script>

<div>
	{#if label}
		<label for={id} class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
			{label}{#if required} <span aria-hidden="true" class="text-red-500">*</span>{/if}
		</label>
	{/if}
	<input
		{id}
		{name}
		{type}
		{placeholder}
		{disabled}
		{required}
		{autocomplete}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		class={[
			'w-full rounded-xl border bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition',
			'placeholder:text-stone-400 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500',
			'disabled:cursor-not-allowed disabled:opacity-60',
			'motion-reduce:transition-none',
			error
				? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-500/20'
				: 'border-stone-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/15 dark:focus:ring-brand-500/20'
		]}
	/>
	{#if error}
		<p id="{id}-err" role="alert" class="mt-1.5 text-[13px] font-medium text-red-600 dark:text-red-300">
			{error}
		</p>
	{:else if hint}
		<p id="{id}-hint" class="mt-1.5 text-[13px] text-stone-500 dark:text-stone-400">{hint}</p>
	{/if}
</div>
