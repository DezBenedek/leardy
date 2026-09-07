<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	interface Props {
		value: number;
		duration?: number;
	}

	let { value, duration = 700 }: Props = $props();

	const reduced =
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	// svelte-ignore state_referenced_locally — duration szándékosan csak induláskor kell
	const shown = new Tween(0, { duration: reduced ? 0 : duration, easing: cubicOut });

	$effect(() => {
		shown.set(value);
	});
</script>

{Math.round(shown.current)}
