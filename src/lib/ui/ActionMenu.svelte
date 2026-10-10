<script lang="ts" module>
	import type { Save } from '@lucide/svelte';

	export interface ActionMenuItem {
		id: string;
		label: string;
		icon: typeof Save;
		onclick: () => void;
		disabled?: boolean;
		active?: boolean;
		tone?: 'default' | 'danger';
		/** A fejléc rendelkezésre álló szélességéhez igazodik. */
		promote?: 'small' | 'medium' | 'large';
		/** A fejlécben csak az ikon látszik, a menüben a felirat is. */
		iconOnly?: boolean;
	}
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { Ellipsis } from '@lucide/svelte';
	import IconButton from './IconButton.svelte';
	let { actions, label = 'Műveletek', triggerLabel, triggerIcon: TriggerIcon, disabled = false, compact = false, menuIconsOnly = false, menuColumns = 0, dense = false, floating = false, align = 'auto', preserveFocus = false, closeOnSelect = true }: {
		actions: ActionMenuItem[];
		triggerLabel?: string;
		triggerIcon?: typeof Ellipsis;
		label?: string;
		disabled?: boolean;
		compact?: boolean;
		menuIconsOnly?: boolean;
		menuColumns?: number;
		/** Tömör lista a szerkesztő eszközeihez. */
		dense?: boolean;
		/** A menü a nézethez igazodik, és a görgethető panelek fölött jelenik meg. */
		floating?: boolean;
		/** A kezdőélhez igazított menü jobbra nyílik. */
		align?: 'start' | 'end' | 'auto';
		preserveFocus?: boolean;
		closeOnSelect?: boolean;
	} = $props();
	let open = $state(false);
	let root: HTMLElement | undefined = $state();
	let shell: HTMLElement | undefined;
	let top = $state(0);
	let left = $state(0);
	let upward = $state(false);
	const id = $props.id();
	let expandable = $derived(actions.filter((action) => action.promote));
	let collapseAt = $derived(actions.some((action) => !action.promote) ? '' :
		actions.some((action) => action.promote === 'large') ? 'large' :
		actions.some((action) => action.promote === 'medium') ? 'medium' : 'small');

	function run(action: ActionMenuItem) {
		if (disabled || action.disabled) return;
		if (closeOnSelect) {
			open = false;
			if (floating && !preserveFocus) root?.querySelector<HTMLButtonElement>('[aria-expanded]')?.focus({ preventScroll: true });
		}
		action.onclick();
	}
	function keepFocus(event: PointerEvent) {
		if (preserveFocus && event.button === 0) event.preventDefault();
	}

	function outside(event: PointerEvent) {
		if (open && event.target instanceof Node && !root?.contains(event.target) && !shell?.contains(event.target)) open = false;
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			if (floating) { event.preventDefault(); event.stopImmediatePropagation(); }
			open = false;
			root?.querySelector<HTMLButtonElement>('[aria-expanded]')?.focus();
		}
	}
	function position() {
		if (!floating || !shell || !root) return;
		const trigger = root.querySelector('[aria-expanded]')!.getBoundingClientRect();
		if (open && (trigger.bottom < 0 || trigger.top > window.innerHeight)) { open = false; return; }
		const height = shell.offsetHeight;
		upward = window.innerHeight - trigger.bottom - 18 < height && trigger.top > window.innerHeight - trigger.bottom;
		top = Math.max(8, upward ? trigger.top - height - 8 : Math.min(trigger.bottom + 8, window.innerHeight - height - 8));
		const start = align === 'start' || (align === 'auto' && trigger.left + trigger.width / 2 < window.innerWidth / 2);
		const desiredLeft = start ? trigger.left : trigger.right - shell.offsetWidth;
		left = Math.max(8, Math.min(desiredLeft, window.innerWidth - shell.offsetWidth - 8));
	}
	async function toggle(event: MouseEvent) {
		open = !open;
		if (!open) return;
		await tick();
		position();
		if (event.detail === 0) shell?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
	}
	function floatMenu(node: HTMLElement) {
		shell = node;
		if (!floating) return;
		document.body.appendChild(node);
		// A fókusz és a mező magasságának animációja is görgethet. Ilyenkor a menü kövesse a gombot.
		const followScroll = (event: Event) => { if (open && !node.contains(event.target as Node)) position(); };
		const captureKey = (event: KeyboardEvent) => {
			keydown(event);
			if (open && event.key === 'Tab') {
				open = false;
				root?.querySelector<HTMLButtonElement>('[aria-expanded]')?.focus({ preventScroll: true });
				return;
			}
			if (!open || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			const buttons = [...node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
			const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
			const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
				current < 0 ? (['ArrowDown', 'ArrowRight'].includes(event.key) ? 0 : buttons.length - 1) :
				(current + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
			buttons[index]?.focus();
		};
		window.addEventListener('keydown', captureKey, true);
		window.addEventListener('scroll', followScroll, true);
		window.addEventListener('resize', position);
		return () => {
			window.removeEventListener('keydown', captureKey, true);
			window.removeEventListener('scroll', followScroll, true);
			window.removeEventListener('resize', position);
			node.remove();
		};
	}
</script>

<svelte:window onpointerdown={outside} onkeydown={keydown} />

{#snippet actionButton(action: ActionMenuItem, iconOnly = false)}
	<button type="button" aria-label={action.label} title={action.label} disabled={disabled || action.disabled}
		aria-pressed={action.active}
		onclick={() => run(action)}
		class={['action-button', action.tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-ink-600 dark:text-stone-300']}>
		<action.icon size={20} aria-hidden="true" />
		{#if !iconOnly}<span>{action.label}</span>{/if}
	</button>
{/snippet}

<div bind:this={root} onpointerdown={keepFocus} role="presentation" class={['actions', { compact, 'icons-only': menuIconsOnly }]} data-open={open}>
	{#each expandable as action (action.id)}
		<div class="promoted" data-size={action.promote}>
			{#if action.iconOnly}
				<IconButton ariaLabel={action.label} size={44} tone={action.tone} disabled={disabled || action.disabled} onclick={() => run(action)}>
					<action.icon size={20} aria-hidden="true" />
				</IconButton>
			{:else}
				{@render actionButton(action)}
			{/if}
		</div>
	{/each}
	<div class="menu" data-collapse={collapseAt}>
		<button type="button" class="action-button toggle text-ink-600 dark:text-stone-300" aria-label={label}
			aria-expanded={open} aria-controls={id} {disabled} onclick={toggle}>
			{#if triggerLabel}
				{#if TriggerIcon}<TriggerIcon size={18} aria-hidden="true" />{/if}
				<span>{triggerLabel}</span>
			{:else if compact}
				<Ellipsis size={20} aria-hidden="true" />
			{:else}
				<span class="hamburger" aria-hidden="true"><span></span><span></span><span></span></span>
				<span>Műveletek</span>
			{/if}
		</button>
		<div {@attach floatMenu} onpointerdown={keepFocus} role="presentation" class={['dropdown-shell', { floating, dense, 'icons-only': menuIconsOnly, 'icon-grid': menuIconsOnly && menuColumns > 0 }]} data-open={open} style:--menu-cols={menuColumns}
			data-upward={upward} style:top={floating ? `${top}px` : undefined} style:left={floating ? `${left}px` : undefined}>
			<div {id} class="dropdown" inert={!open} aria-hidden={!open}>
				{#each actions as action, index (action.id)}
					<div class="dropdown-action" data-size={action.promote} style:--order={index}>
						{@render actionButton(action, menuIconsOnly)}
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.actions { display: flex; align-items: flex-start; gap: 8px; flex-shrink: 0; }
	.menu { position: relative; }
	.action-button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: 8px; padding: 10px 16px; border: 1px solid var(--color-stone-200); border-radius: 999px; background: white; font-size: 14px; font-weight: 700; line-height: 20px; white-space: nowrap; cursor: pointer; transition: transform 180ms, background-color 180ms; }
	.action-button :global(svg) { flex-shrink: 0; }
	.compact .toggle { width: 44px; height: 44px; padding: 0; }
	.action-button:hover { background: var(--color-stone-50); }
	.action-button[aria-pressed='true'] { background: var(--color-brand-50); color: var(--color-brand-600); box-shadow: inset 0 0 0 1px var(--color-brand-200); }
	.action-button:active { transform: scale(.97); }
	.action-button:focus-visible { outline: 2px solid var(--color-brand-500); outline-offset: 2px; }
	.action-button:disabled { opacity: .5; cursor: default; transform: none; }
	.action-button.text-red-600 { border-color: var(--color-red-200); }
	.action-button.text-red-600:hover { background: var(--color-red-50); }
	:global(.dark) .action-button { border-color: rgb(255 255 255 / .1); background: var(--color-stone-900); }
	:global(.dark) .action-button:hover { background: var(--color-stone-800); }
	:global(.dark) .action-button[aria-pressed='true'] { background: rgb(99 102 241 / .2); color: var(--color-brand-300); box-shadow: inset 0 0 0 1px rgb(99 102 241 / .4); }
	:global(.dark) .action-button.text-red-600 { border-color: rgb(239 68 68 / .3); }
	:global(.dark) .action-button.text-red-600:hover { background: rgb(239 68 68 / .1); }
	.hamburger { position: relative; flex-shrink: 0; width: 21px; height: 18px; transition: transform 280ms cubic-bezier(.22,1,.36,1); }
	.hamburger span { position: absolute; inset-inline: 0; top: 8px; height: 2px; border-radius: 2px; background: currentColor; transition: transform 280ms cubic-bezier(.22,1,.36,1), opacity 180ms; }
	.hamburger span:first-child { transform: translateY(-6px); }
	.hamburger span:last-child { transform: translateY(6px); }
	[data-open='true'] .hamburger { transform: rotate(90deg); }
	[data-open='true'] .hamburger span:first-child { transform: rotate(45deg); }
	[data-open='true'] .hamburger span:nth-child(2) { opacity: 0; transform: scaleX(0); }
	[data-open='true'] .hamburger span:last-child { transform: rotate(-45deg); }
	.dropdown-shell { position: absolute; top: calc(100% + 10px); right: 0; z-index: 40; width: min(260px, calc(100vw - 32px)); padding: 12px; border: 1px solid var(--color-stone-200); border-radius: 24px; background: white; box-shadow: 0 16px 40px rgb(0 0 0 / .14); visibility: hidden; opacity: 0; transform: translateY(-6px); clip-path: inset(0 0 100% 0); pointer-events: none; transition: opacity 180ms, transform 280ms cubic-bezier(.22,1,.36,1), clip-path 280ms cubic-bezier(.22,1,.36,1), visibility 280ms; }
	:global(.dark) .dropdown-shell { border-color: rgb(255 255 255 / .1); background: var(--color-stone-900); box-shadow: 0 16px 40px rgb(0 0 0 / .4); }
	.dropdown { display: grid; gap: 8px; }
	.dropdown-shell.floating { position: fixed; right: auto; z-index: 80; max-height: calc(100dvh - 16px); overflow-y: auto; }
	.dropdown-shell[data-upward='true'] { transform: translateY(6px); clip-path: inset(100% 0 0 0); }
	.dropdown .action-button { width: 100%; min-height: 50px; justify-content: flex-start; gap: 12px; padding: 12px 16px; font-size: 15px; }
	.icons-only .dropdown-shell, .dropdown-shell.icons-only { width: max-content; }
	.icons-only .dropdown { grid-auto-flow: column; }
	.icons-only .dropdown .action-button { width: 44px; min-height: 44px; justify-content: center; padding: 10px; }
	.dropdown-shell.dense { width: min(224px, calc(100vw - 16px)); padding: 5px; border-radius: 14px; }
	.dense .dropdown { gap: 1px; }
	.dense .dropdown .action-button { min-height: 36px; padding: 7px 10px; gap: 9px; border: 0; border-radius: 8px; font-size: 12px; line-height: 18px; white-space: normal; text-align: left; }
	.dense .dropdown .action-button :global(svg) { width: 17px; height: 17px; }
	.dropdown-shell.dense.icons-only { width: max-content; }
	.dense.icons-only .dropdown .action-button { width: 38px; height: 38px; padding: 0; justify-content: center; }
	.dense.icon-grid .dropdown { grid-auto-flow: row; grid-template-columns: repeat(var(--menu-cols), 38px); }
	.dense .dropdown-action { transition-delay: 0ms !important; }
	.dropdown-action { opacity: 0; transform: translateY(-6px); transition: opacity 180ms, transform 220ms cubic-bezier(.22,1,.36,1); transition-delay: 0ms; }
	[data-open='true'] .dropdown-shell, .dropdown-shell[data-open='true'] { visibility: visible; opacity: 1; transform: translateY(0); clip-path: inset(-48px); pointer-events: auto; }
	[data-open='true'] .dropdown-action { opacity: 1; transform: translateY(0) scale(1); transition-delay: calc(var(--order) * 45ms); }
	.promoted { display: none; }
	@container (min-width: 460px) {
		.promoted[data-size='small'] { display: block; }
		.dropdown-action[data-size='small'], .menu[data-collapse='small'] { display: none; }
	}
	@container (min-width: 560px) {
		.promoted[data-size='medium'] { display: block; }
		.dropdown-action[data-size='medium'], .menu[data-collapse='medium'] { display: none; }
	}
	@container (min-width: 700px) {
		.promoted[data-size='large'] { display: block; }
		.dropdown-action[data-size='large'], .menu[data-collapse='large'] { display: none; }
	}
	@media (prefers-reduced-motion: reduce) {
		.action-button, .hamburger, .hamburger span, .dropdown-shell, .dropdown-action { transition: none; }
	}
</style>
