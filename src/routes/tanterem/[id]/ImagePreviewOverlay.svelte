<script lang="ts">
	import { X } from '@lucide/svelte';
	import { uploadUrl, type UploadItem } from './classroom-task-utils';

	let {
		upload,
		assignmentId,
		roomId,
		onClose
	}: {
		upload: UploadItem | null;
		assignmentId: string | null;
		roomId: string;
		onClose: () => void;
	} = $props();
</script>

{#if upload && assignmentId}
	<div class="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" role="presentation">
		<button type="button" tabindex="-1" aria-label="Előnézet bezárása" onclick={onClose} class="absolute inset-0"></button>
		<div class="relative max-h-full max-w-full overflow-auto">
			<img src={uploadUrl(roomId, assignmentId, upload.id)} alt={upload.file_name} class="max-h-[80dvh] w-auto max-w-full" />
			<button
				type="button"
				onclick={onClose}
				aria-label="Bezárás"
				class="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
			>
				<X size={18} />
			</button>
		</div>
	</div>
{/if}
