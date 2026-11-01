<script lang="ts">
	import { inputCls, primaryCls } from './settings-ui';

	interface Props {
		nameDraft: string;
		busyName: boolean;
		onSubmit: (e: SubmitEvent) => void;
	}

	let { nameDraft = $bindable(), busyName, onSubmit }: Props = $props();
</script>

<form onsubmit={onSubmit} class="mt-3 space-y-3.5" novalidate>
	<div>
		<label for="account-name" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">Név</label>
		<input
			id="account-name"
			type="text"
			autocomplete="name"
			placeholder="Add meg a neved"
			bind:value={nameDraft}
			disabled={busyName}
			class={inputCls}
		/>
	</div>
	<button type="submit" disabled={busyName} class={primaryCls}>
		{busyName ? 'Mentés…' : 'Név mentése'}
	</button>
</form>
