<script lang="ts">
	/**
	 * Térerő-szerű tudásszint-jelző a 0–4-es számlálóból (régi KnowledgeSignal).
	 * 0 csík = még semmi (üres), 1 csík + piros, 2–3 csík + sárga, 4 csík + zöld.
	 */
	interface Props {
		level: number;
		height?: number;
		label?: string;
	}

	let { level, height = 14, label }: Props = $props();

	const bars = $derived(Math.min(4, Math.max(0, level)));
	const color = $derived(
		bars >= 4 ? 'var(--forest)' : bars <= 1 ? 'var(--wine)' : 'var(--brass)'
	);
</script>

<span
	role="img"
	aria-label={label ?? `${bars}/4`}
	class="inline-flex items-end gap-[2px]"
>
	{#each [0, 1, 2, 3] as i (i)}
		<span
			class="w-[3px] rounded-full"
			style="height: {height * (0.35 + (0.65 * (i + 1)) / 4)}px; background: {i < bars ? color : 'color-mix(in srgb, var(--graphite) 30%, transparent)'}"
		></span>
	{/each}
</span>
