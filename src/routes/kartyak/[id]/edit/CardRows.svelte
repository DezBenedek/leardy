<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { CardRow } from './edit-format';
	import { cardInputCls } from './edit-ui';

	interface Props {
		cards: CardRow[];
		frontLabel: string;
		backLabel: string;
		onRowInput: () => void;
		onPasteCard: (e: ClipboardEvent, card: CardRow) => void;
		onCardKeydown: (e: KeyboardEvent, card: CardRow, field: 'front' | 'back') => void;
		onRowFocusOut: (e: FocusEvent) => void;
		onRemoveRow: (card: CardRow) => void;
	}

	let {
		cards = $bindable(),
		frontLabel,
		backLabel,
		onRowInput,
		onPasteCard,
		onCardKeydown,
		onRowFocusOut,
		onRemoveRow
	}: Props = $props();
</script>

<div class="mt-2 overflow-hidden rounded-[20px] border border-stone-200 bg-white dark:border-white/10 dark:bg-stone-900">
	<div class="flex items-center gap-1.5 border-b border-stone-100 bg-stone-50 px-2 py-2 dark:border-white/5 dark:bg-white/5" aria-hidden="true">
		<span class="grid size-6 shrink-0"></span>
		<p class="min-w-0 flex-1 text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">
			{frontLabel}
		</p>
		<p class="min-w-0 flex-1 text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">
			{backLabel}
		</p>
		{#if cards.length > 1}
			<span class="grid size-8 shrink-0"></span>
		{/if}
	</div>
	<ul id="card-rows" class="divide-y divide-stone-100 dark:divide-white/5">
		{#each cards as card, i (card.key)}
			<li class="flex items-center gap-1.5 px-2 py-1.5" data-key={card.key} onfocusout={onRowFocusOut}>
				<span
					class="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-extrabold text-brand-600 tabular-nums dark:bg-brand-500/20 dark:text-white"
					aria-hidden="true"
				>
					{i + 1}
				</span>
				<input
					bind:value={card.front}
					data-field="front"
					oninput={onRowInput}
					onpaste={(e) => onPasteCard(e, card)}
					onkeydown={(e) => onCardKeydown(e, card, 'front')}
					placeholder={frontLabel}
					aria-label="{i + 1}. kártya {frontLabel.toLowerCase()} oldala"
					class={cardInputCls}
				/>
				<input
					bind:value={card.back}
					data-field="back"
					oninput={onRowInput}
					onpaste={(e) => onPasteCard(e, card)}
					onkeydown={(e) => onCardKeydown(e, card, 'back')}
					placeholder={backLabel}
					aria-label="{i + 1}. kártya {backLabel.toLowerCase()} oldala"
					class={cardInputCls}
				/>
				{#if cards.length > 1}
					<button
						type="button"
						tabindex="-1"
						onclick={() => onRemoveRow(card)}
						aria-label="{i + 1}. kártya törlése"
						class="grid size-8 shrink-0 place-items-center rounded-full text-stone-300 transition hover:bg-red-50 hover:text-red-600 active:scale-95 dark:text-stone-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
					>
						<X size={15} />
					</button>
				{/if}
			</li>
		{/each}
	</ul>
</div>
