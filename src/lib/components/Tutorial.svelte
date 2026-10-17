<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { base, resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArrowLeft, ArrowRight, BookOpen, Check, Compass, Layers, Play, RotateCcw, Users, X } from '@lucide/svelte';
	import Drawer from './Drawer.svelte';
	import { lockBody, motionOK } from '$lib/overlay';
	import { TOURS, TOUR_IDS, tourPath, type TourId, type TourStep } from '$lib/tutorial/definition';
	import type { TutorialController } from '$lib/tutorial/controller.svelte';
	let { tutorial }: { tutorial: TutorialController } = $props();
	let coach: HTMLElement | undefined = $state();
	let rect = $state<{ x: number; y: number; width: number; height: number } | null>(null);
	let measuredRect: typeof rect = null;
	let viewport = $state({ top: 0, left: 0, width: 1, height: 1 });
	let targets: HTMLElement[] = [];
	let targetPanel: HTMLElement | null = null;
	let panelTop = $state<number | null>(null);
	let measuredPanelTop: number | null = null;
	const panelConstraints = new Map<HTMLElement, { height: string; marker: string | null }>();
	let dock = $state<'top' | 'bottom'>('bottom');
	let inPanel = $state(false);
	let missing = $state(false);
	let ready = $state(false);
	let notice = $state('');
	let retry = $state(0);
	let coachHeight = $state(240);
	let settledPlacement = $state<{ left: number; top: number } | null>(null);
	let mounted = $state(false);
	let actionTimer: ReturnType<typeof setTimeout> | undefined;
	let step = $derived(tutorial.step);
	let mobile = $derived(viewport.width < 640);
	let coachWidth = $derived(Math.min(360, viewport.width - 24));
	let coachMaxHeight = $derived(Math.max(120, mobile && inPanel ? viewport.height * .46 : viewport.height - 24));
	let placement = $derived.by(() => {
		if (!ready && !missing && settledPlacement) return settledPlacement;
		const height = Math.min(coachHeight, coachMaxHeight);
		if (mobile) {
			const top = inPanel && panelTop !== null ? panelTop - height - 16 : rect
				? dock === 'top' ? rect.y - height - 16 : rect.y + rect.height + 16
				: dock === 'top' ? 12 : viewport.height - height - 12;
			return { left: (viewport.width - coachWidth) / 2, top: Math.max(12, Math.min(viewport.height - height - 12, top)) };
		}
		if (!rect) return { left: (viewport.width - coachWidth) / 2, top: Math.max(12, (viewport.height - height) / 2) };
		const below = rect.y + rect.height + 16;
		const above = rect.y - height - 16;
		const top = below + height <= viewport.height - 12 ? below : above >= 12 ? above : Math.max(12, viewport.height - height - 12);
		return { left: Math.min(viewport.width - coachWidth - 12, Math.max(12, rect.x + rect.width / 2 - coachWidth / 2)), top };
	});
	let pointer = $derived.by(() => {
		if (!rect) return null;
		const height = Math.min(coachHeight, coachMaxHeight);
		const above = rect.y + rect.height <= placement.top;
		const below = rect.y >= placement.top + height;
		if (!above && !below) return null;
		return { left: Math.max(placement.left + 24, Math.min(placement.left + coachWidth - 36, rect.x + rect.width / 2 - 6)), top: above ? placement.top - 6 : placement.top + height - 6 };
	});
	const icons = { basics: Compass, learning: BookOpen, classroom: Users, cards: Layers };
	const chapterDescriptions = { basics: 'A Leardy rövid bemutatása.', learning: 'Leckék, keresés és kvízek.', classroom: 'Osztályok és feladatok.', cards: 'Csomagok és gyakorlás.' };
	function portal(node: HTMLElement) { document.body.appendChild(node); return () => node.remove(); }
	function visible(node: HTMLElement) { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden'; }
	function findTargets(current: TourStep) {
		const found = [...document.querySelectorAll<HTMLElement>(current.target)].filter(visible);
		return current.id === 'scope-subject' || current.id === 'scope-level' ? found : found.slice(0, 1);
	}
	function releasePanels(keep: HTMLElement | null = null) {
		for (const [panel, original] of panelConstraints) {
			if (panel === keep) continue;
			if (original.height) panel.style.setProperty('--tutorial-panel-height', original.height);
			else panel.style.removeProperty('--tutorial-panel-height');
			if (original.marker === null) panel.removeAttribute('data-tutorial-panel');
			else panel.setAttribute('data-tutorial-panel', original.marker);
			panelConstraints.delete(panel);
		}
	}
	function measure() {
		const vp = window.visualViewport;
		viewport = { top: vp?.offsetTop ?? 0, left: vp?.offsetLeft ?? 0, width: vp?.width ?? innerWidth, height: vp?.height ?? innerHeight };
		// A tartalom animált transzformációja ne változtassa a panel elhelyezését.
		if (coach) coachHeight = coach.offsetHeight;
		if (targetPanel) {
			const height = Math.max(120, viewport.height - Math.min(coachHeight, coachMaxHeight) - 36);
			const limit = mobile ? height + 'px' : '';
			if (targetPanel.style.getPropertyValue('--tutorial-panel-height') !== limit) {
				if (limit) targetPanel.style.setProperty('--tutorial-panel-height', limit);
				else targetPanel.style.removeProperty('--tutorial-panel-height');
			}
		}
		measuredPanelTop = targetPanel?.isConnected ? targetPanel.getBoundingClientRect().top - viewport.top : null;
		if (ready) panelTop = measuredPanelTop;
		if (!targets.length || !targets[0].isConnected) { measuredRect = null; if (ready) rect = null; return; }
		const scroller = targets[0].closest<HTMLElement>('[data-overlay-scroller]')?.getBoundingClientRect();
		const clipTop = Math.max(viewport.top + 4, scroller?.top ?? -Infinity);
		const clipBottom = Math.min(viewport.top + viewport.height - 4, scroller?.bottom ?? Infinity);
		const boxes = targets.map((node) => node.getBoundingClientRect()).filter((box) => box.bottom > clipTop && box.top < clipBottom);
		if (!boxes.length) { measuredRect = null; if (ready) rect = null; return; }
		const x = Math.max(4, Math.min(...boxes.map((box) => box.left)) - viewport.left - 6);
		const y = Math.max(clipTop - viewport.top, Math.min(...boxes.map((box) => box.top)) - viewport.top - 6);
		measuredRect = { x, y, width: Math.max(1, Math.min(viewport.width - x - 4, Math.max(...boxes.map((box) => box.right)) - viewport.left + 6 - x)), height: Math.max(1, Math.min(clipBottom - viewport.top - y, Math.max(...boxes.map((box) => box.bottom)) - viewport.top + 6 - y)) };
		if (ready) {
			rect = measuredRect;
			if (settledPlacement?.left !== placement.left || settledPlacement?.top !== placement.top) settledPlacement = { ...placement };
		}
	}
	function moving(node: HTMLElement) {
		for (let parent: HTMLElement | null = node; parent; parent = parent.parentElement) {
			if (parent.getAnimations().some((animation) => animation.playState === 'running' && animation.effect?.getComputedTiming().endTime !== Infinity)) return true;
		}
		return false;
	}
	function revealTarget() {
		const first = targets[0];
		if (!first) return;
		// A rögzített navigációhoz nem kell megmozdítani az alatta lévő leckét.
		for (let node: HTMLElement | null = first; node; node = node.parentElement) {
			if (getComputedStyle(node).position === 'fixed') return;
		}
		const box = first.getBoundingClientRect();
		const scroller = first.closest<HTMLElement>('[data-overlay-scroller]');
		const bounds = scroller?.getBoundingClientRect();
		const top = bounds ? Math.max(bounds.top, viewport.top) + 8 : viewport.top + (mobile && dock === 'top' ? coachHeight + 32 : 12);
		const bottom = bounds ? Math.min(bounds.bottom, viewport.top + viewport.height) - 8 : viewport.top + viewport.height - (mobile && dock === 'bottom' ? coachHeight + 32 : 12);
		const delta = box.top < top ? box.top - top : box.bottom > bottom ? Math.min(box.top - top, box.bottom - bottom) : 0;
		if (Math.abs(delta) < 1) return;
		const behavior = motionOK() ? 'smooth' : 'instant';
		if (scroller) scroller.scrollBy({ top: delta, behavior });
		else window.scrollBy({ top: delta, behavior });
	}
	function focusable() {
		const items = coach ? [...coach.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')] : [];
		if (step?.event && ready) for (const target of targets) {
			if (target.matches('button:not(:disabled),a[href],input:not(:disabled)')) items.unshift(target);
			else items.unshift(...target.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)'));
		}
		return items.filter(visible);
	}
	function onKey(event: KeyboardEvent) {
		if (!tutorial.active) return;
		if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); tutorial.pause(); return; }
		if (event.key === 'Tab') {
			event.preventDefault(); event.stopImmediatePropagation();
			const items = focusable();
			const current = items.indexOf(document.activeElement as HTMLElement);
			const index = (current + (event.shiftKey ? -1 : 1) + items.length) % items.length;
			(items[index] ?? coach)?.focus({ preventScroll: true });
			return;
		}
		if (!coach?.contains(event.target as Node) && !(step?.event && ready && targets.some((target) => target.contains(event.target as Node)))) {
			event.preventDefault(); event.stopImmediatePropagation();
		}
	}
	function onFocus(event: FocusEvent) {
		if (!tutorial.active || !ready || !coach || coach.contains(event.target as Node)) return;
		if (step?.event && targets.some((target) => target.contains(event.target as Node))) return;
		coach.focus({ preventScroll: true });
	}
	function onPointer(event: Event) {
		if (!tutorial.active || coach?.contains(event.target as Node)) return;
		if (!(step?.event && ready && targets.some((target) => target.contains(event.target as Node)))) {
			event.preventDefault(); event.stopImmediatePropagation(); return;
		}
		if (event.type !== 'click') return;
		clearTimeout(actionTimer);
		const clickedStep = tutorial.stepId;
		actionTimer = setTimeout(() => {
			if (tutorial.active && tutorial.stepId === clickedStep) { missing = true; tutorial.navigating = false; }
		}, 5000);
		if (step.event !== 'navigation') return;
		const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
		if (!anchor) { if (step.to && tourPath(step.to, tutorial.context)) tutorial.navigating = true; return; }
		const url = new URL(anchor.href);
		if (url.origin !== location.origin) { event.preventDefault(); return; }
		const id = anchor.dataset.tutorialContentId;
		if (step.to === 'lesson' && id) tutorial.context = { ...tutorial.context, lessonId: id };
		if (step.to === 'room' && id) tutorial.context = { ...tutorial.context, roomId: id };
		if (step.to === 'package' && id) tutorial.context = { ...tutorial.context, packageId: id };
		tutorial.navigating = true;
	}
	beforeNavigate((navigation) => {
		if (tutorial.active && (navigation.type === 'popstate' || navigation.willUnload)) tutorial.pause();
	});
	onMount(() => {
		mounted = true;
		measure();
		document.addEventListener('keydown', onKey, true);
		document.addEventListener('focusin', onFocus, true);
		for (const name of ['pointerdown', 'click', 'submit']) document.addEventListener(name, onPointer, true);
		return () => {
			clearTimeout(actionTimer);
			releasePanels();
			document.removeEventListener('keydown', onKey, true);
			document.removeEventListener('focusin', onFocus, true);
			for (const name of ['pointerdown', 'click', 'submit']) document.removeEventListener(name, onPointer, true);
		};
	});
	$effect(() => {
		if (!tutorial.active) return;
		return lockBody();
	});
	$effect(() => {
		if (!mounted || !tutorial.offerPending || tutorial.busy) return;
		const show = () => {
			if ([...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].some(visible)) return;
			tutorial.offerPending = false; tutorial.offer = true; tutorial.offeredThisSession = true;
		};
		const observer = new MutationObserver(show);
		observer.observe(document.body, { childList: true, subtree: true });
		untrack(show);
		return () => observer.disconnect();
	});
	$effect(() => {
		const current = step;
		const path = page.url.pathname.slice(base.length) || '/';
		const attempt = retry;
		clearTimeout(actionTimer);
		actionTimer = undefined;
		if (!mounted || !current) { targets = []; rect = null; ready = false; panelTop = null; inPanel = false; releasePanels(); return; }
		let cancelled = false;
		let observer: ResizeObserver | undefined;
		let mutations: MutationObserver | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let frame = 0;
		const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
		const inerted: HTMLElement[] = [];
		const modals: HTMLElement[] = [];
		const descriptions = new Map<HTMLElement, string | null>();
		untrack(() => {
			ready = false; missing = false; targets = []; measuredRect = null;
			async function prepare() {
				const destination = tourPath(current!.page, tutorial.context);
				if (tutorial.navigating && current!.to) {
					if (tourPath(current!.to, tutorial.context) === path && page.status < 400) tutorial.signal('navigation');
					else timer = setTimeout(() => { if (!cancelled) { tutorial.navigating = false; missing = true; } }, 5000);
					return;
				}
				if (!current!.id.startsWith('nav-') && destination && destination !== path) {
					try { await goto(resolve(destination)); } catch { if (!cancelled) missing = true; }
					return;
				}
				if (!destination && current!.optional && !current!.id.startsWith('nav-')) { notice = 'Ez a rész most nem érhető el, ezért továbbléptünk.'; tutorial.skipStep(); return; }
				tutorial.prepare();
				await tick();
				if (cancelled) return;
				const started = Date.now();
				let previousBox = '';
				let stableFrames = 0;
				let revealed = false;
				let placed = false;
				function seek() {
					if (cancelled) return;
					if (current!.page === 'learning' && document.querySelector('[data-tutorial-empty="learning"]')) {
						notice = 'Még nincs elérhető tananyag. Ezt a részt később is megnézheted.';
						tutorial.skipPages(['learning', 'lesson']); return;
					}
					targets = findTargets(current!);
					if (!targets.length) {
						if (Date.now() - started >= 5000) {
							if (current!.optional) { notice = 'Ez a rész most nem érhető el, ezért továbbléptünk.'; tutorial.skipStep(); }
							else missing = true;
							return;
						}
						timer = setTimeout(seek, 100); return;
					}
					if (!placed) {
						targetPanel = targets[0].closest<HTMLElement>('[role="dialog"]');
						inPanel = !!targetPanel;
						const box = targets[0].getBoundingClientRect();
						dock = targetPanel || box.top + box.height / 2 > viewport.top + viewport.height / 2 ? 'top' : 'bottom';
						// Ugyanaz a Drawer két lépés között is megtartja a méretkorlátját.
						releasePanels(targetPanel);
						if (targetPanel && !panelConstraints.has(targetPanel)) {
							panelConstraints.set(targetPanel, {
								height: targetPanel.style.getPropertyValue('--tutorial-panel-height'),
								marker: targetPanel.getAttribute('data-tutorial-panel')
							});
							targetPanel.setAttribute('data-tutorial-panel', '');
						}
						placed = true;
					}
					measure();
					// A Drawer és a lista becsúszásának végén mérünk, nem a képernyő alatti kezdőhelyzetben.
					if (moving(targets[0])) { timer = setTimeout(seek, 32); return; }
					if (!revealed) { revealTarget(); revealed = true; }
					measure();
					const box = targets[0].getBoundingClientRect();
					const signature = [box.x, box.y, box.width, box.height, coach?.offsetHeight].map((part) => Math.round(part ?? 0)).join(':');
					stableFrames = signature === previousBox ? stableFrames + 1 : 0;
					previousBox = signature;
					if (stableFrames < 2) { timer = setTimeout(seek, 32); return; }
					rect = measuredRect;
					panelTop = measuredPanelTop;
					ready = true;
					observer = new ResizeObserver(update);
					for (const node of targets) {
						observer.observe(node);
						descriptions.set(node, node.getAttribute('aria-describedby'));
						node.setAttribute('aria-describedby', [node.getAttribute('aria-describedby'), 'tutorial-description'].filter(Boolean).join(' '));
					}
					if (coach) observer.observe(coach);
					if (targetPanel) observer.observe(targetPanel);
					mutations = new MutationObserver(() => {
						if (cancelled || actionTimer) return;
						const next = findTargets(current!);
						if (next.length !== targets.length || next.some((node, index) => node !== targets[index])) retry++;
						else update();
					});
					mutations.observe(document.body, { childList: true, subtree: true });
					for (const modal of document.querySelectorAll<HTMLElement>('[aria-modal="true"]')) { modals.push(modal); modal.removeAttribute('aria-modal'); }
					const protectedNodes = [...targets, document.querySelector<HTMLElement>('[data-tutorial-root]')!];
					function isolate(parent: HTMLElement) {
						for (const child of [...parent.children]) {
							if (!(child instanceof HTMLElement) || child.inert || protectedNodes.includes(child)) continue;
							if (protectedNodes.some((node) => child.contains(node))) isolate(child);
							else { child.inert = true; inerted.push(child); }
						}
					}
					isolate(document.body);
					coach?.focus({ preventScroll: true });
					update();
				}
				seek();
			}
			void prepare();
		});
		window.addEventListener('scroll', update, true);
		window.addEventListener('resize', update);
		window.visualViewport?.addEventListener('resize', update);
		window.visualViewport?.addEventListener('scroll', update);
		return () => {
			cancelled = true; clearTimeout(timer); cancelAnimationFrame(frame); observer?.disconnect(); mutations?.disconnect();
			window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update);
			window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update);
			for (const node of inerted) node.inert = false;
			for (const node of modals) node.setAttribute('aria-modal', 'true');
			for (const [node, description] of descriptions) { if (description === null) node.removeAttribute('aria-describedby'); else node.setAttribute('aria-describedby', description); }
			targetPanel = null;
			void attempt;
		};
	});
	function start(id: TourId, resume = false) { notice = ''; tutorial.start(id, resume); }
	async function retryStep() {
		tutorial.closePanels();
		const destination = step ? tourPath(step.page, tutorial.context) : null;
		if (page.status >= 400 && destination) {
			try { await goto(resolve(destination), { invalidateAll: true }); } catch { /* A lépésnél újra lehet próbálni. */ }
		}
		await tick(); retry++;
	}
