<script lang="ts">
	import type { Snippet } from 'svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';
	let { anchor, label, onClose, children, id, trigger, preserveFocus = false, autoFocus = true, placement = 'auto', compact = false }: { anchor: () => DOMRect | null; label: string; onClose: (restoreFocus?: boolean) => void; children: Snippet; id?: string; trigger?: () => HTMLElement | null; preserveFocus?: boolean; autoFocus?: boolean; placement?: 'auto' | 'above' | 'below'; compact?: boolean } = $props();
	let panel: HTMLDivElement;
	let top = $state(0);
	let left = $state(0);
	let positioned = $state(false);
	let maxHeight = $state<number | undefined>();
	function position() {
		const rect = anchor();
		if (!rect || !panel) return;
		const viewport = window.visualViewport;
		const bottom = (viewport?.height ?? innerHeight) + (viewport?.offsetTop ?? 0);
		const height = panel.offsetHeight;
		const viewportTop = (viewport?.offsetTop ?? 0) + 8;
		const above = rect.top - height - 6;
		const below = rect.bottom + 6;
		const desiredTop = placement === 'above' && above >= viewportTop ? above : below + height + 8 <= bottom ? below : above;
		top = placement === 'below' ? Math.max(viewportTop, below) : Math.max(viewportTop, Math.min(desiredTop, bottom - height - 8));
		maxHeight = placement === 'below' ? Math.max(0, bottom - top - 8) : undefined;
		left = Math.max(8, Math.min(rect.left, innerWidth - panel.offsetWidth - 8));
		positioned = true;
	}
	function setup(node: HTMLDivElement) {
		panel = node;
		const frame = requestAnimationFrame(() => { position(); if (autoFocus) node.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true }); });
		const observer = new ResizeObserver(position);
		observer.observe(node);
		const outside = (target: EventTarget | null) => target instanceof Node && !node.contains(target) && !trigger?.()?.contains(target);
		const pointer = (event: PointerEvent) => { if (outside(event.target)) onClose(); };
		const focus = (event: FocusEvent) => { if (outside(event.target)) onClose(); };
		const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(true); } };
		window.addEventListener('pointerdown', pointer);
		window.addEventListener('focusin', focus);
		window.addEventListener('keydown', key, true);
		window.addEventListener('scroll', position, true);
		window.addEventListener('resize', position);
		window.visualViewport?.addEventListener('resize', position);
		return () => {
			cancelAnimationFrame(frame); observer.disconnect();
			window.removeEventListener('pointerdown', pointer);
			window.removeEventListener('focusin', focus);
			window.removeEventListener('keydown', key, true);
			window.removeEventListener('scroll', position, true);
			window.removeEventListener('resize', position);
			window.visualViewport?.removeEventListener('resize', position);
		};
	}
	function keepFocus(event: PointerEvent) {
		if (preserveFocus && event.button === 0 && event.target instanceof Element && event.target.closest('button')) event.preventDefault();
	}
</script>

<div use:portal>
	<div {id} {@attach setup} onpointerdown={keepFocus} class="editor-popover" class:compact role="dialog" aria-label={label} tabindex="-1" style:top={`${top}px`} style:left={`${left}px`} style:max-height={maxHeight === undefined ? undefined : `${maxHeight}px`} style:visibility={positioned ? 'visible' : 'hidden'}>
		{@render children()}
	</div>
</div>

<style>
	.editor-popover { position: fixed; z-index: 80; max-width: calc(100vw - 16px); max-height: calc(100dvh - 16px); overflow-y: auto; padding: 8px; border: 1px solid var(--color-stone-200); border-radius: 14px; background: white; box-shadow: 0 8px 28px rgb(0 0 0 / .12); }
	.editor-popover.compact { padding: 5px; border-radius: 10px; }
	:global(.dark) .editor-popover { border-color: rgb(255 255 255 / .15); background: var(--color-stone-900); box-shadow: 0 8px 28px rgb(0 0 0 / .35); }
</style>
