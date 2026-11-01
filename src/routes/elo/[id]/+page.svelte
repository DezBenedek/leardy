<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { createBackNavigation } from '$lib/platform/back-navigation';
	import LivePlay from '$lib/components/LivePlay.svelte';
	import { auth } from '$lib/state/auth.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import type { QuizQuestion } from '$lib/curriculum/curriculum';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import type { PageData } from './$types';
	import type { LivePayload, LiveStatus } from './live-types';
	import { createQuestionStabilizer, mapRoom } from './live-mapping';
	import { liveUrl, readJson, socketUrl, type LiveAction } from './live-api';
	import LiveHeader from './LiveHeader.svelte';
	import LiveDraft from './LiveDraft.svelte';
	import LiveLobby from './LiveLobby.svelte';
	import LiveTeacherStage from './LiveTeacherStage.svelte';
	import LiveTeacherTable from './LiveTeacherTable.svelte';
	import LiveResult from './LiveResult.svelte';
	import StudentDetailDrawer from './StudentDetailDrawer.svelte';

	let { data }: { data: PageData } = $props();

	const goBack = createBackNavigation(() => resolve('/tanterem'));

	function getInitialRoom(): Record<string, unknown> {
		return ((data.room ?? {}) as Record<string, unknown>);
	}
	let room = $state<Record<string, unknown>>(getInitialRoom());

	const stableQuestions = createQuestionStabilizer();
	let user = $derived(auth.ready ? auth.user : data.user);
	let userId = $derived(user?.id ?? '');
	let userName = $derived(user?.name ?? 'Diák');
	let live = $derived<LivePayload>(mapRoom(room, userId, stableQuestions));
	let status = $derived<LiveStatus>(live.status);
	let title = $derived(live.title);
	let teacher = $derived(live.isTeacher);
	let playMode = $derived(live.playMode);
	let pacing = $derived(live.pacing);
	let questions = $derived<QuizQuestion[]>(live.questions);
	let qIndex = $derived(live.index);
	let current = $derived(questions[Math.min(Math.max(qIndex, 0), Math.max(questions.length - 1, 0))]);
	let participants = $derived(live.participants);
	let joined = $derived(live.joined);
	let busy = $state(false);
	let lastWsAt = $state(0);

	function applyState(next: unknown) {
		if (!next || typeof next !== 'object') return;
		const obj = next as Record<string, unknown>;
		if (obj.live && typeof obj.live === 'object') {
			room = { ...room, live: { ...((room.live as Record<string, unknown> | undefined) ?? {}), ...(obj.live as Record<string, unknown>) } };
			if (obj.session && typeof obj.session === 'object') room = { ...room, session: obj.session };
		} else if (obj.session && typeof obj.session === 'object') {
			room = { ...room, session: obj.session };
		} else {
			room = { ...room, live: { ...((room.live as Record<string, unknown> | undefined) ?? {}), ...obj } };
		}
		lastWsAt = Date.now();
	}

	async function refresh() {
		try {
			const res = await fetch(liveUrl(data.liveId));
			const j = await readJson(res);
			if (res.ok) applyState(j);
		} catch {
			// csendben: a következő körben újra próbáljuk
		}
	}

	async function post(action: LiveAction, body?: Record<string, unknown>) {
		const res = await fetch(liveUrl(data.liveId, action), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined
		});
		const j = await readJson(res);
		if (!res.ok) {
			toast.error('Nem sikerült', (j.error as string | undefined) ?? 'Próbáld újra!');
			return null;
		}
		await refresh();
		return j;
	}

	async function join() {
		if (busy) return;
		busy = true;
		try {
			await post('/join');
		} finally {
			busy = false;
		}
	}

	async function start() {
		if (busy) return;
		busy = true;
		try {
			await post('/start');
		} finally {
			busy = false;
		}
	}

	async function publish() {
		if (busy) return;
		busy = true;
		try {
			await post('/publish');
			toast.success('Élő dolgozat meghirdetve');
		} finally {
			busy = false;
		}
	}

	async function next() {
		if (busy) return;
		busy = true;
		try {
			if (qIndex >= questions.length - 1) {
				await post('/finish');
			} else {
				await post('/next');
			}
		} finally {
			busy = false;
		}
	}

	async function sendAnswer(qIdx: number, answer: string): Promise<boolean | null> {
		const j = await post('/answer', { questionIdx: qIdx, answer });
		return j && typeof j.ok === 'boolean' ? (j.ok as boolean) : null;
	}

	let teacherJoined = $state(false);
	let stopOpen = $state(false);
	let detailUserId = $state<string | null>(null);

	let detailEntry = $derived(live.details.find((d) => d.userId === detailUserId) ?? null);

	async function stop() {
		if (busy) return;
		busy = true;
		try {
			stopOpen = false;
			await post('/finish');
		} finally {
			busy = false;
		}
	}

	if (browser) {
		$effect(() => {
			const id = data.liveId;
			let socket: WebSocket | null = null;
			try {
				socket = new WebSocket(
					socketUrl(window.location.host, window.location.protocol, id, userId, userName, teacher)
				);
				socket.onmessage = (event) => {
					try {
						applyState(JSON.parse(String(event.data)));
					} catch {
						// sérült üzenet: a polling helyrehozza
					}
				};
				// A tanár nézőként csatlakozik: ez adja meg a tanári nézetet
				// akkor is, ha a socket valamiért nem jönne létre.
				if (teacher && !teacherJoined) {
					teacherJoined = true;
					void post('/join');
				}
			} catch {
				socket = null;
			}
			const timer = setInterval(() => {
				if (Date.now() - lastWsAt > 5000) void refresh();
			}, 2500);
			return () => {
				clearInterval(timer);
				try {
					socket?.close();
				} catch {
					// már zárva
				}
			};
		});
	}

	let ranking = $derived(
		[...live.ranking].sort((a, b) => b.score - a.score)
	);
	let myScore = $derived(live.myScore);
	let myTotal = $derived(live.myTotal);
	let wizardHref = $derived(
		live.classroomId ? resolve('/tanterem/[id]/elo/uj', { id: live.classroomId }) : '/tanterem'
	);
