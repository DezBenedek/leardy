<script lang="ts">
	import { FileUp, Image as ImageIcon, Mic } from '@lucide/svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { portal } from '$lib/components/SubjectPicker.svelte';

	/* Csatolmányválasztó beadandóhoz: + gombra nyílik, csak az engedélyezett
	   típusokat kínálja (kép/fotó, hangfelvétel, fájl). Drawer belsejéből is nyitható. */

	export type AttachKind = 'image' | 'audio' | 'file';

	interface Props {
		open: boolean;
		allowImage: boolean;
		allowAudio: boolean;
		allowFile: boolean;
		onPick: (kind: AttachKind) => void;
		onClose: () => void;
	}

	let { open, allowImage, allowAudio, allowFile, onPick, onClose }: Props = $props();

	const rowBtn =
		'flex w-full items-center gap-2.5 rounded-2xl p-2.5 text-left transition hover:bg-stone-100 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 dark:hover:bg-white/5';

	function pick(kind: AttachKind) {
		onClose();
		onPick(kind);
	}
</script>

<!-- Mindig mountolva: a Sheet sajat open allapota vezerli a becsukas animaciot is. -->
<div use:portal>
	<Sheet {open} label="Csatolmány hozzáadása" title="Mit adsz hozzá?" {onClose}>
			<ul class="-mx-1 mt-2 space-y-0.5">
				{#if allowImage}
					<li>
						<button type="button" onclick={() => pick('image')} class={rowBtn}>
							<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300">
								<ImageIcon size={18} aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Kép / fotó</span>
								<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Fotózás vagy választás</span>
							</span>
						</button>
					</li>
				{/if}
				{#if allowAudio}
					<li>
						<button type="button" onclick={() => pick('audio')} class={rowBtn}>
							<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300">
								<Mic size={18} aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Hangfelvétel</span>
								<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Felvétel készítése</span>
							</span>
						</button>
					</li>
				{/if}
				{#if allowFile}
					<li>
						<button type="button" onclick={() => pick('file')} class={rowBtn}>
							<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500 dark:bg-white/10 dark:text-stone-300">
								<FileUp size={18} aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-extrabold text-ink-900 dark:text-white">Fájl</span>
								<span class="block text-[12px] font-medium text-stone-500 dark:text-stone-400">Bármilyen fájl, max 10 MB</span>
							</span>
						</button>
					</li>
			{/if}
		</ul>
	</Sheet>
</div>
