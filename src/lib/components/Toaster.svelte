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

	// Egyszerre csak egy toast: mindig a legfrissebb látszik.
	let current = $derived(toast.items.length > 0 ? toast.items[toast.items.length - 1] : null);
</script>

{#if current}
	<div
		class="pointer-events-none fixed inset-x-0 top-0 z-[90] flex flex-col items-center px-4"
		style="padding-top: max(0.75rem, env(safe-area-inset-top))"
		aria-live="polite"
	>
		{#key current.id}
			{@const Icon = icons[current.tone]}
			<div
				role={current.tone === 'error' || current.tone === 'warning' ? 'alert' : 'status'}
				class="toast-card anim-toast pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 shadow-xl shadow-stone-900/10 dark:border-white/10 dark:bg-stone-900 dark:shadow-black/40"
				style={current.leaving ? 'opacity: 0;' : 'opacity: 1;'}
			>
				<span class={['grid size-9 shrink-0 place-items-center rounded-xl', tiles[current.tone]]}>
					<Icon size={19} aria-hidden="true" />
				</span>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-bold text-ink-900 dark:text-white">{current.title}</p>
					{#if current.message}
						<p class="mt-0.5 text-[13px] leading-snug text-stone-500 dark:text-stone-400">{current.message}</p>
					{/if}
				</div>
				<button
					type="button"
					onclick={() => toast.dismiss(current.id)}
					aria-label="Értesítés bezárása"
					class="grid size-8 shrink-0 place-items-center rounded-full text-stone-400 transition duration-300 hover:bg-stone-100 hover:text-ink-900 hover:rotate-90 active:scale-95 motion-reduce:transition-none motion-reduce:hover:rotate-0 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-white"
				>
					<X size={18} />
				</button>
			</div>
		{/key}
	</div>
{/if}
