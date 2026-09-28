<script lang="ts">
	import { Eye, EyeOff } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { toast } from '$lib/toast.svelte';

	interface Props {
		onDone: () => void;
		onBack: () => void;
	}

	let { onDone, onBack }: Props = $props();

	// Ketlepcsos folyamat: 1. kod keres emailre, 2. kod + uj jelszo.
	// A szerver mindig ok-t ad (enumeralas ellen), a kod 15 percig el.
	let step = $state<'request' | 'confirm'>( 'request');
	let email = $state('');
	let token = $state('');
	let code = $state('');
	let password = $state('');
	let confirm = $state('');
	let showPass = $state(false);
	let busy = $state(false);

	const input =
		'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:ring-brand-500/20';

	const submitCls =
		'inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-500 px-5 py-3 text-[15px] font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-60 dark:shadow-black/30';

	async function requestCode(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		busy = true;
		const res = await auth.requestPasswordReset(email);
		busy = false;
		if ('ok' in res && res.ok) {
			if (res.token) token = res.token;
			step = 'confirm';
			toast.success('Kód elküldve', 'Ha van ilyen fiók, perceken belül megérkezik a kód.');
		} else {
			toast.error('Sikertelen kérés', (res as { error: string }).error);
		}
	}

	async function confirmCode(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		if (password !== confirm) {
			toast.error('Nem egyezik', 'A két új jelszó nem egyezik.');
			return;
		}
		busy = true;
		const res = await auth.confirmPasswordReset(token, code, password);
		busy = false;
		if (res.ok) {
			toast.success('Jelszó megújítva!', 'Jelentkezz be az új jelszavaddal.');
			onDone();
		} else {
			toast.error('Sikertelen megerősítés', res.error);
		}
	}
</script>

{#if step === 'request'}
	<form onsubmit={requestCode} class="space-y-3.5" novalidate>
		<div>
			<label for="forgot-email" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">E-mail</label>
			<input
				id="forgot-email"
				type="email"
				autocomplete="email"
				autofocus
				placeholder="te@pelda.hu"
				bind:value={email}
				class={input}
			/>
		</div>
		<p class="text-[13px] leading-relaxed text-stone-500 dark:text-stone-400">
			6 jegyű kódot küldünk, ami 15 percig érvényes és egyszer használható.
		</p>
		<button type="submit" disabled={busy} class={submitCls}>
			{busy ? 'Küldés…' : 'Kód kérése'}
		</button>
		<button
			type="button"
			onclick={onBack}
			class="w-full text-center text-[13px] font-semibold text-stone-500 transition hover:text-ink-900 dark:text-stone-400 dark:hover:text-white"
		>
			Vissza a bejelentkezéshez
		</button>
	</form>
{:else}
	<form onsubmit={confirmCode} class="space-y-3.5" novalidate>
		<div>
			<label for="forgot-code" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">6 jegyű kód</label>
			<input
				id="forgot-code"
				type="text"
				inputmode="numeric"
				autocomplete="one-time-code"
				autofocus
				maxlength="6"
				placeholder="123456"
				bind:value={code}
				class={input + ' text-center tracking-[0.3em] font-extrabold'}
			/>
		</div>
		<div>
			<label for="forgot-pass" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">Új jelszó</label>
			<div class="relative">
				<input
					id="forgot-pass"
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
					class="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-stone-400 transition hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:text-stone-500 dark:hover:text-white"
				>
					{#if showPass}<EyeOff size={19} />{:else}<Eye size={19} />{/if}
				</button>
			</div>
		</div>
		<div>
			<label for="forgot-pass2" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">Új jelszó mégegyszer</label>
			<input
				id="forgot-pass2"
				type={showPass ? 'text' : 'password'}
				autocomplete="new-password"
				placeholder="Ismételd meg"
				bind:value={confirm}
				class={input}
			/>
		</div>
		<button type="submit" disabled={busy} class={submitCls}>
			{busy ? 'Mentés…' : 'Új jelszó mentése'}
		</button>
		<button
			type="button"
			onclick={() => (step = 'request')}
			class="w-full text-center text-[13px] font-semibold text-stone-500 transition hover:text-ink-900 dark:text-stone-400 dark:hover:text-white"
		>
			Vissza a kód kéréséhez
		</button>
	</form>
{/if}
