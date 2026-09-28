<script lang="ts">
	import { browser } from '$app/environment';
	import { X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { lockBody, motionOK } from '$lib/overlay';

	/* Teljes képernyős ablak kvízekhez és szókártyákhoz (Quizlet-minta):
	   fade belépés, sticky fejléc X-szel, Escape, fókuszcsapda. */

	interface Props {
		open: boolean;
		label: string;
		title?: string;
		onClose: () => void;
		children: Snippet;
	}

	let { open, label, title, onClose, children }: Props = $props();

	let panel: HTMLElement | null = $state(null);
	let render = $state(false);
	let shown = $state(false);
	let returnTo: HTMLElement | null = null;
	// Gyors nyit-csuk sorozatnal az elavult rAF es idozito nem irhatja
	// felul az uj allapotot: minden atmenet sajat sorszamot kap.
	let generation = 0;
	let animOn = $state(true);
	const outMs = $derived(animOn ? 200 : 0);

	$effect(() => {
		if (open) {
			const gen = ++generation;
			animOn = motionOK();
			if (browser && document.activeElement instanceof HTMLElement) returnTo = document.activeElement;
			render = true;
			const raf = requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					if (gen !== generation) return;
					shown = true;
					panel?.focus({ preventScroll: true });
				})
			);
			return () => cancelAnimationFrame(raf);
		} else {
			const gen = ++generation;
			shown = false;
			const t = setTimeout(() => {
				if (gen !== generation) return;
				render = false;
				if (browser && returnTo?.isConnected) returnTo.focus({ preventScroll: true });
				returnTo = null;
			}, outMs + 30);
			return () => clearTimeout(t);
		}
	});

	$effect(() => {
		if (!browser || !render) return;
		return lockBody();
	});

	function beginClose() {
		if (!render) {
			onClose();
			return;
		}
		const gen = ++generation;
		shown = false;
		setTimeout(() => {
			if (gen !== generation) return;
			onClose();
		}, outMs);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			beginClose();
			return;
		}
		if (e.key !== 'Tab' || !panel) return;
		const items = panel.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
		);
		const list = [...items].filter((el) => el.offsetParent !== null || el === document.activeElement);
		if (list.length === 0) {
			e.preventDefault();
			panel.focus();
			return;
		}
		const first = list[0];
		const last = list[list.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
</script>

{#if render}
	<div
		bind:this={panel}
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		aria-label={title ?? label}
		onkeydown={onKey}
		class={[
			'fixed inset-0 z-[80] flex flex-col bg-white outline-none dark:bg-stone-950',
			animOn ? 'transition-opacity duration-200' : '',
			shown ? 'opacity-100' : 'pointer-events-none opacity-0'
		]}
	>
		<header
			class="shrink-0 border-b border-stone-200 bg-white dark:border-white/10 dark:bg-stone-950"
			style="padding-top: max(0.5rem, env(safe-area-inset-top))"
		>
			<div class="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-2.5">
				<p class="min-w-0 flex-1 truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
					{title ?? label}
				</p>
				<button
					type="button"
					onclick={beginClose}
					aria-label="Bezárás"
					class="grid size-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-500 transition duration-300 hover:rotate-90 hover:bg-stone-200 hover:text-ink-900 active:scale-95 motion-reduce:transition-none motion-reduce:hover:rotate-0 dark:bg-white/10 dark:text-stone-300 dark:hover:bg-white/15 dark:hover:text-white"
				>
					<X size={19} />
				</button>
			</div>
		</header>
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
			<div class="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 pb-6">
				<div class="m-auto w-full">
					{@render children()}
				</div>
			</div>
		</div>
	</div>
{/if}
