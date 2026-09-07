<script lang="ts">
	interface Props {
		checked?: boolean;
		label: string;
	}

	let { checked = $bindable(false), label }: Props = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	onclick={() => (checked = !checked)}
	class={[
		'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200',
		checked ? 'bg-brand-500' : 'bg-slate-200'
	]}
>
	<span
		class={[
			'absolute top-1 size-5 rounded-full bg-white shadow transition-all duration-200',
			checked ? 'left-6' : 'left-1'
		]}
	></span>
</button>
