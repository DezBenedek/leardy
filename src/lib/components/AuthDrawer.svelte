<script lang="ts">
	import { Check } from '@lucide/svelte';
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
		<div class="mt-4 flex" role="tablist" aria-label="Fiók művelet">
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'login'}
				onclick={() => (tab = 'login')}
				class={[
					'flex h-10 flex-1 items-center justify-center gap-1.5 rounded-l-full border text-sm transition',
					tab === 'login'
						? 'border-brand-500 bg-brand-50 font-bold text-brand-700 dark:border-brand-400 dark:bg-brand-500/20 dark:text-white'
						: 'border-stone-300 font-medium text-stone-600 dark:border-white/15 dark:text-stone-300'
				]}
			>
				{#if tab === 'login'}
					<Check size={15} strokeWidth={3} />
				{/if}
				Bejelentkezés
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'register'}
				onclick={() => (tab = 'register')}
				class={[
					'-ml-px flex h-10 flex-1 items-center justify-center gap-1.5 rounded-r-full border text-sm transition',
					tab === 'register'
						? 'border-brand-500 bg-brand-50 font-bold text-brand-700 dark:border-brand-400 dark:bg-brand-500/20 dark:text-white'
						: 'border-stone-300 font-medium text-stone-600 dark:border-white/15 dark:text-stone-300'
				]}
			>
				{#if tab === 'register'}
					<Check size={15} strokeWidth={3} />
				{/if}
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
