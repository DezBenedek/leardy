<script lang="ts">
	/** Kapcsoló a régi LeardyToggle alapján: 58×36-os pill, 2px keret. */
	interface Props {
		value: boolean;
		onChanged?: ((v: boolean) => void) | null;
		label?: string;
	}

	let { value, onChanged = null, label = 'Kapcsoló' }: Props = $props();
	const enabled = $derived(onChanged !== null);
</script>

<button
	type="button"
	role="switch"
	aria-checked={value}
	aria-label={label}
	disabled={!enabled}
	onclick={() => onChanged?.(!value)}
	class="grid h-9 w-[58px] shrink-0 place-items-center rounded-full border-2 p-[3px] transition-all duration-200 disabled:opacity-45"
	style={value
		? 'background: var(--primary); border-color: var(--primary); justify-items: end;'
		: 'background: var(--secondary); border-color: var(--muted-foreground); justify-items: start;'}
>
	<span
		class="block size-[26px] rounded-full"
		style={value
			? 'background: #fff; box-shadow: 0 1px 4px rgb(0 0 0 / 0.12);'
			: 'background: var(--muted-foreground);'}
	></span>
</button>
