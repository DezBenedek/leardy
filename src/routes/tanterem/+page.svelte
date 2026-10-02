<script lang="ts">
	import { KeyRound, Plus, Sparkles, Users } from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { toast } from '$lib/toast.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import SubjectPicker from '$lib/components/SubjectPicker.svelte';
	import type { Subject } from '$lib/curriculum';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Input from '$lib/ui/Input.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface Room {
		id: string;
		code: string;
		name: string;
		subject: string;
		description: string;
		teacher_name?: string;
		member_count?: number;
	}

	let teaching = $state<Room[]>([]);
	let joined = $state<Room[]>([]);
	let teacherMode = $state(false);
	let seeded = $state(false);

	$effect(() => {
		if (!seeded) {
			teaching = [...data.teaching];
			joined = [...data.joined];
			teacherMode = data.isTeacher || auth.user?.role === 'teacher';
			seeded = true;
		} else if (auth.user?.role === 'teacher') {
			teacherMode = true;
		}
	});

	type Sheet = null | 'choice' | 'join' | 'create';
	let sheet = $state<Sheet>(null);

	let roomName = $state('');
	let roomSubjectId = $state('');
	let creating = $state(false);
	let createError = $state<string | null>(null);

	let subjects = $state<Subject[]>([]);
	let subjectsLoaded = $state(false);

	async function ensureSubjects() {
		if (subjectsLoaded) return;
		try {
			const res = await fetch('/api/browse');
			const j = await res.json().catch(() => ({}));
			if (res.ok && Array.isArray(j.subjects)) {
				subjects = j.subjects as Subject[];
				subjectsLoaded = true;
			}
		} catch {
			// csendben
		}
	}

	$effect(() => {
		if (sheet === 'create') ensureSubjects();
	});

	let joinCode = $state('');
	let joining = $state(false);
	let joinError = $state<string | null>(null);

	// Gépelés közben azonnal nagybetűsít (a kódok nagybetűsek).
	$effect(() => {
		const upper = joinCode.toUpperCase();
		if (upper !== joinCode) joinCode = upper;
	});

	function roomMeta(room: Room): string {
		const parts: string[] = [];
		if (room.subject) parts.push(room.subject);
		const teacher = room.teacher_name ?? (teacherMode ? (auth.user?.name ?? '') : '');
		if (teacher) parts.push(teacher);
		parts.push(`${room.member_count ?? 0} fő`);
		return parts.join(' - ');
	}

	function openPlus() {
		sheet = teacherMode ? 'choice' : 'join';
	}

	function closeSheet() {
		sheet = null;
		createError = null;
		joinError = null;
	}

	async function createRoom(e: SubmitEvent) {
		e.preventDefault();
		if (creating) return;
		createError = null;
		creating = true;
		try {
			const res = await fetch('/api/classrooms', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: roomName,
					subject: subjects.find((s) => s.id === roomSubjectId)?.title ?? ''
				})
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				createError = j.error ?? 'Nem sikerült létrehozni.';
				return;
			}
			teaching = [{ ...j.classroom, member_count: 0 }, ...teaching];
			roomName = '';
			roomSubjectId = '';
			sheet = null;
			toast.success('Osztály létrehozva', 'A kódot a beállításokban találod.');
		} catch {
			createError = 'Hálózati hiba. Próbáld újra!';
		} finally {
			creating = false;
		}
	}

	async function joinRoom(e: SubmitEvent) {
		e.preventDefault();
		if (joining) return;
		joinError = null;
		joining = true;
		try {
			const res = await fetch('/api/classrooms/join', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code: joinCode })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				joinError = j.error ?? 'Nem sikerült csatlakozni.';
				return;
			}
			joinCode = '';
			sheet = null;
			toast.success('Csatlakoztál', j.name ?? '');
			const list = await fetch('/api/classrooms').then((r) => r.json().catch(() => ({})));
			if (list.joined) joined = list.joined;
			if (list.teaching) teaching = list.teaching;
		} catch {
			joinError = 'Hálózati hiba. Próbáld újra!';
		} finally {
			joining = false;
		}
	}

	const tile =
		'grid size-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-white';
</script>

<svelte:head>
	<title>Tanterem | Leardy</title>
	<meta name="description" content="Osztályok, feladatok és dolgozatok." />
</svelte:head>

