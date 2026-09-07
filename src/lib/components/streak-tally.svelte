<script lang="ts">
	import { t } from '$lib/i18n.js';

	/** Sorozat-számláló a régi StreakTally alapján. */
	interface Props {
		days: number;
	}

	let { days }: Props = $props();
</script>

<div class="flex items-center gap-3">
	<span
		class="font-display grid size-[52px] shrink-0 place-items-center rounded-2xl text-[22px] font-bold"
		style="color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent)"
	>
		{days}
	</span>
	<span class="min-w-0">
		<span class="block text-[16px] font-semibold">{t('home.streak')}</span>
		<span class="text-muted-foreground block text-[14px]">
			{days === 0 ? t('home.streakNone') : `${days} ${t('home.streakDaysSuffix')}`}
		</span>
	</span>
</div>
