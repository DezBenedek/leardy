<script lang="ts">
	import { Copy } from '@lucide/svelte';
	import { formatKeyDate, inputCls } from './settings-ui';
	import type { ApiKeysStore } from './api-keys.svelte';

	interface Props {
		isTeacher: boolean;
		api: ApiKeysStore;
	}

	let { isTeacher, api }: Props = $props();
</script>

<div class="mt-3">
	{#if !isTeacher}
		<p class="text-sm leading-relaxed text-stone-500 dark:text-stone-400">
			A fejlesztői beállításokhoz tanári fiók kell.
		</p>
	{:else}
		<p class="text-[13px] leading-relaxed text-stone-500 dark:text-stone-400">
			A publikus API-val a tanulás és a kártyák szinte mindene elérhető: tantárgyak, leckék, kvízek, hivatalos és saját kártyák, haladás és gyakorlás. A kulcs a te nevedben jár el.
		</p>
		{#if api.newSecret}
			<div class="mt-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
				<p class="text-[13px] font-bold text-emerald-700 dark:text-emerald-300">Új kulcs elkészült, másold ki most</p>
				<p class="mt-1 rounded-xl bg-white px-3 py-2 font-mono text-[13px] break-all text-ink-900 dark:bg-black/30 dark:text-white">{api.newSecret}</p>
				<div class="mt-2 flex gap-2">
					<button type="button" onclick={() => api.copySecret()} class="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white transition hover:bg-emerald-700">
						<Copy size={15} /> Másolás
					</button>
					<button type="button" onclick={() => (api.newSecret = null)} class="rounded-full border border-emerald-300 px-4 py-2 text-[13px] font-bold text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300">
						Elrejtés
					</button>
				</div>
				<p class="mt-2 text-[12px] leading-relaxed text-emerald-700/80 dark:text-emerald-300/80">Később nem jelenik meg újra. Teszt: curl -H "Authorization: Bearer TOKEN" /api/v1/me</p>
			</div>
		{/if}
		<form onsubmit={(e) => api.createApiKey(e)} class="mt-3 flex gap-2">
			<input
				type="text"
				placeholder="Kulcs neve, pl. Saját script"
				bind:value={api.name}
				maxlength={60}
				disabled={api.busy}
				aria-label="Kulcs neve"
				class={inputCls}
			/>
			<button type="submit" disabled={api.busy} class="shrink-0 rounded-full bg-brand-500 px-5 py-2.5 text-[14px] font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 disabled:opacity-60">
				{api.busy ? 'Készül…' : 'Új kulcs'}
			</button>
		</form>
		<div class="mt-4">
			<div class="flex items-center justify-between">
				<p class="text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Aktív kulcsok</p>
				<button type="button" onclick={() => api.loadApiKeys(true)} disabled={api.loading} class="text-[13px] font-bold text-brand-600 dark:text-brand-400 disabled:opacity-50">
					{api.loading ? 'Frissítés…' : 'Frissítés'}
				</button>
			</div>
			{#if api.loading && !api.loaded}
				<p class="mt-2 text-sm text-stone-500">Betöltés…</p>
			{:else if api.keys.length === 0}
				<p class="mt-2 rounded-xl bg-stone-100 p-3.5 text-[13px] leading-relaxed text-stone-500 dark:bg-white/5 dark:text-stone-400">
					Még nincs kulcsod. Hozz létre egyet a fenti mezővel, legfeljebb 10 aktív kulcsod lehet.
				</p>
			{:else}
				<ul class="mt-2 grid gap-2">
					{#each api.keys as k (k.id)}
						<li class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
							<div class="flex items-center gap-2">
								<p class="min-w-0 flex-1 truncate text-[15px] font-bold text-ink-900 dark:text-white">{k.name}</p>
								<button
									type="button"
									onclick={() => api.revokeApiKey(k.id)}
									disabled={api.revokeBusy === k.id}
									class="shrink-0 rounded-full border border-red-200 px-3 py-1.5 text-[12px] font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
								>
									{api.revokeBusy === k.id ? 'Visszavonás…' : 'Visszavonás'}
								</button>
							</div>
							<p class="mt-0.5 font-mono text-[12px] text-stone-400 dark:text-stone-500">{k.prefix} · létrehozva {formatKeyDate(k.createdAt)}</p>
							<p class="text-[12px] text-stone-400 dark:text-stone-500">Utolsó használat: {formatKeyDate(k.lastUsedAt)}</p>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<div class="mt-3 rounded-xl bg-stone-100 p-3.5 text-[13px] leading-relaxed text-ink-600 dark:bg-white/5 dark:text-stone-400">
			Dokumentáció: <span class="font-mono font-semibold">docs/public-api.md</span> és <span class="font-mono font-semibold">GET /api/v1/</span>. Példa: <span class="font-mono">Authorization: Bearer ld_...</span>
		</div>
	{/if}
</div>
