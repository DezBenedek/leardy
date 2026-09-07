<script lang="ts">
	import { Toaster as Sonner } from 'svelte-sonner';
	import { store } from '$lib/db.svelte.js';

	const theme = $derived(store.data.profile.theme === 'dark' ? 'dark' : store.data.profile.theme === 'light' ? 'light' : undefined);
</script>

<Sonner
	{theme}
	position="top-center"
	offset="12px"
	gap={8}
	toastOptions={{
		style: 'border-radius: 9999px; font-weight: 600; font-size: 14px;'
	}}
/>
