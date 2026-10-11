<script lang="ts">
	import { browser } from '$app/environment';
	import Button from '$lib/ui/Button.svelte';
	import { lockBody, motionOK } from '$lib/overlay';

	/* Globalis megerosito dialogus nyomva-tartos gombbal.
	   Hasznalat: osztaly kilepes, osztaly torles (nevbeirassal).
	   A megerosito gombot lenyomva kell tartani `holdMs`-ig, a csik mutatja
	   a haladast. Roviden megnyomva nem tortenik semmi. */

	interface RequireText {
		label: string;
		placeholder?: string;
		expected: string;
	}

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		holdLabel?: string;
		tone?: 'danger' | 'primary';
		holdMs?: number;
		requireText?: RequireText | null;
		busy?: boolean;
		onClose: () => void;
		onConfirm: () => void;
	}

	let {
		open,
		title,
		description = '',
		confirmLabel = 'Megerősítés',
		cancelLabel = 'Mégse',
		holdLabel = 'Tartsd nyomva a megerősítéshez',
		tone = 'danger',
		holdMs = 1100,
		requireText = null,
		busy = false,
		onClose,
		onConfirm
	}: Props = $props();

	let text = $state('');
	let progress = $state(0);
	let holding = $state(false);
	let finished = $state(false);
	let raf = 0;
	let startTs = 0;

	const wait = $derived(Math.max(400, holdMs));

	let matches = $derived(!requireText || text.trim() === requireText.expected.trim());
	let canHold = $derived(!busy && matches && !finished);

	// Felnyilo/lecsukodo animacio a Drawer mintajara: kesleltetett
	// lecsatolassal, hogy zaraskor is lejatszodjon a mozgas.
	let panel: HTMLElement | null = $state(null);
	let render = $state(false);
	let shown = $state(false);
	let animOn = $state(true);
	const outMs = $derived(animOn ? 230 : 0);
	const anim = $derived(animOn ? 'duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]' : 'duration-0');
	// Gyors nyit-csuk sorozatnal az elavult idozitok nem irhatjak felul
	// az uj allapotot: minden atmenet sajat sorszamot kap.
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

	// Hatter-gorgetes zar, amig latszik (referencia-szamlalt).
	$effect(() => {
		if (!browser || !render) return;
		return lockBody();
	});

	function beginClose() {
		if (busy) return;
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

	// Nyitáskor mindig tiszta állapot.
	$effect(() => {
		if (open) {
			text = '';
			progress = 0;
			holding = false;
			finished = false;
			stopLoop();
		}
	});

	function stopLoop() {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
	}

	function cancelHold() {
		holding = false;
		stopLoop();
		if (!finished) progress = 0;
	}

	function tick(now: number) {
		if (!holding) return;
		progress = Math.min(1, (now - startTs) / wait);
		if (progress >= 1) {
			holding = false;
			finished = true;
			stopLoop();
			onConfirm();
			return;
		}
		raf = requestAnimationFrame(tick);
	}

	function startHold() {
		if (!open || !canHold || holding || finished) return;
		holding = true;
		progress = 0;
		startTs = performance.now();
		raf = requestAnimationFrame(tick);
	}

	function onKeyDown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape' && !busy) beginClose();
	}

	function confirmKeyDown(e: KeyboardEvent) {
		if (e.repeat) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			startHold();
		}
	}
</script>

<svelte:window onkeydown={onKeyDown} />

{#if render}
	<div class="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
		<button
			type="button"
			tabindex="-1"
			aria-label="Bezárás"
			disabled={busy}
			onclick={beginClose}
			class={[
				'absolute inset-0 bg-ink-900/45 transition-opacity disabled:cursor-default dark:bg-black/60',
				animOn ? 'duration-200' : 'duration-0',
				shown ? 'opacity-100' : 'pointer-events-none opacity-0'
			]}
		></button>
		<div
			bind:this={panel}
			tabindex="-1"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			class={[
				'relative flex max-h-[92dvh] w-full flex-col overflow-y-auto bg-white px-5 pt-3 pb-5 shadow-2xl outline-none sm:max-w-md sm:px-6 sm:pb-6 dark:bg-stone-900',
				'rounded-t-(--radius-sheet) sm:rounded-(--radius-sheet)',
				'transition-all',
				anim,
				shown
					? 'translate-y-0 opacity-100 sm:scale-100'
					: 'translate-y-full opacity-100 sm:translate-y-10 sm:scale-[0.98] sm:opacity-0'
			]}
		>
			<div class="mx-auto mb-2 h-1.5 w-11 shrink-0 rounded-full bg-stone-200 sm:hidden dark:bg-white/15"></div>
			<h2 class="font-display text-[20px] leading-snug font-extrabold tracking-tight text-ink-900 dark:text-white">
				{title}
			</h2>
			{#if description}
				<p class="mt-1.5 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
					{description}
				</p>
			{/if}
			{#if requireText}
				<div class="mt-3">
					<label for="confirm-text" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
						{requireText.label}
					</label>
					<input
						id="confirm-text"
						type="text"
						autocomplete="off"
						placeholder={requireText.placeholder ?? requireText.expected}
						bind:value={text}
						disabled={busy}
						class="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:ring-brand-500/20"
					/>
					{#if text.length > 0 && !matches}
						<p class="mt-1.5 text-[13px] font-semibold text-red-600 dark:text-red-300">
							Írd be pontosan: {requireText.expected}
						</p>
					{/if}
				</div>
			{/if}
			<div class="mt-4 grid grid-cols-2 gap-2.5">
				<Button variant="outline" block disabled={busy} onclick={beginClose}>
					{cancelLabel}
				</Button>
				<button
					type="button"
					disabled={!canHold}
					aria-label={confirmLabel}
					onpointerdown={startHold}
					onpointerup={cancelHold}
					onpointerleave={cancelHold}
					onpointercancel={cancelHold}
					onkeydown={confirmKeyDown}
					onkeyup={cancelHold}
					oncontextmenu={(e) => e.preventDefault()}
					class={[
						'relative block w-full touch-none overflow-hidden rounded-full px-4 py-2.5 text-sm font-bold text-white transition select-none',
						'active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100',
						'disabled:cursor-not-allowed disabled:opacity-60',
						tone === 'danger' ? 'bg-red-600' : 'bg-brand-500 shadow-lg shadow-brand-500/20'
					]}
				>
					<span
						aria-hidden="true"
						style={`width: ${Math.round(progress * 100)}%`}
						class="absolute inset-y-0 left-0 bg-black/25"
					></span>
					<span class="relative">{busy ? '…' : confirmLabel}</span>
				</button>
			</div>
			{#if !busy}
				<p class="mt-2.5 text-center text-[12px] font-semibold text-stone-400 dark:text-stone-500">
					{requireText && !matches ? 'Előbb írd be a nevet' : holdLabel}
				</p>
			{/if}
		</div>
	</div>
{/if}
