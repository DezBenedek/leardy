<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { createBackNavigation } from '$lib/back-navigation';
	import LivePlay from '$lib/components/LivePlay.svelte';
	import { auth } from '$lib/auth.svelte';
	import { toast } from '$lib/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import type { QuizQuestion } from '$lib/curriculum';
	import { ArrowLeft, ArrowRight, ChevronRight, Circle as CircleIcon, CircleCheck, CircleX, Diamond, Radio, Square, Triangle, Trophy, Users } from '@lucide/svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** Kahoot-színek és formák a táblához és a diákválaszokhoz. */
	const kahootTiles = [
		{ bg: '#E21B3C', Icon: Triangle },
		{ bg: '#1368CE', Icon: Diamond },
		{ bg: '#D89E00', Icon: CircleIcon },
		{ bg: '#26890C', Icon: Square }
	];

	type LiveStatus = 'lobby' | 'live' | 'done';
	interface LiveParticipant {
		id: string;
		name: string;
		answered?: number;
		total?: number;
		correct?: number;
		score?: number;
	}
	interface LiveAnswerDetail {
		index: number;
		answer: string;
		ok: boolean;
	}
	interface LiveStudentDetail {
		userId: string;
		name: string;
		answers: LiveAnswerDetail[];
	}
	interface LivePayload {
		status: LiveStatus;
		isDraft: boolean;
		title: string;
		classroomId: string;
		isTeacher: boolean;
		playMode: 'solo' | 'stage';
		pacing: 'self' | 'synced';
		questions: QuizQuestion[];
		index: number;
		locked: boolean;
		participants: LiveParticipant[];
		joined: boolean;
		myScore: number;
		myTotal: number;
		ranking: { name: string; score: number; userId?: string }[];
		/** Tanári nézetben: kérdésindex -> válasz -> darab (csak diákok). */
		dist: Record<string, Record<string, number>>;
		/** Tanári nézetben: diákonként a leadott válaszok. */
		details: LiveStudentDetail[];
	}

	const goBack = createBackNavigation(() => resolve('/tanterem'));

	/* Nyers szoba (D1 session + DO snapshot vagy lapos DO üzenet) egységes nézetté alakítása. */
	function mapRoom(room: Record<string, unknown>, uid: string): LivePayload {
		const raw = room && typeof room === 'object' ? room : {};
		const hasSession = raw.session && typeof raw.session === 'object';
		const session = (hasSession ? raw.session : {}) as Record<string, unknown>;
		const snapRaw = raw.live && typeof raw.live === 'object' ? raw.live : hasSession ? {} : raw;
		const snap = (snapRaw && typeof snapRaw === 'object' ? snapRaw : {}) as Record<string, unknown>;
		const status = (snap.status === 'live' || snap.status === 'done' ? snap.status : session.status === 'live' || session.status === 'done' ? session.status : 'lobby') as LiveStatus;
		const questions = (Array.isArray(snap.questions) ? snap.questions : []) as QuizQuestion[];
		const total = typeof snap.total === 'number' && snap.total > 0 ? snap.total : questions.length;
		const teacherId = typeof session.teacher_id === 'string' ? session.teacher_id : '';
		const isTeacher = teacherId ? teacherId === uid : snap.isTeacher === true;
		const parts = (Array.isArray(snap.participants) ? snap.participants : []) as Record<string, unknown>[];
		const scores = (Array.isArray(snap.scores) ? snap.scores : []) as Record<string, unknown>[];
		const scoreBy = new Map(scores.map((s) => [String(s.userId ?? ''), s]));
		const participants: LiveParticipant[] = parts.map((p) => {
			const id = String(p.id ?? '');
			const s = scoreBy.get(id);
			const answered = typeof s?.answered === 'number' ? s.answered : 0;
			const correct = typeof s?.score === 'number' ? s.score : 0;
			return { id, name: String(p.name ?? 'Diák'), answered, total, correct, score: correct };
		});
		const my = (snap.myAnswers && typeof snap.myAnswers === 'object' ? snap.myAnswers : {}) as Record<string, { ok?: boolean }>;
		const myKeys = Object.keys(my);
		const myScore = (() => {
			const own = scoreBy.get(uid);
			if (own && typeof own.score === 'number') return own.score;
			return myKeys.filter((k) => my[k]?.ok).length;
		})();
		const ranking = (scores.length > 0 ? scores : parts).map((r) => ({
			name: String((r as Record<string, unknown>).name ?? 'Diák'),
			score: Number((r as Record<string, unknown>).score ?? 0) || 0,
			userId: String((r as Record<string, unknown>).userId ?? (r as Record<string, unknown>).id ?? '')
		}));
		return {
			status,
			isDraft: String(session.status ?? '') === 'draft',
			title: String(session.title ?? snap.title ?? 'Élő dolgozat'),
			classroomId: String(session.classroom_id ?? snap.classroomId ?? ''),
			isTeacher,
			playMode: snap.playMode === 'stage' ? 'stage' : 'solo',
			pacing: snap.pacing === 'synced' ? 'synced' : 'self',
			questions: stableQuestions(questions),
			index: typeof snap.currentIndex === 'number' ? snap.currentIndex : typeof snap.index === 'number' ? snap.index : 0,
			locked: status !== 'live',
			participants,
			joined: participants.some((p) => p.id === uid),
			myScore,
			myTotal: total,
			ranking,
			dist: (snap.dist && typeof snap.dist === 'object' ? snap.dist : {}) as Record<string, Record<string, number>>,
			details: (Array.isArray(snap.details) ? snap.details : []) as LiveStudentDetail[]
		};
	}

	function getInitialRoom(): Record<string, unknown> {
		return ((data.room ?? {}) as Record<string, unknown>);
	}
	let room = $state<Record<string, unknown>>(getInitialRoom());

	/* Kérdéslista stabilitása: a 2,5 mp-es polling és a socket-üzenetek
	   minden körben új tömböt hoznának, amitől a diákoldali játék
	   állapota (gépelés, sorrend, keverés) időnként újragenerálódna.
	   Ha a tartalom bájtpontosan egyezik, a régi referenciát adjuk vissza,
	   így semmi nem mozdul véletlenül. */
	let lastQuestions: QuizQuestion[] = [];
	function stableQuestions(list: QuizQuestion[]): QuizQuestion[] {
		if (
			list.length === lastQuestions.length &&
			list.every((q, i) => {
				const p = lastQuestions[i];
				return p && q.id === p.id && q.question_text === p.question_text &&
					JSON.stringify(q.options ?? []) === JSON.stringify(p.options ?? []) &&
					JSON.stringify(q.pairs ?? []) === JSON.stringify(p.pairs ?? []) &&
					(q.type ?? '') === (p.type ?? '');
			})
		) {
			return lastQuestions;
		}
		lastQuestions = list;
		return list;
	}
	let user = $derived(auth.ready ? auth.user : data.user);
	let userId = $derived(user?.id ?? '');
	let userName = $derived(user?.name ?? 'Diák');
	let live = $derived<LivePayload>(mapRoom(room, userId));
	let status = $derived<LiveStatus>(live.status);
	let title = $derived(live.title);
	let teacher = $derived(live.isTeacher);
	let playMode = $derived(live.playMode);
	let pacing = $derived(live.pacing);
	let questions = $derived<QuizQuestion[]>(live.questions);
	let qIndex = $derived(live.index);
	let current = $derived(questions[Math.min(Math.max(qIndex, 0), Math.max(questions.length - 1, 0))]);
	let participants = $derived<LiveParticipant[]>(live.participants);
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
			const res = await fetch(`/api/live/${encodeURIComponent(data.liveId)}`);
			const j = await res.json().catch(() => ({}));
			if (res.ok) applyState(j);
		} catch {
			// csendben: a következő körben újra próbáljuk
		}
	}

	async function post(action: '' | '/join' | '/start' | '/next' | '/answer' | '/finish' | '/publish', body?: Record<string, unknown>) {
		const res = await fetch(`/api/live/${encodeURIComponent(data.liveId)}${action}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined
		});
		const j = await res.json().catch(() => ({}));
		if (!res.ok) {
			toast.error('Nem sikerült', j.error ?? 'Próbáld újra!');
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
		return j && typeof j.ok === 'boolean' ? j.ok : null;
	}

	let teacherJoined = $state(false);
	let stopOpen = $state(false);
	let detailUserId = $state<string | null>(null);

	let detailEntry = $derived(live.details.find((d) => d.userId === detailUserId) ?? null);

	/** Válasz szépítése a részletezőbe: JSON tömb helyett olvasható felsorolás. */
	function prettyAnswer(questionIdx: number, raw: string): string {
		const text = String(raw ?? '');
		if (!text) return 'Nincs válasz';
		try {
			const parsed: unknown = JSON.parse(text);
			if (Array.isArray(parsed)) {
				const items = parsed.map((x) => String(x));
				const q = questions[questionIdx];
				return items.join(q?.type === 'order' ? ' → ' : ' · ');
			}
		} catch {
			// nem JSON: nyers szöveg
		}
		return text;
	}

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
			const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			let socket: WebSocket | null = null;
			try {
				socket = new WebSocket(
					`${wsProtocol}//${window.location.host}/api/live/socket/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}&name=${encodeURIComponent(userName)}&role=${teacher ? 'teacher' : 'student'}`
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

	function initials(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return '?';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	}

	const avatarTones = [
		'bg-brand-500/10 text-brand-600 dark:text-brand-400',
		'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
		'bg-amber-500/10 text-amber-600 dark:text-amber-300',
		'bg-rose-500/10 text-rose-600 dark:text-rose-300',
		'bg-sky-500/10 text-sky-600 dark:text-sky-300'
	];

	function pctOf(p: LiveParticipant): number {
		const total = p.total ?? questions.length;
		if (!total || total <= 0) return 0;
		return Math.round(((p.correct ?? p.score ?? 0) / total) * 100);
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

<div class="flex items-center gap-2 px-1">
	<IconButton ariaLabel="Vissza" size={44} onclick={goBack}>
		<ArrowLeft size={21} />
	</IconButton>
	<div class="min-w-0 flex-1">
		<h1 class="font-display truncate text-[26px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
			{title}
		</h1>
	</div>
	{#if status === 'live'}
		<span class="flex shrink-0 items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1.5 text-[12px] font-extrabold text-red-600 dark:text-red-300">
			<span class="size-2 animate-pulse rounded-full bg-red-500" aria-hidden="true"></span> Élő
		</span>
	{:else if status === 'lobby'}
		<span class="shrink-0 rounded-full bg-stone-100 px-3 py-1.5 text-[12px] font-extrabold text-stone-500 dark:bg-white/10 dark:text-stone-300">
			Váró
		</span>
	{:else}
		<span class="shrink-0 rounded-full bg-stone-100 px-3 py-1.5 text-[12px] font-extrabold text-stone-500 dark:bg-white/10 dark:text-stone-300">
			Vége
		</span>
	{/if}
</div>

{#if live.isDraft}
	<div class="mt-4 grid gap-2.5">
		<Card tone="brand">
			<div class="anim-rise flex flex-col items-center py-4 text-center" style="--d:0ms">
				<p class="text-[11px] font-extrabold tracking-[0.14em] text-white/70 uppercase">Piszkozat</p>
				<h2 class="font-display mt-1 text-[22px] font-extrabold tracking-tight text-white">{title}</h2>
				<p class="mt-1 text-[13px] font-semibold text-white/80 tabular-nums">
					{questions.length} kérdés · {playMode === 'stage' ? 'Tantermi' : pacing === 'synced' ? 'Együtt' : 'Saját tempó'}
				</p>
			</div>
		</Card>
		{#if teacher}
			<div class="anim-rise" style="--d:60ms">
				<Button size="lg" block disabled={busy} onclick={publish}>Meghirdetés</Button>
			</div>
		{:else}
			<div class="anim-rise" style="--d:60ms">
				<Card>
					<p class="text-center text-[14px] font-bold text-ink-900 dark:text-white">
						A tanár még nem hirdette meg ezt a dolgozatot.
					</p>
				</Card>
			</div>
		{/if}
	</div>
{:else if status === 'lobby'}
	<div class="mt-4 grid gap-2.5">
		<Card tone="brand">
			<div class="anim-rise flex flex-col items-center py-4 text-center" style="--d:0ms">
				<span class="relative grid size-14 place-items-center rounded-full bg-white/15" aria-hidden="true">
					<span class="absolute inset-0 animate-ping rounded-full bg-white/20"></span>
					<Radio size={26} class="relative text-white" />
				</span>
				<p class="mt-3 text-[11px] font-extrabold tracking-[0.14em] text-white/70 uppercase">Élő</p>
				<h2 class="font-display mt-1 text-[22px] font-extrabold tracking-tight text-white">{title}</h2>
				<p class="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-white/80">
					<Users size={15} /> {participants.length} csatlakozott diák
				</p>
			</div>
		</Card>

		<Card>
			<div class="anim-rise" style="--d:60ms">
				<h3 class="text-[15px] font-extrabold text-ink-900 dark:text-white">Résztvevők</h3>
				{#if participants.length === 0}
					<p class="mt-1 text-[13px] font-medium text-stone-500 dark:text-stone-400">
						Még senki sem csatlakozott.
					</p>
				{:else}
					<ul class="mt-2 grid gap-1.5">
						{#each participants as p, i (p.id)}
							<li class="anim-rise flex items-center gap-2.5" style="--d:{80 + i * 40}ms">
								<span class={['grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-extrabold', avatarTones[i % avatarTones.length]]} aria-hidden="true">
									{initials(p.name)}
								</span>
								<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
									{p.name}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</Card>

		{#if teacher}
			<div class="anim-rise grid gap-2" style="--d:120ms">
				<Button size="lg" block disabled={busy} onclick={start}>Indítás</Button>
				<Button variant="ghost" size="md" block onclick={() => (stopOpen = true)}>Meghirdetés visszavonása</Button>
				<Button variant="ghost" size="md" block href={wizardHref}>Új meghirdetése</Button>
			</div>
		{:else if joined}
			<div class="anim-rise" style="--d:120ms">
				<Card>
					<p class="text-center text-[14px] font-bold text-ink-900 dark:text-white">
						Bent vagy. Várd meg a tanár indítását!
					</p>
				</Card>
			</div>
		{:else}
			<div class="anim-rise" style="--d:120ms">
				<Button size="lg" block disabled={busy} onclick={join}>Csatlakoztam</Button>
			</div>
		{/if}
	</div>
{:else if status === 'live'}
	{#if teacher}
		<div class="mt-4 grid gap-2.5">
			{#if playMode === 'stage' && current}
				{@const choiceBoard = (current.type === 'choice' || current.type === 'tf') && current.options.length > 0}
				{@const qDist = live.dist?.[String(qIndex)] ?? {}}
				{@const qVotes = current.options.map((o) => qDist[o] ?? 0)}
				{@const qTotal = qVotes.reduce((a, b) => a + b, 0)}
				{@const qMax = Math.max(1, ...qVotes)}
				<!-- 1. rész: a kérdés -->
				<Card>
					<div class="anim-rise py-2 text-center" style="--d:0ms">
						<p class="flex items-center justify-center gap-1.5 text-[11px] font-extrabold tracking-[0.14em] text-red-500 uppercase">
							<span class="size-1.5 animate-pulse rounded-full bg-red-500" aria-hidden="true"></span>
							Kérdés {qIndex + 1}/{questions.length}
						</p>
						<h2 class="font-display mx-auto mt-2 max-w-3xl text-[28px] leading-tight font-extrabold tracking-tight text-balance text-ink-900 sm:text-[36px] dark:text-white">
							{current.question_text}
						</h2>
					</div>
				</Card>
				<!-- 2. rész: a válaszok -->
				<Card>
					<div class="anim-rise" style="--d:60ms">
						<p class="text-[11px] font-extrabold tracking-[0.14em] text-stone-400 uppercase tabular-nums dark:text-stone-500">
							Válaszok · {qTotal} beérkezett
						</p>
						{#if choiceBoard}
							<ul class="mt-3 grid gap-2 sm:grid-cols-2">
								{#each current.options as option, i (option)}
									{@const tile = kahootTiles[i % kahootTiles.length]}
									{@const votes = qVotes[i] ?? 0}
									<li class="overflow-hidden rounded-2xl text-white shadow-lg" style="background:{tile.bg}">
										<div class="flex min-h-[76px] items-center gap-3 px-4 py-3.5">
											<tile.Icon size={28} fill="currentColor" class="shrink-0" aria-hidden="true" />
											<span class="min-w-0 flex-1 text-[16px] leading-snug font-extrabold break-words">
												{option}
											</span>
											<span class="shrink-0 rounded-full bg-black/25 px-3 py-1 text-[15px] font-extrabold tabular-nums" aria-label="{votes} szavazat">
												{votes}
											</span>
										</div>
										<div class="h-1.5 bg-black/20" aria-hidden="true">
											<div class="h-full bg-white/80 transition-all duration-300 motion-reduce:transition-none" style="width: {Math.round((votes / qMax) * 100)}%"></div>
										</div>
									</li>
								{/each}
							</ul>
						{:else}
							{#if current.options.length > 0}
								<ul class="mt-3 grid gap-2">
									{#each current.options as option (option)}
										{@const votes = qDist[option] ?? 0}
										<li class="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
											<span class="min-w-0 flex-1 text-[15px] font-semibold break-words text-ink-900 dark:text-white">
												{option}
											</span>
											<span class="shrink-0 rounded-full bg-stone-200 px-3 py-1 text-[13px] font-extrabold tabular-nums dark:bg-white/10">
												{votes}
											</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="mt-3 text-center text-[15px] font-bold text-ink-900 tabular-nums dark:text-white">
									{qTotal} diák válaszolt
								</p>
							{/if}
						{/if}
						<div class="mt-4">
							<Button size="lg" block disabled={busy} onclick={next}>
								{qIndex >= questions.length - 1 ? 'Lezárás' : 'Tovább'} <ArrowRight size={17} />
							</Button>
						</div>
					</div>
				</Card>
				<Card>
					<div class="anim-rise" style="--d:120ms">
						<h3 class="text-[15px] font-extrabold text-ink-900 dark:text-white">
							Résztvevők · <span class="tabular-nums">{participants.length}</span>
						</h3>
						{#if participants.length === 0}
							<p class="mt-1 text-[13px] font-medium text-stone-500 dark:text-stone-400">
								Még senki sem csatlakozott. Kattints egy névre a válaszaiért.
							</p>
						{:else}
							<ul class="mt-2 grid gap-1.5">
								{#each participants as p, i (p.id)}
									<li>
										<button
											type="button"
											onclick={() => (detailUserId = p.id)}
											class="anim-rise flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-stone-100 active:scale-[0.99] motion-reduce:transition-none dark:hover:bg-white/5"
											style="--d:{140 + i * 40}ms"
										>
											<span class={['grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-extrabold', avatarTones[i % avatarTones.length]]} aria-hidden="true">
												{initials(p.name)}
											</span>
											<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
												{p.name}
											</span>
											<span class="shrink-0 text-[12px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
												{p.answered ?? 0}/{questions.length}
											</span>
											<ChevronRight size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</Card>
				<div class="anim-rise" style="--d:160ms">
					<Button variant="ghost" size="md" block onclick={() => (stopOpen = true)}>Élő dolgozat leállítása</Button>
				</div>
			{:else}
				<Card>
					<div class="anim-rise overflow-x-auto" style="--d:0ms">
						<table class="w-full min-w-[420px] text-left text-[13px]">
							<thead>
								<tr class="text-[11px] font-extrabold tracking-wider text-stone-400 uppercase dark:text-stone-500">
									<th class="py-2 pr-2 font-extrabold">Név</th>
									<th class="px-2 py-2 font-extrabold">Hol tart</th>
									<th class="px-2 py-2 font-extrabold">Jó válasz</th>
									<th class="py-2 pl-2 font-extrabold">Haladás</th>
								</tr>
							</thead>
							<tbody>
								{#each participants as p, i (p.id)}
									{@const done = p.answered ?? 0}
									<tr
										onclick={() => (detailUserId = p.id)}
										class="anim-rise cursor-pointer border-t border-stone-100 transition hover:bg-stone-50 active:scale-[0.99] motion-reduce:transition-none dark:border-white/5 dark:hover:bg-white/5"
										style="--d:{60 + i * 40}ms"
									>
										<td class="py-2 pr-2 font-bold text-ink-900 dark:text-white">{p.name}</td>
										<td class="px-2 py-2 font-semibold text-stone-500 tabular-nums dark:text-stone-400">
											{done}/{questions.length}
										</td>
										<td class="px-2 py-2 font-bold text-ink-900 tabular-nums dark:text-white">{pctOf(p)}%</td>
										<td class="py-2 pl-2">
											<div class="h-2 w-24 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10">
												<div
													class="h-full rounded-full bg-brand-500 transition-all duration-300 motion-reduce:transition-none"
													style="width: {Math.min(100, Math.round((done / Math.max(questions.length, 1)) * 100))}%"
												></div>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
						{#if participants.length === 0}
							<p class="py-2 text-[13px] font-medium text-stone-500 dark:text-stone-400">
								Még nincs csatlakozott diák.
							</p>
						{/if}
					</div>
				</Card>
				{#if pacing === 'synced'}
					<div class="anim-rise" style="--d:120ms">
						<Button size="lg" block disabled={busy} onclick={next}>
							{qIndex >= questions.length - 1 ? 'Lezárás' : 'Tovább'} <ArrowRight size={17} />
						</Button>
					</div>
				{/if}
				<div class="anim-rise" style="--d:160ms">
					<Button variant="ghost" size="md" block onclick={() => (stopOpen = true)}>Élő dolgozat leállítása</Button>
				</div>
			{/if}
		</div>
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
	<div class="mt-4 grid gap-2.5">
		<Card tone="brand">
			<div class="anim-rise flex flex-col items-center py-4 text-center" style="--d:0ms">
				<span class="grid size-14 place-items-center rounded-full bg-white/15" aria-hidden="true">
					<Trophy size={26} class="text-white" />
				</span>
				<p class="mt-3 text-[11px] font-extrabold tracking-[0.14em] text-white/70 uppercase">Végeredmény</p>
				<h2 class="font-display mt-1 text-[22px] font-extrabold tracking-tight text-white">{title}</h2>
				{#if !teacher}
					<p class="mt-1 text-[15px] font-bold text-white">
						Saját pont: <span class="tabular-nums">{myScore}/{myTotal}</span>
					</p>
				{/if}
			</div>
		</Card>

		<Card>
			<div class="anim-rise" style="--d:60ms">
				<h3 class="text-[15px] font-extrabold text-ink-900 dark:text-white">Rangsor</h3>
				{#if ranking.length === 0}
					<p class="mt-1 text-[13px] font-medium text-stone-500 dark:text-stone-400">
						Nincs eredmény.
					</p>
				{:else}
					<ol class="mt-2 grid gap-1.5">
						{#each ranking as row, i (row.userId + ':' + i)}
							<li>
								{#if teacher}
									<button
										type="button"
										onclick={() => (detailUserId = row.userId ?? null)}
										class="anim-rise flex w-full items-center gap-2.5 rounded-xl bg-stone-100 px-3 py-2 text-left transition hover:bg-stone-200/70 active:scale-[0.99] motion-reduce:transition-none dark:bg-white/5 dark:hover:bg-white/10"
										style="--d:{100 + i * 40}ms"
									>
										<span class="w-6 shrink-0 text-center text-[13px] font-extrabold text-stone-400 tabular-nums dark:text-stone-500">
											{i + 1}.
										</span>
										{#if i === 0}
											<Trophy size={16} class="shrink-0 text-amber-500" aria-hidden="true" />
										{/if}
										<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
											{row.name}
										</span>
										<span class="shrink-0 text-[14px] font-extrabold text-ink-900 tabular-nums dark:text-white">
											{row.score}
										</span>
										<ChevronRight size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
									</button>
								{:else}
									<div class="anim-rise flex items-center gap-2.5 rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/5" style="--d:{100 + i * 40}ms">
										<span class="w-6 shrink-0 text-center text-[13px] font-extrabold text-stone-400 tabular-nums dark:text-stone-500">
											{i + 1}.
										</span>
										{#if i === 0}
											<Trophy size={16} class="shrink-0 text-amber-500" aria-hidden="true" />
										{/if}
										<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
											{row.name}
										</span>
										<span class="shrink-0 text-[14px] font-extrabold text-ink-900 tabular-nums dark:text-white">
											{row.score}
										</span>
									</div>
								{/if}
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		</Card>

		{#if teacher}
			<div class="anim-rise" style="--d:120ms">
				<Button size="lg" block href={wizardHref}>Újra-meghirdetés</Button>
			</div>
		{:else}
			<div class="anim-rise" style="--d:120ms">
				<Button variant="tint" size="lg" block onclick={() => void goto('/tanterem')}>Vissza az osztályokhoz</Button>
			</div>
		{/if}
	</div>
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

<Drawer
	open={teacher && detailUserId !== null}
	label="Diák részletei"
	title={detailEntry?.name ?? 'Diák'}
	onClose={() => (detailUserId = null)}
>
	{#if detailEntry}
		{@const detailOk = detailEntry.answers.filter((a) => a.ok).length}
		<p class="text-[13px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
			Sikeres: {detailOk}/{questions.length} · Leadva: {detailEntry.answers.length}
		</p>
		<div class="mt-3 grid gap-2">
			{#each questions as q, qi (q.id)}
				{@const a = detailEntry.answers.find((x) => x.index === qi)}
				<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
					<p class="text-[12px] font-extrabold tracking-wider text-stone-400 uppercase tabular-nums dark:text-stone-500">
						{qi + 1}. kérdés
					</p>
					<p class="mt-1 text-[15px] font-extrabold text-ink-900 dark:text-white">{q.question_text}</p>
					{#if a}
						<p class={['mt-2 flex items-start gap-1.5 text-[14px] font-bold', a.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300']}>
							{#if a.ok}
								<CircleCheck size={17} class="mt-0.5 shrink-0" aria-hidden="true" />
							{:else}
								<CircleX size={17} class="mt-0.5 shrink-0" aria-hidden="true" />
							{/if}
							<span class="min-w-0 break-words">Válasza: {prettyAnswer(qi, a.answer)}</span>
						</p>
						{#if !a.ok}
							<p class="mt-1 pl-6 text-[13px] font-semibold text-stone-500 break-words dark:text-stone-400">
								Helyes: {prettyAnswer(qi, q.correct_answer)}
							</p>
						{/if}
					{:else}
						<p class="mt-2 text-[14px] font-semibold text-stone-400 dark:text-stone-500">Még nem válaszolt.</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</Drawer>
