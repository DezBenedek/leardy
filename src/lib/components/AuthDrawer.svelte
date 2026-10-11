<script lang="ts">
	import Drawer from '$lib/components/Drawer.svelte';
	import GoogleLoginButton from '$lib/components/GoogleLoginButton.svelte';
	import { authUI } from '$lib/auth-ui.svelte';
</script>

<Drawer
	open={authUI.open}
	label="Belépés"
	title="Belépés"
	onClose={() => authUI.hide()}
>
	<div class="mt-4">
		<GoogleLoginButton />
	</div>
</Drawer>
