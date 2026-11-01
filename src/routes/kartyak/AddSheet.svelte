<script lang="ts">
	import { ChevronRight, Compass, Plus } from '@lucide/svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { optRowBtn, optTile } from './library-ui';

	interface Props {
		open: boolean;
		onClose: () => void;
		onDiscover: () => void;
		onCreate: () => void;
	}

	let { open, onClose, onDiscover, onCreate }: Props = $props();
</script>

<Sheet {open} label="Hozzáadás" title="Hozzáadás" {onClose}>
	<ul class="mt-2 space-y-0.5">
		<li>
			<button
				type="button"
				data-tutorial="cards-discover"
				onclick={onDiscover}
				class={[optRowBtn, 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={optTile(false)}><Compass size={18} aria-hidden="true" /></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Felfedezés</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Hivatalos csomagok böngészése</span>
				</span>
				<ChevronRight size={17} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
			</button>
		</li>
		<li>
			<button
				type="button"
				onclick={onCreate}
				class={[optRowBtn, 'hover:bg-stone-100 dark:hover:bg-white/5']}
			>
				<span class={optTile(false)}><Plus size={18} aria-hidden="true" /></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Létrehozás</span>
					<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Új saját kártyacsomag</span>
				</span>
				<ChevronRight size={17} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
			</button>
		</li>
	</ul>
</Sheet>
