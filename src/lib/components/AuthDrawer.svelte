<script lang="ts">
	import Drawer from '$lib/components/Drawer.svelte';
	import LoginForm from '$lib/components/LoginForm.svelte';
	import RegisterForm from '$lib/components/RegisterForm.svelte';
	import { authUI, type AuthMode } from '$lib/auth-ui.svelte';

	let tab = $state<AuthMode>('login');

	$effect(() => {
		if (authUI.open) tab = authUI.mode;
	});
</script>

<Drawer open={authUI.open} label="Fiók" onClose={() => authUI.hide()}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">
			{tab === 'login' ? 'Bejelentkezés' : 'Regisztráció'}
		</h2>
		<div class="mt-4 grid grid-cols-2 gap-1 rounded-full bg-stone-100 p-1 dark:bg-white/10" role="tablist" aria-label="Fiók művelet">
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'login'}
				onclick={() => (tab = 'login')}
				class={[
					'rounded-full py-2 text-sm transition',
					tab === 'login'
						? 'bg-white font-bold text-ink-900 shadow-sm dark:bg-white/15 dark:text-white'
						: 'font-medium text-stone-500 dark:text-stone-400'
				]}
			>
				Bejelentkezés
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'register'}
				onclick={() => (tab = 'register')}
				class={[
					'rounded-full py-2 text-sm transition',
					tab === 'register'
						? 'bg-white font-bold text-ink-900 shadow-sm dark:bg-white/15 dark:text-white'
						: 'font-medium text-stone-500 dark:text-stone-400'
				]}
			>
				Regisztráció
			</button>
		</div>
		<div class="mt-5">
			{#if tab === 'login'}
				<LoginForm onDone={() => authUI.hide()} />
			{:else}
				<RegisterForm onDone={() => authUI.hide()} />
			{/if}
		</div>
	</div>
</Drawer>
