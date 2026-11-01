<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from '$lib/state/toast.svelte';

	let email = $state('');
	let setupKey = $state('');
	let busy = $state(false);
	let done = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		busy = true;
		try {
			const res = await fetch('/api/admin/bootstrap', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ email: email.trim(), setupKey })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült', j.error ?? 'Próbáld újra.');
				return;
			}
			done = true;
			toast.success('Fejlesztői hozzáférés kész');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Fejlesztői indítás | Leardy</title>
</svelte:head>

{#if done}
	<div class="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
		<p class="font-display text-[19px] font-extrabold text-ink-900 dark:text-white">Kész, te vagy az első fejlesztő</p>
		<p class="mt-1 text-sm text-stone-500">Jelentkezz ki és be a jogosultság frissítéséhez, utána oszthatsz szerepeket.</p>
		<button
			type="button"
			onclick={() => void goto('/admin/fejleszto')}
			class="mt-4 rounded-full bg-ink-900 px-5 py-2.5 text-[14px] font-bold text-white dark:bg-white dark:text-ink-900"
		>
			Tovább a fejlesztői oldalra
		</button>
	</div>
{:else}
	<div class="rounded-2xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-stone-900">
		<h2 class="font-display text-[18px] font-extrabold">Első fejlesztő beállítása</h2>
		<p class="mt-1 text-[13px] leading-relaxed text-stone-500">
			Csak egyszer használható, amíg nincs fejlesztő a rendszerben. Előbb lépj be Google fiókkal,
			utána add meg az e-mail-címed és a telepítési kulcsot (<span class="font-mono">ADMIN_SETUP_KEY</span>).
		</p>
		<form onsubmit={submit} class="mt-3 grid gap-2.5">
			<input
				type="email"
				required
				bind:value={email}
				maxlength={254}
				placeholder="te@szentangela.hu"
				aria-label="E-mail-cím"
				class="w-full rounded-2xl border border-stone-200 px-4 py-2.5 text-[14px] outline-none focus:border-brand-500 dark:border-white/10 dark:bg-stone-950"
			/>
			<input
				type="password"
				required
				bind:value={setupKey}
				placeholder="Telepítési kulcs"
				aria-label="Telepítési kulcs"
				autocomplete="off"
				class="w-full rounded-2xl border border-stone-200 px-4 py-2.5 text-[14px] outline-none focus:border-brand-500 dark:border-white/10 dark:bg-stone-950"
			/>
			<button
				type="submit"
				disabled={busy || !email.trim() || !setupKey}
				class="rounded-full bg-ink-900 px-5 py-2.5 text-[14px] font-bold text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-ink-900"
			>
				{busy ? 'Ellenőrzés…' : 'Fejlesztővé válok'}
			</button>
		</form>
	</div>
{/if}