<div class="flex items-start justify-between gap-3">
	<h1 class="font-display mt-1 text-[24px] leading-tight font-extrabold tracking-tight text-ink-900 sm:text-[28px] dark:text-white">
		Tanterem
	</h1>
	<IconButton ariaLabel="Új osztály vagy csatlakozás" size={46} onclick={openPlus}>
		<Plus size={22} />
	</IconButton>
</div>

{#if teacherMode && teaching.length > 0}
	<div class="mt-2 grid gap-2.5">
		{#each teaching as room (room.id)}
			<Card href="/tanterem/{room.id}">
				<div class="flex items-start gap-3">
					<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
						<Users size={20} />
					</span>
					<div class="min-w-0 flex-1">
						<p class="truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{room.name}</p>
						<p class="truncate text-[13px] text-stone-500 dark:text-stone-400">{roomMeta(room)}</p>
					</div>
				</div>
			</Card>
		{/each}
	</div>
{/if}

{#if joined.length > 0 || !teacherMode}
	{#if teacherMode}
		<h2 class="mt-4 px-1 text-[15px] font-extrabold text-ink-900 dark:text-white">
			Csatlakozott osztályok
		</h2>
	{/if}
	<div class="mt-2 grid gap-2.5">
		{#if joined.length === 0}
			<EmptyState
				title="Még nem csatlakoztál osztályhoz"
				description="Kérd el a tanárodtól a 6 karakteres kódot, majd koppints fent a + gombra."
			/>
		{:else}
			{#each joined as room (room.id)}
				<Card href="/tanterem/{room.id}">
					<div class="flex items-start gap-3">
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
							<Users size={20} />
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{room.name}</p>
							<p class="truncate text-[13px] text-stone-500 dark:text-stone-400">{roomMeta(room)}</p>
						</div>
					</div>
				</Card>
			{/each}
		{/if}
	</div>
{/if}

{#if teacherMode && teaching.length === 0 && joined.length === 0}
	<div class="mt-4">
		<EmptyState
			title="Még nincs osztályod"
			description="Hozd létre az elsőt a + gombbal, majd oszd meg a kódot a diákokkal."
		/>
	</div>
{/if}

<Drawer open={sheet === 'choice'} label="Választás" title="Mit szeretnél?" onClose={closeSheet}>
	<div class="mt-3 grid gap-2.5">
		<button
			type="button"
			onclick={() => (sheet = 'create')}
			class="flex w-full items-center gap-3.5 rounded-2xl border border-stone-200 p-4 text-left transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:hover:bg-white/5"
		>
			<span class={tile}><Sparkles size={22} /></span>
			<span class="min-w-0 flex-1">
				<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Új osztály létrehozása</span>
				<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">Saját osztály a diákjaidnak</span>
			</span>
		</button>
		<button
			type="button"
			onclick={() => (sheet = 'join')}
			class="flex w-full items-center gap-3.5 rounded-2xl border border-stone-200 p-4 text-left transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:hover:bg-white/5"
		>
			<span class={tile}><KeyRound size={22} /></span>
			<span class="min-w-0 flex-1">
				<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Csatlakozás kóddal</span>
				<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">Más tanárának osztályához</span>
			</span>
		</button>
	</div>
</Drawer>

<Drawer open={sheet === 'join'} label="Csatlakozás kóddal" title="Csatlakozás kóddal" onClose={closeSheet}>
	<form onsubmit={joinRoom} class="mt-3 grid gap-3.5" novalidate>
		<Input
			label="Osztály kódja"
			required
			placeholder="pl. KX7Q2M"
			bind:value={joinCode}
			disabled={joining}
			error={joinError}
		/>
		<Button type="submit" block busy={joining} disabled={joinCode.trim().length < 4}>
			{joining ? 'Csatlakozás…' : 'Csatlakozom'}
		</Button>
	</form>
</Drawer>

<Drawer open={sheet === 'create'} label="Új osztály" title="Új osztály" onClose={closeSheet}>
	<form onsubmit={createRoom} class="mt-3 grid gap-3.5" novalidate>
		<Input label="Osztály neve" required placeholder="pl. 9.A angol csoport" bind:value={roomName} disabled={creating} error={createError} />
		<div>
			<SubjectPicker {subjects} bind:value={roomSubjectId} disabled={creating} />
		</div>
		<Button type="submit" block busy={creating} disabled={roomName.trim().length < 3}>
			{creating ? 'Létrehozás…' : 'Osztály létrehozása'}
		</Button>
	</form>
</Drawer>
