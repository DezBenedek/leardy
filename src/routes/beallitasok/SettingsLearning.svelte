<script lang="ts">
	import Toggle from '$lib/components/Toggle.svelte';
	import { canTeach } from '$lib/admin/roles';
	import type { AppSettings } from '$lib/state/settings';
	import type { User } from '$lib/state/auth.svelte';

	interface Props {
		settings: AppSettings;
		user: User | null;
		wordLangs: { subjectId: string; subjectTitle: string }[];
		onToggleWordSubject: (subjectId: string, visible: boolean) => void;
	}

	let { settings, user, wordLangs, onToggleWordSubject }: Props = $props();
</script>

<div class="mt-3 divide-y divide-stone-100 dark:divide-white/5">
	<div class="flex items-center gap-3 py-3">
		<div class="min-w-0 flex-1">
			<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Szógyakorlás a főoldalon</p>
		</div>
		<Toggle bind:checked={settings.homeWords} label="Szógyakorlás a főoldalon" />
	</div>
	<div
		class="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
		style="grid-template-rows: {settings.homeWords && wordLangs.length > 0 ? '1fr' : '0fr'}"
	>
		<div class="min-h-0 overflow-hidden">
			{#if wordLangs.length > 0}
				<div class="py-3">
					<div class="ml-1 border-l-2 border-brand-500/60 pl-3 dark:border-brand-400/60">
						<p class="text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">A szógyakorlás nyelvei</p>
						<ul class="mt-1 divide-y divide-stone-100 dark:divide-white/5">
							{#each wordLangs as lang (lang.subjectId)}
								<li class="flex items-center gap-3 py-2.5">
									<p class="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-900 dark:text-white">{lang.subjectTitle}</p>
									<Toggle
										checked={!settings.hiddenWordSubjects.includes(lang.subjectId)}
										onchange={(v) => onToggleWordSubject(lang.subjectId, v)}
										label={lang.subjectTitle}
									/>
								</li>
							{/each}
						</ul>
					</div>
				</div>
			{/if}
		</div>
	</div>
	<div class="flex items-center gap-3 py-3">
		<div class="min-w-0 flex-1">
			<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Bekezdések a leckékben nyitva</p>
		</div>
		<Toggle bind:checked={settings.openAllLessonSections} label="Bekezdések a leckékben nyitva" />
	</div>
	{#if canTeach(user?.role, user?.is_admin)}
		<div class="flex items-center gap-3 py-3">
			<div class="min-w-0 flex-1">
				<p class="text-[15px] font-semibold text-ink-900 dark:text-white">Teljes szöveg a szerkesztőben</p>
			</div>
			<Toggle bind:checked={settings.expandEditorTextareas} label="Teljes szöveg a szerkesztőben" />
		</div>
	{/if}
</div>
