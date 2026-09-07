<script lang="ts">
	import { Eye, EyeOff } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';

	interface Props {
		onDone: () => void;
	}

	let { onDone }: Props = $props();

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let showPass = $state(false);
	let error = $state<string | null>(null);
	let busy = $state(false);

	const input =
		'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500';

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		busy = true;
		error = null;
		const res = await auth.register(name, email, password);
		busy = false;
		if (res.ok) onDone();
		else error = res.error;
	}
</script>

<form onsubmit={submit} class="space-y-3.5" novalidate>
	{#if error}
		<p role="alert" class="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
			{error}
		</p>
	{/if}
	<div>
		<label for="reg-name" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">Név</label>
		<input
			id="reg-name"
			type="text"
			autocomplete="name"
			placeholder="Add meg a neved"
			bind:value={name}
			class={input}
		/>
	</div>
	<div>
		<label for="reg-email" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">E-mail</label>
		<input
			id="reg-email"
			type="email"
			autocomplete="email"
			placeholder="te@pelda.hu"
			bind:value={email}
			class={input}
		/>
	</div>
	<div>
		<label for="reg-pass" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">Jelszó</label>
		<div class="relative">
			<input
				id="reg-pass"
				type={showPass ? 'text' : 'password'}
				autocomplete="new-password"
				placeholder="Min. 8 karakter"
				bind:value={password}
				class={input + ' pr-11'}
			/>
			<button
				type="button"
				onclick={() => (showPass = !showPass)}
				aria-label={showPass ? 'Jelszó elrejtése' : 'Jelszó mutatása'}
				class="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-stone-400 transition hover:text-ink-900 dark:text-stone-500 dark:hover:text-white"
			>
				{#if showPass}<EyeOff size={19} />{:else}<Eye size={19} />{/if}
			</button>
		</div>
	</div>
	<button
		type="submit"
		disabled={busy}
		class="w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 active:scale-[0.99] disabled:opacity-60"
	>
		{busy ? 'Fiók létrehozása…' : 'Regisztráció'}
	</button>
</form>
