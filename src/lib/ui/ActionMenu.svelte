<script lang="ts" module>
	import type { Save } from '@lucide/svelte';

	export interface ActionMenuItem {
		id: string;
		label: string;
		icon: typeof Save;
		onclick: () => void;
		disabled?: boolean;
		tone?: 'default' | 'danger';
		/** A fejléc rendelkezésre álló szélességéhez igazodik. */
		promote?: 'small' | 'medium' | 'large';
		/** A fejlécben csak az ikon látszik, a menüben a felirat is. */
		iconOnly?: boolean;
	}
</script>

<script lang="ts">
	import { Ellipsis } from '@lucide/svelte';
	import IconButton from './IconButton.svelte';
	let { actions, label = 'Műveletek', disabled = false, compact = false, menuIconsOnly = false }: {
		actions: ActionMenuItem[];
		label?: string;
		disabled?: boolean;
		compact?: boolean;
		menuIconsOnly?: boolean;
	} = $props();
	let open = $state(false);
	let root: HTMLElement | undefined = $state();
	const id = $props.id();
	let expandable = $derived(actions.filter((action) => action.promote));
	let collapseAt = $derived(actions.some((action) => !action.promote) ? '' :
		actions.some((action) => action.promote === 'large') ? 'large' :
		actions.some((action) => action.promote === 'medium') ? 'medium' : 'small');

	function run(action: ActionMenuItem) {
		if (disabled || action.disabled) return;
		open = false;
		action.onclick();
	}

	function outside(event: PointerEvent) {
		if (open && event.target instanceof Node && !root?.contains(event.target)) open = false;
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			open = false;
			root?.querySelector<HTMLButtonElement>('[aria-expanded]')?.focus();
		}
	}
</script>

<svelte:window onpointerdown={outside} onkeydown={keydown} />

{#snippet actionButton(action: ActionMenuItem, iconOnly = false)}
	<button type="button" aria-label={action.label} title={action.label} disabled={disabled || action.disabled}
		onclick={() => run(action)}
		class={['action-button', action.tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-ink-600 dark:text-stone-300']}>
		<action.icon size={20} aria-hidden="true" />
		{#if !iconOnly}<span>{action.label}</span>{/if}
	</button>
{/snippet}

<div bind:this={root} class={['actions', { compact, 'icons-only': menuIconsOnly }]} data-open={open}>
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
			aria-expanded={open} aria-controls={id} {disabled} onclick={() => (open = !open)}>
			{#if compact}
				<Ellipsis size={20} aria-hidden="true" />
			{:else}
				<span class="hamburger" aria-hidden="true"><span></span><span></span><span></span></span>
				<span>Műveletek</span>
			{/if}
		</button>
		<div class="dropdown-shell">
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
	.action-button:active { transform: scale(.97); }
	.action-button:focus-visible { outline: 2px solid var(--color-brand-500); outline-offset: 2px; }
	.action-button:disabled { opacity: .5; cursor: default; transform: none; }
	.action-button.text-red-600 { border-color: var(--color-red-200); }
	.action-button.text-red-600:hover { background: var(--color-red-50); }
	:global(.dark) .action-button { border-color: rgb(255 255 255 / .1); background: var(--color-stone-900); }
	:global(.dark) .action-button:hover { background: var(--color-stone-800); }
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
	.dropdown-shell { position: absolute; top: calc(100% + 10px); right: 0; z-index: 40; width: min(260px, calc(100vw - 32px)); padding: 12px; border: 1px solid var(--color-stone-200); border-radius: 24px; background: white; box-shadow: 0 16px 40px rgb(0 0 0 / .14); visibility: hidden; opacity: 0; transform: translateY(-8px); pointer-events: none; transition: opacity 180ms, transform 220ms cubic-bezier(.22,1,.36,1), visibility 220ms; }
	:global(.dark) .dropdown-shell { border-color: rgb(255 255 255 / .1); background: var(--color-stone-900); box-shadow: 0 16px 40px rgb(0 0 0 / .4); }
	.dropdown { display: grid; gap: 8px; }
	.dropdown .action-button { width: 100%; min-height: 50px; justify-content: flex-start; gap: 12px; padding: 12px 16px; font-size: 15px; }
	.icons-only .dropdown-shell { width: max-content; }
	.icons-only .dropdown { grid-auto-flow: column; }
	.icons-only .dropdown .action-button { width: 44px; min-height: 44px; justify-content: center; padding: 10px; }
	.dropdown-action { opacity: 0; transform: translateY(-6px); transition: opacity 180ms, transform 220ms cubic-bezier(.22,1,.36,1); transition-delay: 0ms; }
	[data-open='true'] .dropdown-shell { visibility: visible; opacity: 1; transform: translateY(0); pointer-events: auto; }
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