</script>

<svelte:head>
	<title>{title} | Élő dolgozat | Leardy</title>
</svelte:head>

<LiveHeader {title} {status} onBack={goBack} />

{#if live.isDraft}
	<LiveDraft
		{title}
		questionsCount={questions.length}
		{playMode}
		{pacing}
		{teacher}
		{busy}
		onPublish={publish}
	/>
{:else if status === 'lobby'}
	<LiveLobby
		{title}
		{participants}
		{teacher}
		{joined}
		{busy}
		{wizardHref}
		onStart={start}
		onJoin={join}
		onWithdraw={() => (stopOpen = true)}
	/>
{:else if status === 'live'}
	{#if teacher}
		{#if playMode === 'stage' && current}
			<LiveTeacherStage
				{current}
				{qIndex}
				questionsLength={questions.length}
				dist={live.dist}
				{participants}
				{busy}
				onNext={next}
				onStop={() => (stopOpen = true)}
				onDetail={(id) => (detailUserId = id)}
			/>
		{:else}
			<LiveTeacherTable
				{participants}
				questionsLength={questions.length}
				{pacing}
				{qIndex}
				{busy}
				onNext={next}
				onStop={() => (stopOpen = true)}
				onDetail={(id) => (detailUserId = id)}
			/>
		{/if}
	{:else}
		<div class="anim-rise mt-4" style="--d:0ms">
			<LivePlay
				{questions}
				stageMode={playMode === 'stage'}
				currentIndex={pacing === 'synced' ? qIndex : null}
				locked={live.locked}
				onAnswer={sendAnswer}
			/>
		</div>
	{/if}
{:else}
	<LiveResult
		{title}
		{teacher}
		{myScore}
		{myTotal}
		{ranking}
		{wizardHref}
		onDetail={(id) => (detailUserId = id)}
	/>
{/if}

<ConfirmDialog
	open={stopOpen}
	title="Élő dolgozat leállítása"
	description="A dolgozat véget ér, az eddigi válaszok mentésre kerülnek, és mindenkinél megjelenik a végeredmény."
	confirmLabel="Leállítás"
	busy={busy}
	onClose={() => (stopOpen = false)}
	onConfirm={stop}
/>

<StudentDetailDrawer
	open={teacher && detailUserId !== null}
	entry={detailEntry}
	{questions}
	onClose={() => (detailUserId = null)}
/>
