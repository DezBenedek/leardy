<script lang="ts">
	import { UserMinus } from '@lucide/svelte';
	import Card from '$lib/ui/Card.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { fmtDate } from './classroom-format';
	import type { Member } from './classroom-task-utils';

	let {
		open,
		members,
		isOwner,
		confirmKickId,
		kicking,
		onClose,
		onKick
	}: {
		open: boolean;
		members: Member[];
		isOwner: boolean;
		confirmKickId: string | null;
		kicking: boolean;
		onClose: () => void;
		onKick: (id: string, name: string) => void;
	} = $props();
</script>

<Drawer {open} label="Tagok" title={`Tagok (${members.length})`} onClose={onClose}>
	<div class="mt-2 grid gap-2">
		{#if members.length === 0}
			<Card><p class="text-sm text-stone-500 dark:text-stone-400">Még senki nem csatlakozott.</p></Card>
		{:else}
			{#each members as m (m.id)}
				{@const confirm = confirmKickId === m.id}
				<Card>
					<div class="flex items-center gap-3">
						<div class="min-w-0 flex-1 self-center">
							<p class="truncate text-[15px] font-bold text-ink-900 dark:text-white">{m.name}</p>
							<p class="text-[12px] text-stone-400 dark:text-stone-500">
								Csatlakozott: {fmtDate(m.joined_at)}
							</p>
						</div>
						{#if isOwner}
							<button
								type="button"
								onclick={() => onKick(m.id, m.name)}
								disabled={kicking}
								aria-label={confirm ? 'Kidobás megerősítése' : `${m.name} kidobása`}
								class={[
									'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition active:scale-[0.98] disabled:opacity-60',
									confirm
										? 'bg-red-600 text-white hover:bg-red-700'
										: 'border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10'
								]}
							>
								<UserMinus size={15} />
								{confirm ? (kicking ? '…' : 'Biztos?') : 'Kidobom'}
							</button>
						{/if}
					</div>
				</Card>
			{/each}
		{/if}
	</div>
</Drawer>
