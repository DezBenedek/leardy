<script lang="ts">
	interface Props {
		label?: string;
		busy?: boolean;
	}

	let { label = 'Belépés Google fiókkal', busy = false }: Props = $props();

	function login() {
		window.location.href = '/api/auth/google';
	}
</script>

<button
	type="button"
	onclick={login}
	disabled={busy}
	class="inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-white px-5 py-3 text-[15px] font-bold text-ink-900 shadow-lg shadow-black/5 ring-1 ring-stone-300 transition hover:bg-stone-50 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-60 dark:bg-white dark:shadow-black/30 dark:ring-0 dark:hover:bg-stone-100"
>
	<svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
		<path
			fill="#4285F4"
			d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81Z"
		/>
		<path
			fill="#34A853"
			d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24Z"
		/>
		<path
			fill="#FBBC05"
			d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1Z"
		/>
		<path
			fill="#EA4335"
			d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.42-3.42A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77Z"
		/>
	</svg>
	{label}
</button>
<div class="mt-2.5 text-center">
	<p class="text-[13px] font-semibold text-stone-500 dark:text-stone-400">Támogatott iskolák:</p>
	<ul class="mt-1">
		<li>
			<a
				href="https://szentangela.hu"
				target="_blank"
				rel="noopener noreferrer"
				class="text-[13px] font-semibold text-brand-600 underline decoration-brand-300 underline-offset-2 dark:text-brand-400"
			>
				Szent Angéla Ferences Általános Iskola és Gimnázium
			</a>
		</li>
	</ul>
</div>