</script>

<div {@attach portal} data-tutorial-root>
	<Drawer open={tutorial.offer} label="Ismerd meg a Leardyt!" title="Mutassuk meg, hogyan működik a Leardy?" onClose={() => tutorial.dismissOffer()}>
		{#snippet header()}
			<div class="intro-heading">
				<span class="intro-icon"><Compass size={24} aria-hidden="true" /></span>
				<h2>Mutassuk meg, hogyan működik a Leardy?</h2>
			</div>
		{/snippet}
		<p class="intro-text">Néhány perc alatt megmutatjuk, hol találod a leckéket, a feladataidat és a kártyákat. Közben ki is próbálhatod a navigációt.</p>
		<p class="hint">Kb. 3 perc · Bármikor kiléphetsz</p>
		<button class="primary wide" onclick={() => start('basics')}><Play size={17} /> Mutasd meg</button>
		<button class="secondary wide" onclick={() => tutorial.dismissOffer()}>Most kihagyom</button>
	</Drawer>
	<Drawer open={tutorial.menuOpen} label="Útmutató" title="Miben segíthetünk?" onClose={() => tutorial.menuOpen = false}>
		<p class="menu-intro">Válassz egy rövid bemutatót!</p>
		{#if tutorial.syncError}<p class="sync-message" role="status">{tutorial.syncError}</p>{/if}
		{#each TOUR_IDS as id (id)}
			{@const Icon = icons[id]}
			{@const saved = tutorial.states[id]}
			{@const resumable = saved && (saved.status === 'active' || saved.status === 'paused')}
			<div class="chapter">
				<div class="chapter-heading">
					<span class="chapter-icon" aria-hidden="true"><Icon size={19} /></span>
					<div class="chapter-copy">
						<div class="chapter-title"><h3>{TOURS[id].title}</h3>{#if saved?.status === 'completed'}<Check size={14} class="text-emerald-500" aria-label="Befejezve" />{/if}</div>
						<p>{chapterDescriptions[id]}</p>
						<div class="chapter-meta"><span>{TOURS[id].duration}</span>{#if resumable}<span class="resume-label">Folytatható</span>{/if}</div>
					</div>
				</div>
				<div class="chapter-actions">
					{#if resumable}<button class="chapter-reset" aria-label={'Újrakezdés: ' + TOURS[id].title} title="Újrakezdés" onclick={() => start(id)}><RotateCcw size={17} /></button>{/if}
					<button class="chapter-open" class:resume={resumable} aria-label={(resumable ? 'Folytatás: ' : saved ? 'Újrakezdés: ' : 'Indítás: ') + TOURS[id].title} title={resumable ? 'Folytatás' : saved ? 'Újrakezdés' : 'Indítás'} onclick={() => start(id, !!resumable)}>
						{#if saved && !resumable}<RotateCcw size={18} />{:else}<ArrowRight size={18} />{/if}
					</button>
				</div>
			</div>
		{/each}
	</Drawer>
	<Drawer open={tutorial.finished} label="Az útmutató véget ért" onClose={() => tutorial.finished = false}>
		{#snippet header()}
			<div class="finish-heading"><span class="finish-icon" aria-hidden="true"><Check size={22} /></span><div><span class="finish-label">Útmutató teljesítve</span><h2>Indulhat a tanulás!</h2></div></div>
		{/snippet}
		<div class="finish-content">
			<p class="finish-text">Az útmutatót bármikor újranyithatod a Beállításokban.</p>
			{#if tutorial.syncError}<p class="sync-message" role="status">{tutorial.syncError}</p>{/if}
			<button class="primary wide" onclick={() => { tutorial.finished = false; void goto(resolve('/tanulas')); }}>Tanulni kezdek <ArrowRight size={17} /></button>
			<button class="secondary wide" onclick={() => tutorial.finished = false}>Bezárás</button>
		</div>
	</Drawer>
	{#if tutorial.active && step}
		<div class="tour-viewport" style:top={viewport.top + 'px'} style:left={viewport.left + 'px'} style:width={viewport.width + 'px'} style:height={viewport.height + 'px'}>
			<svg class="scrim" width="100%" height="100%" aria-hidden="true">
				<defs><mask id="tutorial-spotlight"><rect width="100%" height="100%" fill="white" />{#if rect && ready}<rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="14" fill="black" />{/if}</mask></defs>
				<rect width="100%" height="100%" fill="rgba(12,18,28,.65)" mask="url(#tutorial-spotlight)" />
				{#if rect && ready}<rect class="highlight-outline" x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="14" fill="none" stroke="#38bdf8" stroke-width="3" />{/if}
			</svg>
			{#if pointer}<span class="coach-pointer" class:preparing={!ready} style:left={pointer.left + 'px'} style:top={pointer.top + 'px'} aria-hidden="true"></span>{/if}
			<div bind:this={coach} role="dialog" aria-modal="false" aria-labelledby="tutorial-title" aria-describedby="tutorial-description" tabindex="-1" class="coach" data-ready={ready || missing} style:width={coachWidth + 'px'} style:transform={'translate3d(' + placement.left + 'px,' + placement.top + 'px,0)'} style:max-height={coachMaxHeight + 'px'}>
				<div class="coach-content">
					<div class="coach-heading"><span>{TOURS[tutorial.active].title} · {Math.max(1, tutorial.index + 1)}/{tutorial.steps.length}</span><button class="exit" onclick={() => tutorial.pause()} aria-label="Kilépés az útmutatóból"><X size={19} /></button></div>
					<div class="progress" aria-hidden="true"><span style:width={((tutorial.index + 1) / tutorial.steps.length * 100) + '%'}></span></div>
					<h2 id="tutorial-title">{step.title}</h2>
					<p id="tutorial-description" aria-live="polite">{missing ? 'Ez a rész most nem érhető el. Próbáld újra, vagy hagyd ki ezt a lépést!' : step.id === 'scope-level' && tutorial.context.levelLabel ? tutorial.context.levelLabel + ': válaszd ki, melyikkel foglalkoznál!' : step.text}</p>
					{#if notice}<p class="hint" role="status">{notice}</p>{/if}
					{#if tutorial.syncError}<p class="sync-message" role="status">{tutorial.syncError}</p>{/if}
					<div class="coach-actions">
						<button class="secondary" disabled={tutorial.index <= 0} onclick={() => { notice = ''; tutorial.previous(); }}><ArrowLeft size={15} /> Előző</button>
						{#if missing}<button class="secondary" onclick={retryStep}>Újrapróbálás</button><button class="primary" onclick={() => tutorial.skipStep()}>Kihagyás</button>
						{:else if step.event}<span class="action-hint" class:unavailable={!ready}>Koppints a kiemelt elemre!</span>
						{:else}<button class="primary" disabled={!ready} onclick={() => { notice = ''; tutorial.next(); }}>{tutorial.index === tutorial.steps.length - 1 ? 'Befejezés' : 'Tovább'} <ArrowRight size={15} /></button>{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.intro-heading { display: flex; flex: 1; min-width: 0; align-items: center; gap: 12px; padding-top: 12px; }
	.intro-heading h2 { min-width: 0; font-size: 20px; line-height: 1.3; font-weight: 800; letter-spacing: -.025em; color: var(--color-ink-900); }
	:global(.dark) .intro-heading h2 { color: white; }
	.intro-icon { display: grid; place-items: center; width: 48px; height: 48px; flex-shrink: 0; border-radius: 16px; background: var(--color-brand-50); color: var(--color-brand-600); }
	.intro-text { margin: 12px 0; font-size: 15px; line-height: 1.65; color: var(--color-stone-500); }
	.hint { font-size: 12px; line-height: 1.5; color: var(--color-stone-500); }
	.primary, .secondary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 10px 15px; border-radius: 999px; font-size: 14px; font-weight: 700; cursor: pointer; }
	.primary { background: var(--color-brand-500); color: white; }
	.primary:hover { background: var(--color-brand-600); }
	.secondary { background: var(--color-stone-100); color: var(--color-ink-600); }
	button:disabled { opacity: .45; cursor: default; }
	button:focus-visible { outline: 3px solid #60a5fa; outline-offset: 3px; }
	.wide { display: flex; width: 100%; margin-top: 12px; }
	.menu-intro { margin: 6px 0 12px; font-size: 13px; line-height: 1.5; color: var(--color-stone-500); }
	.chapter { display: flex; align-items: center; gap: 6px; padding: 12px 0; border-bottom: 1px solid var(--color-stone-200); }
	.chapter:last-child { border-bottom: 0; padding-bottom: 0; }
	.chapter-heading { display: flex; flex: 1; min-width: 0; align-items: center; gap: 10px; }
	.chapter-copy { flex: 1; min-width: 0; }
	.chapter-icon { display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; background: var(--color-brand-50); color: var(--color-brand-600); border-radius: 12px; }
	.chapter-title { display: flex; align-items: center; gap: 6px; }
	.chapter-title :global(svg) { flex-shrink: 0; }
	h3 { font-size: 14px; font-weight: 800; line-height: 1.4; }
	.chapter-heading p { font-size: 12px; line-height: 1.4; color: var(--color-stone-500); margin-top: 2px; }
	.chapter-meta { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 3px; font-size: 11px; line-height: 1.4; color: var(--color-stone-500); }
	.resume-label { color: var(--color-brand-600); font-weight: 600; }
	.chapter-actions { display: flex; align-items: center; flex-shrink: 0; gap: 2px; }
	.chapter-open, .chapter-reset { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; cursor: pointer; }
	.chapter-open { background: var(--color-brand-50); color: var(--color-brand-600); }
	.chapter-open:hover { background: var(--color-brand-100); }
	.chapter-open.resume { background: var(--color-brand-500); color: white; }
	.chapter-open.resume:hover { background: var(--color-brand-600); }
	.chapter-reset { color: var(--color-stone-500); }
	.chapter-reset:hover { background: var(--color-stone-100); color: var(--color-ink-900); }
	.finish-heading { display: flex; flex: 1; min-width: 0; align-items: center; gap: 12px; padding-top: 6px; }
	.finish-icon { display: grid; place-items: center; flex-shrink: 0; width: 44px; height: 44px; border-radius: 15px; background: var(--color-brand-50); color: var(--color-brand-600); }
	.finish-label { display: block; margin-bottom: 2px; font-size: 11px; font-weight: 600; color: var(--color-stone-500); }
	.finish-heading h2 { font-family: var(--font-display); font-size: 21px; font-weight: 800; line-height: 1.25; letter-spacing: -.025em; }
	.finish-text { margin: 14px 0 18px; font-size: 13px; line-height: 1.6; color: var(--color-stone-500); }
	.finish-content .secondary { background: transparent; margin-top: 4px; font-size: 13px; font-weight: 600; }
	.finish-content .secondary:hover { background: var(--color-stone-100); }
	.tour-viewport { position: fixed; z-index: 100; pointer-events: none; }
	.scrim { position: absolute; inset: 0; animation: tutorial-fade-in 180ms ease-out both; }
	.highlight-outline { filter: drop-shadow(0 0 5px #38bdf855); animation: tutorial-highlight-in 320ms ease-out both; }
	.coach-pointer { position: absolute; width: 12px; height: 12px; transform: rotate(45deg); background: white; transition: left 340ms cubic-bezier(.22,.68,0,1), top 340ms cubic-bezier(.22,.68,0,1), opacity 180ms ease; }
	.coach-pointer.preparing { opacity: 0; }
	.coach { position: absolute; top: 0; left: 0; pointer-events: auto; overflow-y: auto; overscroll-behavior: contain; padding: 18px; border-radius: 22px; background: white; color: var(--color-ink-900); box-shadow: 0 12px 48px #0004; outline: none; transition: transform 340ms cubic-bezier(.22,.68,0,1), opacity 180ms ease; }
	.coach[data-ready='true'] .coach-content { animation: tutorial-content-in 260ms cubic-bezier(.22,.68,0,1) both; }
	:global([data-tutorial-panel]) { max-height: var(--tutorial-panel-height, 92%) !important; }
	.coach-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--color-stone-500); }
	.exit { display: grid; place-items: center; min-width: 44px; min-height: 44px; margin: -10px -10px -4px 0; border-radius: 999px; }
	.exit:hover { background: var(--color-stone-100); }
	.progress { height: 4px; border-radius: 8px; overflow: hidden; background: var(--color-stone-100); margin: 10px 0 16px; }
	.progress span { display: block; height: 100%; background: #2563eb; transition: width 320ms cubic-bezier(.22,.68,0,1); }
	.coach h2 { font-family: var(--font-display); font-size: 21px; font-weight: 800; line-height: 1.25; }
	.coach-content > p { margin-top: 10px; line-height: 1.6; font-size: 14px; }
	.coach-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 18px; }
	.action-hint { max-width: 150px; font-size: 12px; font-weight: 700; color: #2563eb; text-align: right; }
	.action-hint.unavailable { visibility: hidden; }
	.sync-message { font-size: 12px !important; line-height: 1.5; color: var(--color-amber-700, #92400e); margin-top: 10px; }
	:global(.dark) .coach { background: var(--color-stone-900); color: white; }
	:global(.dark) .coach-pointer { background: var(--color-stone-900); }
	:global(.dark) .secondary { background: #ffffff12; color: white; }
	:global(.dark) .chapter { border-color: #ffffff18; }
	:global(.dark) .intro-icon, :global(.dark) .chapter-icon { background: #ffffff12; color: var(--color-brand-300); }
	:global(.dark) .finish-icon, :global(.dark) .chapter-open:not(.resume) { background: #ffffff12; color: var(--color-brand-300, #a5adff); }
	:global(.dark) .chapter-icon { color: var(--color-brand-300, #a5adff); }
	:global(.dark) .menu-intro, :global(.dark) .chapter-heading p, :global(.dark) .chapter-meta, :global(.dark) .chapter-reset, :global(.dark) .finish-label, :global(.dark) .finish-text { color: #ffffffa6; }
	:global(.dark) .resume-label { color: var(--color-brand-300, #a5adff); }
	:global(.dark) .chapter-reset:hover, :global(.dark) .finish-content .secondary:hover { background: #ffffff12; color: white; }
	:global(.dark) .action-hint { color: #7dd3fc; }
	:global(.dark) .sync-message { color: var(--color-amber-300, #fcd34d); }
	@keyframes tutorial-fade-in { from { opacity: 0; } to { opacity: 1; } }
	@keyframes tutorial-content-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
	@keyframes tutorial-highlight-in { from { opacity: 0; stroke-width: 5; } to { opacity: 1; stroke-width: 3; } }
	:global(.reduce-motion) .coach, :global(.reduce-motion) .coach-pointer, :global(.reduce-motion) .progress span { transition: none; }
	:global(.reduce-motion) .coach-content, :global(.reduce-motion) .scrim, :global(.reduce-motion) .highlight-outline { animation: none; }
	@media (prefers-reduced-motion: reduce) {
		.coach, .coach-pointer, .progress span { transition: none; }
		.coach-content, .scrim, .highlight-outline { animation: none !important; }
	}
</style>
