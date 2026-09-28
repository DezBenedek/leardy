<script lang="ts">
	import { Check } from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import ForgotPasswordForm from '$lib/components/ForgotPasswordForm.svelte';
	import LoginForm from '$lib/components/LoginForm.svelte';
	import RegisterForm from '$lib/components/RegisterForm.svelte';
	import { authUI, type AuthMode } from '$lib/auth-ui.svelte';

	let tab = $state<AuthMode>('login');

	$effect(() => {
		if (authUI.open) tab = authUI.mode;
	});
</script>

<Drawer
	open={authUI.open}
	label="Fiók"
	title={tab === 'login' ? 'Bejelentkezés' : tab === 'register' ? 'Regisztráció' : 'Elfelejtett jelszó'}
	onClose={() => authUI.hide()}
>
		{#if tab === 'forgot'}
			<p class="mt-1 text-[13px] text-stone-500 dark:text-stone-400">
				6 jegyű kódot küldünk e-mailben, ami 15 percig érvényes. A kóddal állíthatsz be új jelszót.
			</p>
		{/if}
		{#if tab !== 'forgot'}
		<div class="mt-3 flex" role="tablist" aria-label="Fiók művelet">
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'login'}
				onclick={() => (tab = 'login')}
				class={[
					'flex h-10 flex-1 items-center justify-center gap-1.5 rounded-l-full border text-sm transition',
					'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 motion-reduce:transition-none',
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
					'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 motion-reduce:transition-none',
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
		{/if}
		<div class="mt-4">
			{#if tab === 'login'}
				<LoginForm onDone={() => authUI.hide()} />
			{:else if tab === 'register'}
				<RegisterForm onDone={() => authUI.hide()} />
			{:else}
				<ForgotPasswordForm onDone={() => (tab = 'login')} onBack={() => (tab = 'login')} />
			{/if}
		</div>
</Drawer>
