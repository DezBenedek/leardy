<script lang="ts">
	import { CircleCheck, CircleX, Info, TriangleAlert, X } from '@lucide/svelte';
	import { toast, type ToastTone } from '$lib/toast.svelte';

	const icons: Record<ToastTone, typeof Info> = {
		success: CircleCheck,
		error: CircleX,
		info: Info,
		warning: TriangleAlert
	};

	const tiles: Record<ToastTone, string> = {
		success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300',
		error: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
		info: 'bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white',
		warning: 'bg-amber-50 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300'
	};

	// Sonner-szeru stack: legfeljebb 3, a legfrissebb elol.
	// Osszecsukva a mogottesek az elulso ala bujnak (kicsit nagyobb lepcsoben mint a shadcn alap).
	// Hoverre vagy fokuszra egymas alol kicsusznak, aztan visszahuzodnak.
	// Belepes: fentrol becsuszik. Kilepes: elhalvanyul.
	const PEEK = 10;
	const GAP = 8;
	const FALLBACK_H = 74;
	const SCALES = [1, 0.95, 0.9];
	const OPACITIES = [1, 0.85, 0.6];

	let expanded = $state(false);
	let heights = $state<Record<number, number>>({});
	const visible = $derived(toast.items.slice(-3).reverse());

	// Ha uj toast erkezik, akkor is csukodjon ossze, ha eppen rajta a kurzor.
	// (Ilyenkor nincs uj mouseenter, ezert kezzel kell visszaallitani.)
	let seenMax = $state(0);
	$effect(() => {
		const max = toast.items.reduce((m, t) => Math.max(m, t.id), 0);
		if (max > seenMax) {
			seenMax = max;
			expanded = false;
		}
	});

	// Minden toast magassagat merjuk, ebbol szamoljuk a poziciokat.
	function measure(node: HTMLElement) {
		const id = Number(node.dataset.toastId);
		const update = () => {
			const h = node.offsetHeight;
			if (heights[id] !== h) heights[id] = h;
		};
		update();
		const ro = new ResizeObserver(update);
		ro.observe(node);
		return {
			destroy() {
				ro.disconnect();
				delete heights[id];
			}
		};
	}

	// Osszecsukva: lepcsozetes takaras. Kinyitva: minden kartya a sajat helyere csuszik.
	const ys = $derived.by(() => {
		const arr: number[] = [];
		let y = 0;
		for (let i = 0; i < visible.length; i++) {
			if (expanded) {
				arr.push(y);
				y += (heights[visible[i].id] ?? FALLBACK_H) + GAP;
			} else {
				arr.push(i * PEEK);
			}
		}
		return arr;
	});

	const boxH = $derived.by(() => {
		if (visible.length === 0) return 0;
		if (expanded) {
			let h = 0;
			for (const t of visible) h += (heights[t.id] ?? FALLBACK_H) + GAP;
			return h - GAP;
		}
		return (heights[visible[0].id] ?? FALLBACK_H) + (visible.length - 1) * PEEK;
	});

	function collapse(e: FocusEvent) {
		const box = e.currentTarget as HTMLElement | null;
		const next = e.relatedTarget as Node | null;
		if (!box || !next || !box.contains(next)) expanded = false;
	}
</script>

{#if toast.items.length > 0}
	<div
		class="pointer-events-none fixed inset-x-0 top-0 z-[90] flex flex-col items-center px-4"
		style="padding-top: max(0.75rem, env(safe-area-inset-top))"
		aria-live="polite"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions: hover csak egeres kenyelmi plusz, billentyuzettel a focusin/focusout nyit -->
		<div
			class="pointer-events-auto relative w-full max-w-sm"
			style={`height: ${boxH}px; transition: height 0.35s cubic-bezier(0.32, 0.72, 0, 1);`}
			onmouseenter={() => (expanded = true)}
			onmouseleave={() => (expanded = false)}
			onfocusin={() => (expanded = true)}
			onfocusout={collapse}
		>
			{#each visible as t, depth (t.id)}
				{@const Icon = icons[t.tone]}
				{@const hidden = (!expanded && depth > 0) || t.leaving}
				<div
					use:measure
					data-toast-id={t.id}
					role={t.tone === 'error' || t.tone === 'warning' ? 'alert' : 'status'}
					class={[
						'toast-card absolute inset-x-0 top-0 flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 shadow-xl shadow-stone-900/10 dark:border-white/10 dark:bg-stone-900 dark:shadow-black/40',
						depth === 0 && !t.leaving ? 'anim-toast' : '',
						hidden ? 'pointer-events-none' : ''
					]}
					style={`z-index: ${30 - depth * 10}; transform: translateY(${ys[depth] ?? depth * PEEK}px) scale(${expanded ? 1 : (SCALES[depth] ?? 0.9)}); opacity: ${t.leaving ? 0 : expanded ? 1 : (OPACITIES[depth] ?? 0.6)};`}
					aria-hidden={hidden}
				>
					<span class={['grid size-9 shrink-0 place-items-center rounded-xl', tiles[t.tone]]}>
						<Icon size={19} aria-hidden="true" />
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-bold text-ink-900 dark:text-white">{t.title}</p>
						{#if t.message}
							<p class="mt-0.5 text-[13px] leading-snug text-stone-500 dark:text-stone-400">{t.message}</p>
						{/if}
					</div>
					<button
						type="button"
						onclick={() => toast.dismiss(t.id)}
						tabindex={hidden ? -1 : 0}
						aria-label="Értesítés bezárása"
						class="grid size-8 shrink-0 place-items-center rounded-full text-stone-400 transition duration-300 hover:bg-stone-100 hover:text-ink-900 hover:rotate-90 active:scale-95 motion-reduce:transition-none motion-reduce:hover:rotate-0 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-white"
					>
						<X size={18} />
					</button>
				</div>
			{/each}
		</div>
	</div>
{/if}
