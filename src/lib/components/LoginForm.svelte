<script lang="ts">
	import { Eye, EyeOff } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
	import { toast } from '$lib/toast.svelte';

	interface Props {
		onDone: () => void;
	}

	let { onDone }: Props = $props();

	let email = $state('');
	let password = $state('');
	let showPass = $state(false);
	let busy = $state(false);

	const input =
		'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:ring-brand-500/20';

	const submitCls =
		'inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-500 px-5 py-3 text-[15px] font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-60 dark:shadow-black/30';

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		busy = true;
		const res = await auth.login(email, password);
		busy = false;
		if (res.ok) {
			toast.success('Szia újra!', 'Sikeres bejelentkezés.');
			onDone();
		} else {
			toast.error('Sikertelen belépés', res.error);
		}
	}
</script>

<form onsubmit={submit} class="space-y-3.5" novalidate>
	<div>
		<label for="login-email" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">E-mail</label>
		<input
			id="login-email"
			type="email"
			autocomplete="email"
			autofocus
			placeholder="te@pelda.hu"
			bind:value={email}
			class={input}
		/>
	</div>
	<div>
		<label for="login-pass" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">Jelszó</label>
		<div class="relative">
			<input
				id="login-pass"
				type={showPass ? 'text' : 'password'}
				autocomplete="current-password"
				placeholder="••••••••"
				bind:value={password}
				class={input + ' pr-11'}
			/>
			<button
				type="button"
				onclick={() => (showPass = !showPass)}
				aria-label={showPass ? 'Jelszó elrejtése' : 'Jelszó mutatása'}
				class="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-stone-400 transition hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:text-stone-500 dark:hover:text-white"
			>
				{#if showPass}<EyeOff size={19} />{:else}<Eye size={19} />{/if}
			</button>
		</div>
	</div>
	<button
		type="submit"
		disabled={busy}
		class={submitCls}
	>
		{busy ? 'Belépés…' : 'Bejelentkezés'}
	</button>
	<button
		type="button"
		onclick={() => authUI.show('forgot')}
		class="w-full text-center text-[13px] font-semibold text-stone-500 transition hover:text-brand-600 dark:text-stone-400 dark:hover:text-brand-400"
	>
		Elfelejtetted a jelszavad?
	</button>
</form>
