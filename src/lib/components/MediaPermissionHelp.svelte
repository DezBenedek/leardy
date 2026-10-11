<script lang="ts">
	import { browser } from '$app/environment';
	import { Mic, RotateCcw, Video, X } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import { lockBody, motionOK } from '$lib/overlay';

	/* Engedélykérő ablak: ha a böngésző/PWA nem adja oda a mikrofont vagy a
	   kamerát (letiltott engedély telefonon), lépésről lépésre mutatja a bekapcsolást.
	   Saját rétegen (z-100), hogy rögzítő felett is látszódjon. */

	interface Props {
		open: boolean;
		kind: 'microphone' | 'camera';
		onClose: () => void;
		onRetry?: () => void;
	}

	let { open, kind, onClose, onRetry }: Props = $props();

	let isMic = $derived(kind === 'microphone');

	// Felnyilo/lecsukodo animacio a Drawer mintajara: kesleltetett
	// lecsatolassal, hogy zaraskor is lejatszodjon a mozgas.
	let panel: HTMLElement | null = $state(null);
	let render = $state(false);
	let shown = $state(false);
	let animOn = $state(true);
	const outMs = $derived(animOn ? 230 : 0);
	const anim = $derived(animOn ? 'duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]' : 'duration-0');
	let generation = 0;

	$effect(() => {
		if (open) {
			const gen = ++generation;
			animOn = motionOK();
			render = true;
			const raf1 = requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					if (gen !== generation) return;
					shown = true;
					panel?.focus({ preventScroll: true });
				})
			);
			return () => {
				cancelAnimationFrame(raf1);
			};
		} else {
			const gen = ++generation;
			shown = false;
			const t = setTimeout(() => {
				if (gen !== generation) return;
				render = false;
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
		if (e.key === 'Escape') beginClose();
	}
</script>

<svelte:window onkeydown={render ? onKey : undefined} />

{#if render}
	<div class="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
		<button
			type="button"
			tabindex="-1"
			aria-label="Bezárás"
			onclick={beginClose}
			class={[
				'absolute inset-0 bg-ink-900/55 transition-opacity dark:bg-black/70',
				animOn ? 'duration-200' : 'duration-0',
				shown ? 'opacity-100' : 'pointer-events-none opacity-0'
			]}
		></button>
		<div
			bind:this={panel}
			tabindex="-1"
			role="dialog"
			aria-modal="true"
			aria-label={isMic ? 'Mikrofon engedélyezése' : 'Kamera engedélyezése'}
			class={[
				'relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto bg-white px-5 pt-3 pb-5 shadow-2xl outline-none sm:px-6 sm:pb-6 dark:bg-stone-900',
				'rounded-t-(--radius-sheet) sm:rounded-(--radius-sheet)',
				'transition-all',
				anim,
				shown
					? 'translate-y-0 opacity-100 sm:scale-100'
					: 'translate-y-full opacity-100 sm:translate-y-10 sm:scale-[0.98] sm:opacity-0'
			]}
		>
			<div class="mx-auto mb-2 h-1.5 w-11 shrink-0 rounded-full bg-stone-200 sm:hidden dark:bg-white/15"></div>
			<div class="flex items-center gap-2">
				<h2 class="font-display min-w-0 flex-1 text-[20px] leading-snug font-extrabold tracking-tight text-ink-900 dark:text-white">
					{isMic ? 'Mikrofon engedélyezése' : 'Kamera engedélyezése'}
				</h2>
				<IconButton ariaLabel="Bezárás" size={40} onclick={beginClose}>
					<X size={18} />
				</IconButton>
			</div>

			<div class="mt-3 grid min-w-0 gap-3 overflow-hidden">
				<p class="flex items-start gap-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
					{#if isMic}
						<Mic size={18} class="mt-0.5 shrink-0 text-brand-500" />
					{:else}
						<Video size={18} class="mt-0.5 shrink-0 text-brand-500" />
					{/if}
					<span>
						Nem sikerült elérni a(z) {isMic ? 'mikrofont' : 'kamerát'}. Valószínűleg le van tiltva
						az engedély. Kapcsold be, így:
					</span>
				</p>
				<ol class="grid gap-2 text-[14px] leading-relaxed text-ink-900 dark:text-white">
					<li class="flex gap-2">
						<span class="grid size-6 shrink-0 place-items-center rounded-full bg-brand-500/10 text-[12px] font-extrabold text-brand-600 dark:text-brand-300">1</span>
						<span>Koppints a <strong>lakat</strong> (vagy infó) ikonra a böngésző címsorában.</span>
					</li>
					<li class="flex gap-2">
						<span class="grid size-6 shrink-0 place-items-center rounded-full bg-brand-500/10 text-[12px] font-extrabold text-brand-600 dark:text-brand-300">2</span>
						<span>Állítsd <strong>Engedélyezve</strong> értékre a(z) {isMic ? 'Mikrofon' : 'Kamera'} kapcsolót.</span>
					</li>
					<li class="flex gap-2">
						<span class="grid size-6 shrink-0 place-items-center rounded-full bg-brand-500/10 text-[12px] font-extrabold text-brand-600 dark:text-brand-300">3</span>
						<span>
							Telepített app esetén: telefon <strong>Beállítások → Alkalmazások → Leardy → Engedélyek</strong>,
							ott kapcsold be a(z) {isMic ? 'mikrofont' : 'kamerát'}.
						</span>
					</li>
					<li class="flex gap-2">
						<span class="grid size-6 shrink-0 place-items-center rounded-full bg-brand-500/10 text-[12px] font-extrabold text-brand-600 dark:text-brand-300">4</span>
						<span>Gyere vissza ide, és koppints az <strong>Újrapróbálom</strong> gombra.</span>
					</li>
				</ol>
				<div class="grid grid-cols-2 gap-2.5">
					<Button variant="outline" block onclick={beginClose}>Értem</Button>
					<Button
						block
						onclick={() => {
							// Szinkron zaras: a szulo allapota azonnal valt, igy egy
							// sikertelen ujraprobalkozas is biztonsagosan ujranyithat.
							// A csukodo animaciot az open-effect jatsza le.
							onClose();
							onRetry?.();
						}}
					>
						<RotateCcw size={16} /> Újrapróbálom
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}
