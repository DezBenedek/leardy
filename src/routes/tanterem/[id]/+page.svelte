<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ArrowLeft,
		Bell,
		ClipboardList,
		FileText,
		Link2,
		Megaphone,
		Plus,
		Trash2,
		X
	} from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { get as cacheGet, invalidate, peek } from '$lib/cache';
	import Drawer from '$lib/components/Drawer.svelte';
	import {
		studyApi,
		type AssessmentRow,
		type AssignmentRow,
		type AttachmentKind,
		type Classroom,
		type LessonRow,
		type MessageRow,
		type MyLesson,
		type MyTopic,
		type Topic
	} from '$lib/study';

	let { params } = $props();

	let room = $state<Classroom | null>(null);
	let assigns = $state<AssignmentRow[]>([]);
	let members = $state<{ name: string }[]>([]);
	let messages = $state<MessageRow[]>([]);
	let err = $state<string | null>(null);

	let isTeacher = $derived((auth.user?.role ?? 'student') === 'teacher');
	let canPost = $derived(isTeacher && room?.mine === 1);
	let openMsg = $state<string | null>(null);

	// + menü + drawerek
	let plusOpen = $state(false);
	let drawer = $state<'message' | 'task' | 'exam' | null>(null);
	let busy = $state(false);

	function openDrawer(kind: 'message' | 'task' | 'exam') {
		plusOpen = false;
		drawer = kind;
		if (kind === 'message' || kind === 'task') void loadLib();
		if (kind === 'exam') void loadExamLib();
	}

	// ---------- Közös könyvtár a csatolmányokhoz ----------
	let libTopics = $state<Topic[]>([]);
	let libDecks = $state<MyTopic[]>([]);
	let libDeckLessons = $state<MyLesson[]>([]);
	let libQuizzes = $state<AssessmentRow[]>([]);
	let libLoaded = $state(false);

	async function loadLib() {
		if (libLoaded) return;
		try {
			const [t, m, q] = await Promise.all([
				studyApi.topics(''),
				studyApi.myCards().catch(() => ({ topics: [], lessons: [], cards: [] })),
				studyApi.assessments().catch(() => ({ assessments: [] }))
			]);
			libTopics = t.topics;
			libDecks = m.topics;
			libDeckLessons = m.lessons;
			libQuizzes = q.assessments;
			libLoaded = true;
		} catch {
			// csatolmány nélkül is lehet üzenni
		}
	}

	async function loadExamLib() {
		await loadLib();
	}

	// ---------- Üzenet ----------
	let mTitle = $state('');
	let mBody = $state('');
	let attachKind = $state<AttachmentKind | null>(null);
	let mLink = $state('');
	let mTopic = $state('');
	let mLesson = $state('');
	let topicLessons = $state<LessonRow[]>([]);

	async function loadTopicLessons(tid: string) {
		mLesson = '';
		topicLessons = [];
		if (!tid) return;
		try {
			topicLessons = (await studyApi.topic(tid)).lessons;
		} catch {
			// üresen marad
		}
	}

	function attachLabel(kind: AttachmentKind): string {
		if (kind === 'link') return 'Link';
		if (kind === 'lesson') return 'Lecke';
		if (kind === 'topic') return 'Témakör';
		if (kind === 'deck') return 'Kártya';
		return 'Kvíz';
	}

	async function send() {
		if (!mTitle.trim() || busy) return;
		busy = true;
		try {
			let ref_type: string | undefined;
			let ref_id: string | undefined;
			if (attachKind === 'topic' && mTopic) {
				ref_type = 'topic';
				ref_id = mTopic;
			} else if (attachKind === 'lesson' && mLesson) {
				ref_type = 'lesson';
				ref_id = mLesson;
			} else if (attachKind === 'deck' && mTopic) {
				ref_type = 'deck';
				ref_id = mTopic;
			} else if (attachKind === 'quiz' && mTopic) {
				ref_type = 'assessment';
				ref_id = mTopic;
			}
			await studyApi.sendMessage(params.id, {
				title: mTitle.trim(),
				body: mBody.trim(),
				link_url: attachKind === 'link' ? mLink.trim() : '',
				...(ref_type && ref_id ? { ref_type, ref_id } : {})
			});
			mTitle = '';
			mBody = '';
			mLink = '';
			mTopic = '';
			mLesson = '';
			attachKind = null;
			drawer = null;
			await loadMessages();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	// ---------- Feladat: melyik kvízt / leckét kell megcsinálni + mit kell elérni ----------
	let tMode = $state<'quiz' | 'lesson'>('quiz');
	let tQuiz = $state('');
	let tTopic = $state('');
	let tLesson = $state('');
	let tDue = $state('');
	let tAttempts = $state(0);
	let tTime = $state(0);
	let tMin = $state(0);
	let tShuffle = $state(true);
	let tDelayed = $state(false);
	let tMsg = $state<string | null>(null);

	async function submitTask() {
		if (busy) return;
		tMsg = null;
		busy = true;
		try {
			const due = tDue ? new Date(tDue).getTime() : 0;
			let assessmentId = tQuiz;
			if (tMode === 'lesson') {
				if (!tTopic || !tLesson) {
					tMsg = 'Válassz leckét a feladathoz!';
					return;
				}
				const lessonTitle = topicLessons.find((l) => l.id === tLesson)?.title ?? 'Lecke';
				const built = await studyApi.buildAssessment({
					topic_id: tTopic,
					title: `${lessonTitle} — feladat`,
					max_attempts: tAttempts,
					time_limit_mins: tTime,
					shuffle: tShuffle,
					feedback_delayed: tDelayed,
					is_exam: false,
					count: 0,
					lesson_ids: [tLesson]
				});
				assessmentId = built.assessment.id;
			}
			if (!assessmentId) {
				tMsg = 'Válassz kvízt a feladathoz!';
				return;
			}
			await studyApi.assign({
				assessment_id: assessmentId,
				classroom_id: params.id,
				due_date: due,
				max_attempts: tAttempts,
				time_limit_mins: tTime,
				shuffle: tShuffle,
				feedback_delayed: tDelayed,
				is_exam: false,
				min_score: tMin
			});
			tMsg = 'Feladat kiadva!';
			invalidate('assignments');
			await reloadAssigns();
			setTimeout(() => {
				if (tMsg === 'Feladat kiadva!') drawer = null;
			}, 800);
		} catch (e) {
			tMsg = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	// ---------- Doga: kvízből ÉS kártyacsomagból is ----------
	let eMode = $state<'quiz' | 'deck'>('quiz');
	let eQuiz = $state('');
	let eDeck = $state('');
	let eCount = $state(10);
	let eDue = $state('');
	let eTime = $state(45);
	let eMin = $state(50);
	let eMsg = $state<string | null>(null);

	async function submitExam() {
		if (busy) return;
		eMsg = null;
		busy = true;
		try {
			const due = eDue ? new Date(eDue).getTime() : 0;
			let assessmentId = eQuiz;
			if (eMode === 'deck') {
				if (!eDeck) {
					eMsg = 'Válassz kártyacsomagot!';
					return;
				}
				const deckTitle = libDecks.find((d) => d.id === eDeck)?.title ?? 'Kártyacsomag';
				const built = await studyApi.buildAssessment({
					topic_id: eDeck,
					title: `${deckTitle} — dolgozat`,
					max_attempts: 1,
					time_limit_mins: eTime,
					shuffle: true,
					feedback_delayed: true,
					is_exam: true,
					count: eCount
				});
				assessmentId = built.assessment.id;
			}
			if (!assessmentId) {
				eMsg = 'Válassz kvízt a dolgozathoz!';
				return;
			}
			await studyApi.assign({
				assessment_id: assessmentId,
				classroom_id: params.id,
				due_date: due,
				max_attempts: 1,
				time_limit_mins: eTime,
				shuffle: true,
				feedback_delayed: true,
				is_exam: true,
				min_score: eMin
			});
			eMsg = 'Dolgozat elindítva!';
			invalidate('assignments');
			await reloadAssigns();
			setTimeout(() => {
				if (eMsg === 'Dolgozat elindítva!') drawer = null;
			}, 800);
		} catch (e) {
			eMsg = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	async function loadMessages() {
		try {
			messages = (await studyApi.messages(params.id)).messages;
		} catch {
			// üzenetek nélkül is megy az oldal
		}
	}

	async function reloadAssigns() {
		try {
			const data = await studyApi.classroom(params.id);
			assigns = data.assignments;
		} catch {
			// csendben
		}
	}

	async function removeMsg(id: string) {
		try {
			await studyApi.deleteMessage(id);
			messages = messages.filter((m) => m.id !== id);
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	async function revoke(id: string) {
		try {
			await studyApi.revokeAssignment(id);
			assigns = assigns.filter((a) => a.id !== id);
			invalidate('assignments');
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		}
	}

	function fmtDate(ts: number): string {
		return new Date(ts).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function fmtDue(ts: number): string {
		if (!ts) return 'nincs határidő';
		return new Date(ts).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function refBadge(ref_type: string | null): string {
		if (ref_type === 'lesson') return 'Lecke';
		if (ref_type === 'topic') return 'Témakör';
		if (ref_type === 'deck') return 'Kártya';
		if (ref_type === 'assessment') return 'Kvíz';
		return 'Csatolmány';
	}

	type WallItem =
		| { kind: 'message'; ts: number; msg: MessageRow }
		| { kind: 'assign'; ts: number; a: AssignmentRow };

	let wall = $derived<WallItem[]>([
		...messages.map((m) => ({ kind: 'message' as const, ts: m.created_at, msg: m })),
		...assigns.map((a) => ({ kind: 'assign' as const, ts: a.start_date || a.due_date || 0, a }))
	].sort((x, y) => y.ts - x.ts));

	const input =
		'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-white';

	onMount(() => {
		const cached = peek<{ classroom: Classroom; assignments: AssignmentRow[]; members: { name: string }[] }>(
			`classroom:${params.id}`
		);
		if (cached) {
			room = cached.classroom;
			assigns = cached.assignments;
			members = cached.members;
		}
		void (async () => {
			try {
				const data = await cacheGet(`classroom:${params.id}`, () => studyApi.classroom(params.id), 30000);
				room = data.data.classroom;
				assigns = data.data.assignments;
				members = data.data.members;
				void loadMessages();
			} catch (e) {
				if (!room) err = e instanceof Error ? e.message : 'Hiba történt.';
			}
		})();
		void loadMessages();
	});
</script>

<svelte:head>
	<title>{room ? `${room.name} — Fala` : 'Osztályfala — Leardy'}</title>
</svelte:head>

<div class="mt-3 flex items-center gap-2">
	<a
		href="/tanterem"
		aria-label="Vissza a tanterembe"
		class="grid size-10 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-ink-900 transition hover:bg-stone-50 active:scale-95 dark:hover:bg-white/10 dark:border-white/10 dark:bg-stone-900 dark:text-white"
	>
		<ArrowLeft size={20} />
	</a>
	<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight text-ink-900 dark:text-white">{room ? room.name : 'Osztály'}</h1>
	{#if canPost}
		<div class="relative shrink-0">
			<button
				onclick={() => (plusOpen = !plusOpen)}
				aria-label="Új kiadás"
				aria-expanded={plusOpen}
				class="grid size-10 place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 active:scale-95"
			>
				{#if plusOpen}<X size={20} strokeWidth={2.5} />{:else}<Plus size={20} strokeWidth={2.5} />{/if}
			</button>
			{#if plusOpen}
				<button aria-label="Menü bezárása" onclick={() => (plusOpen = false)} class="fixed inset-0 z-30 cursor-default bg-transparent"></button>
				<div class="anim-pop absolute top-12 right-0 z-40 w-64 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-white/10 dark:bg-stone-900">
					<button onclick={() => openDrawer('message')} class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-50 dark:hover:bg-white/5">
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white"><Megaphone size={19} /></span>
						<span class="min-w-0 flex-1">
							<span class="block text-[14px] font-bold text-ink-900 dark:text-white">Üzenet</span>
							<span class="block truncate text-[12px] text-stone-500 dark:text-stone-400">Hír + csatolmány a falra</span>
						</span>
					</button>
					<button onclick={() => openDrawer('task')} class="flex w-full items-center gap-3 border-t border-stone-100 px-4 py-3 text-left transition hover:bg-stone-50 dark:border-white/5 dark:hover:bg-white/5">
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"><ClipboardList size={19} /></span>
						<span class="min-w-0 flex-1">
							<span class="block text-[14px] font-bold text-ink-900 dark:text-white">Feladat</span>
							<span class="block truncate text-[12px] text-stone-500 dark:text-stone-400">Kvíz / lecke + elvárások</span>
						</span>
					</button>
					<button onclick={() => openDrawer('exam')} class="flex w-full items-center gap-3 border-t border-stone-100 px-4 py-3 text-left transition hover:bg-stone-50 dark:border-white/5 dark:hover:bg-white/5">
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-300"><FileText size={19} /></span>
						<span class="min-w-0 flex-1">
							<span class="block text-[14px] font-bold text-ink-900 dark:text-white">Dolgozat</span>
							<span class="block truncate text-[12px] text-stone-500 dark:text-stone-400">Kvízből vagy kártyából</span>
						</span>
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if err && !room}
	<p role="alert" class="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
{:else if !room}
	<p class="animate-pulse mt-2 text-sm text-stone-500 dark:text-stone-400">Betöltés…</p>
{:else}
	<section class="mt-2 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
		<p class="text-sm text-ink-600 dark:text-stone-400">
			{#if room.subject}<span class="mr-2 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-600 dark:bg-white/10 dark:text-stone-300">{room.subject}</span>{/if}
			Kód: <span class="font-bold tracking-widest">{room.code}</span> · {members.length} tag
		</p>
	</section>

	<!-- FAL: üzenetek + feladatok + dolgozatok egyben -->
	<div class="mt-5 flex items-end justify-between gap-2">
		<h2 class="text-left text-[18px] font-extrabold tracking-tight text-ink-900 dark:text-white">Fal</h2>
		<span class="shrink-0 text-[13px] font-medium text-stone-500 tabular-nums dark:text-stone-400">{wall.length} bejegyzés</span>
	</div>

	{#if wall.length === 0}
		<p class="mt-2.5 rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">
			Még üres a fal.{#if canPost} A jobb felső + gombbal adj ki üzenetet, feladatot vagy dolgozatot!{/if}
		</p>
	{:else}
		<ul class="mt-2.5 space-y-2.5">
			{#each wall as item (item.kind === 'message' ? `m:${item.msg.id}` : `a:${item.a.id}`)}
				{#if item.kind === 'message'}
					{@const m = item.msg}
					<li class="rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-900">
						<button onclick={() => (openMsg = openMsg === m.id ? null : m.id)} class="flex w-full items-center gap-3 text-left">
							<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white">
								<Megaphone size={19} />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[15px] font-bold text-ink-900 dark:text-white">{m.title}</span>
								<span class="block text-[13px] text-ink-400 dark:text-stone-500">{m.teacher_name} · {fmtDate(m.created_at)}</span>
							</span>
						</button>
						{#if openMsg === m.id}
							<div class="anim-fade space-y-2 pt-2.5 pl-[52px]">
								{#if m.body}
									<p class="text-sm leading-relaxed whitespace-pre-wrap text-ink-900 dark:text-stone-200">{m.body}</p>
								{/if}
								{#if m.ref_link}
									{#if m.ref_type === 'assessment' && !canPost}
										<span class="flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-bold text-brand-700 dark:bg-brand-500/15 dark:text-white">
											<Link2 size={15} />
											<span class="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-extrabold tracking-wide uppercase dark:bg-white/10">{refBadge(m.ref_type)}</span>
											<span class="truncate">{m.ref_title ?? 'Kvíz'}</span>
										</span>
									{:else}
										<a
											href={m.ref_link}
											class="flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-bold text-brand-700 dark:bg-brand-500/15 dark:text-white"
										>
											<Link2 size={15} />
											<span class="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-extrabold tracking-wide uppercase dark:bg-white/10">{refBadge(m.ref_type)}</span>
											<span class="truncate">{m.ref_title ?? 'Megnyitás'}</span>
										</a>
									{/if}
								{/if}
								{#if m.link_url}
									<a
										href={m.link_url}
										target="_blank"
										rel="noopener noreferrer"
										class="flex items-center gap-1.5 rounded-xl bg-stone-100 px-3 py-2.5 text-sm font-semibold text-ink-600 break-all dark:bg-white/10 dark:text-stone-200"
									>
										<Link2 size={15} class="shrink-0" /> {m.link_url}
									</a>
								{/if}
								{#if canPost}
									<button
										onclick={() => void removeMsg(m.id)}
										class="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-400/10"
									>
										<Trash2 size={14} /> Törlés
									</button>
								{/if}
							</div>
						{/if}
					</li>
				{:else}
					{@const a = item.a}
					<li class="rounded-2xl border {a.is_exam ? 'border-red-200 dark:border-red-500/30' : 'border-stone-200 dark:border-white/10'} bg-white p-4 dark:bg-stone-900">
						<div class="flex items-center gap-3">
							<span class="grid size-10 shrink-0 place-items-center rounded-xl {a.is_exam ? 'bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300'}">
								{#if a.is_exam}<FileText size={19} />{:else}<Bell size={19} />{/if}
							</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-[15px] font-bold text-ink-900 dark:text-white">
									{a.title}
									<span class="ml-1.5 rounded-full px-2 py-0.5 text-[11px] font-extrabold {a.is_exam ? 'bg-red-100 text-red-700 dark:bg-red-400/10 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'}">
										{a.is_exam ? 'DOLGOZAT' : 'FELADAT'}
									</span>
								</p>
								<p class="text-[13px] text-ink-400 dark:text-stone-500">
									Határidő: {fmtDue(a.due_date)}
									{#if (a.min_score ?? 0) > 0} · cél: {a.min_score}%{/if}
									{#if a.best !== null} · legjobb: {a.best}{/if}
								</p>
							</div>
							<a
								href="/tanterem/dolgozat/{a.id}"
								class="shrink-0 rounded-full bg-brand-500 px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-brand-600"
							>
								{a.submitted ? 'Újra' : 'Kitöltés'}
							</a>
						</div>
						{#if canPost}
							<button
								onclick={() => void revoke(a.id)}
								class="mt-1.5 ml-[52px] rounded-full px-3 py-1.5 text-[13px] font-semibold text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-400/10"
							>
								Visszavonás
							</button>
						{/if}
					</li>
				{/if}
			{/each}
		</ul>
	{/if}

	{#if members.length > 0}
		<section class="mt-5 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-stone-900">
			<h2 class="text-[16px] font-bold text-ink-900 dark:text-white">Tagok</h2>
			<ul class="mt-2 flex flex-wrap gap-2">
				{#each members as m (m.name)}
					<li class="rounded-full bg-stone-100 px-3 py-1 text-[13px] font-semibold text-ink-600 dark:bg-white/10 dark:text-stone-300">
						{m.name}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/if}

<!-- ÜZENET drawer -->
<Drawer open={drawer === 'message'} label="Új üzenet" onClose={() => (drawer = null)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Üzenet kiadása</h2>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Hír a falra, csatolmánnyal.</p>
		{#if err}
			<p role="alert" class="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
		{/if}
		<input bind:value={mTitle} placeholder="Cím" aria-label="Üzenet címe" class="{input} mt-4" />
		<textarea bind:value={mBody} rows="3" placeholder="Szöveg (opcionális)" aria-label="Üzenet szövege" class="{input} mt-2"></textarea>

		{#if !attachKind}
			<button
				onclick={() => (attachKind = 'link')}
				class="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-stone-300 p-3 text-sm font-bold text-stone-500 dark:border-white/15 dark:text-stone-300"
			>
				<Plus size={16} /> Csatolmány
			</button>
		{:else}
			<div class="mt-3 rounded-2xl bg-stone-100 p-3 dark:bg-white/5">
				<p class="text-[13px] font-bold text-ink-900 dark:text-white">Csatolmány típusa</p>
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each (['link', 'lesson', 'topic', 'deck', 'quiz'] as AttachmentKind[]) as k (k)}
						<button
							onclick={() => {
								attachKind = k;
								mTopic = '';
								mLesson = '';
								if (k === 'lesson' || k === 'topic') void loadTopicLessons(mTopic);
							}}
							aria-pressed={attachKind === k}
							class={['rounded-full px-3 py-1.5 text-[13px] font-bold transition', attachKind === k ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-white text-ink-600 dark:bg-white/10 dark:text-stone-300']}
						>
							{attachLabel(k)}
						</button>
					{/each}
				</div>
				{#if attachKind === 'link'}
					<input bind:value={mLink} placeholder="https://…" inputmode="url" aria-label="Link" class="{input} mt-2" />
				{:else if attachKind === 'topic'}
					<select bind:value={mTopic} aria-label="Témakör" class="{input} mt-2">
						<option value="">Válassz témakört…</option>
						{#each libTopics as t (t.id)}
							<option value={t.id}>{t.title}</option>
						{/each}
					</select>
				{:else if attachKind === 'lesson'}
					<div class="mt-2 grid gap-1.5">
						<select bind:value={mTopic} onchange={() => void loadTopicLessons(mTopic)} aria-label="Témakör" class={input}>
							<option value="">Témakör…</option>
							{#each libTopics as t (t.id)}
								<option value={t.id}>{t.title}</option>
							{/each}
						</select>
						<select bind:value={mLesson} aria-label="Lecke" class={input} disabled={!mTopic}>
							<option value="">Lecke…</option>
							{#each topicLessons as l (l.id)}
								<option value={l.id}>{l.title}</option>
							{/each}
						</select>
					</div>
				{:else if attachKind === 'deck'}
					<select bind:value={mTopic} aria-label="Kártyacsomag" class="{input} mt-2">
						<option value="">Válassz kártyacsomagot…</option>
						{#each libDecks as d (d.id)}
							<option value={d.id}>{d.title}</option>
						{/each}
					</select>
				{:else}
					<select bind:value={mTopic} aria-label="Kvíz" class="{input} mt-2">
						<option value="">Válassz kvízt…</option>
						{#each libQuizzes as qz (qz.id)}
							<option value={qz.id}>{qz.title} ({qz.items} kérdés)</option>
						{/each}
					</select>
				{/if}
				<button onclick={() => (attachKind = null)} class="mt-2 text-[13px] font-semibold text-stone-500 dark:text-stone-400">Csatolmány eltávolítása</button>
			</div>
		{/if}

		<button
			onclick={() => void send()}
			disabled={!mTitle.trim() || busy}
			class="mt-4 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
		>
			{busy ? 'Közzététel…' : 'Közzététel a falra'}
		</button>
	</div>
</Drawer>

<!-- FELADAT drawer: melyik kvízt / leckét kell megcsinálni + mit kell elérni -->
<Drawer open={drawer === 'task'} label="Új feladat" onClose={() => (drawer = null)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Feladat kiadása</h2>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Válaszd ki, mit kell megcsinálni, és mit kell elérni.</p>
		<div class="mt-3 flex gap-2" role="tablist" aria-label="Forrás">
			{#each [{ id: 'quiz', label: 'Kvíz' }, { id: 'lesson', label: 'Lecke' }] as m (m.id)}
				<button
					role="tab"
					aria-selected={tMode === m.id}
					onclick={() => (tMode = m.id as typeof tMode)}
					class={['flex-1 rounded-full py-2 text-[13px] font-bold transition', tMode === m.id ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
				>
					{m.label}
				</button>
			{/each}
		</div>
		{#if tMode === 'quiz'}
			<select bind:value={tQuiz} aria-label="Kvíz" class="{input} mt-2.5">
				<option value="">Válassz kvízt…</option>
				{#each libQuizzes as qz (qz.id)}
					<option value={qz.id}>{qz.title} ({qz.items} kérdés)</option>
				{/each}
			</select>
			<a href="/kvizek" class="mt-1.5 block text-[13px] font-semibold text-brand-600 dark:text-brand-300">+ Új kvíz készítése a Kvízek oldalon →</a>
		{:else}
			<div class="mt-2.5 grid gap-1.5">
				<select bind:value={tTopic} onchange={() => void loadTopicLessons(tTopic)} aria-label="Témakör" class={input}>
					<option value="">Témakör…</option>
					{#each libTopics as t (t.id)}
						<option value={t.id}>{t.title}</option>
					{/each}
				</select>
				<select bind:value={tLesson} aria-label="Lecke" class={input} disabled={!tTopic}>
					<option value="">Lecke… — ezt kell megcsinálni</option>
					{#each topicLessons as l (l.id)}
						<option value={l.id}>{l.title}</option>
					{/each}
				</select>
			</div>
		{/if}
		<p class="mt-4 text-[13px] font-bold text-ink-900 dark:text-white">Elvárások</p>
		<div class="mt-2 grid gap-2 sm:grid-cols-2">
			<input type="datetime-local" bind:value={tDue} aria-label="Határidő" class={input} />
			<label class="flex items-center gap-2 text-[13px] text-ink-600 dark:text-stone-300">
				Minimum pont
				<input type="number" min="0" max="100" step="5" bind:value={tMin} class="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5 dark:text-white" />
				<span class="font-bold">%</span>
			</label>
			<label class="flex items-center gap-2 text-[13px] text-ink-600 dark:text-stone-300">
				Próbálkozás
				<input type="number" min="0" max="20" bind:value={tAttempts} class="w-16 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5 dark:text-white" />
			</label>
			<label class="flex items-center gap-2 text-[13px] text-ink-600 dark:text-stone-300">
				Idő (perc)
				<input type="number" min="0" max="180" bind:value={tTime} class="w-16 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5 dark:text-white" />
			</label>
			<label class="flex items-center gap-1.5 text-[13px] text-ink-600 dark:text-stone-300">
				<input type="checkbox" bind:checked={tShuffle} class="size-4 accent-brand-500" /> Keverés
			</label>
			<label class="flex items-center gap-1.5 text-[13px] text-ink-600 dark:text-stone-300">
				<input type="checkbox" bind:checked={tDelayed} class="size-4 accent-brand-500" /> Eredmény csak határidő után
			</label>
		</div>
		{#if tMsg}
			<p class="mt-2 text-[13px] font-medium text-ink-600 dark:text-stone-300">{tMsg}</p>
		{/if}
		<button
			onclick={() => void submitTask()}
			disabled={busy}
			class="mt-4 w-full rounded-full bg-emerald-500 py-3 text-[15px] font-bold text-white transition hover:brightness-95 disabled:opacity-60"
		>
			{busy ? 'Kiadás…' : 'Feladat kiadása'}
		</button>
	</div>
</Drawer>

<!-- DOLGOZAT drawer: kvízből ÉS kártyacsomagból is -->
<Drawer open={drawer === 'exam'} label="Új dolgozat" onClose={() => (drawer = null)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Dolgozat indítása</h2>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Kvízből vagy kártyacsomagból — 1 próbálkozás, szigorú.</p>
		<div class="mt-3 flex gap-2" role="tablist" aria-label="Forrás">
			{#each [{ id: 'quiz', label: 'Kvízből' }, { id: 'deck', label: 'Kártyacsomagból' }] as m (m.id)}
				<button
					role="tab"
					aria-selected={eMode === m.id}
					onclick={() => (eMode = m.id as typeof eMode)}
					class={['flex-1 rounded-full py-2 text-[13px] font-bold transition', eMode === m.id ? 'bg-red-600 text-white' : 'bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-stone-300']}
				>
					{m.label}
				</button>
			{/each}
		</div>
		{#if eMode === 'quiz'}
			<select bind:value={eQuiz} aria-label="Kvíz" class="{input} mt-2.5">
				<option value="">Válassz kvízt…</option>
				{#each libQuizzes as qz (qz.id)}
					<option value={qz.id}>{qz.title} ({qz.items} kérdés)</option>
				{/each}
			</select>
		{:else}
			<select bind:value={eDeck} aria-label="Kártyacsomag" class="{input} mt-2.5">
				<option value="">Válassz kártyacsomagot…</option>
				{#each libDecks as d (d.id)}
					<option value={d.id}>{d.title}</option>
				{/each}
			</select>
			<label class="mt-2.5 flex items-center gap-2 text-sm text-ink-600 dark:text-stone-300">
				Kérdésszám
				<input type="number" min="3" max="30" bind:value={eCount} class="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5 dark:text-white" />
			</label>
		{/if}
		<div class="mt-3 grid gap-2 sm:grid-cols-2">
			<input type="datetime-local" bind:value={eDue} aria-label="Határidő" class={input} />
			<label class="flex items-center gap-2 text-[13px] text-ink-600 dark:text-stone-300">
				Idő (perc)
				<input type="number" min="0" max="180" bind:value={eTime} class="w-16 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5 dark:text-white" />
			</label>
			<label class="flex items-center gap-2 text-[13px] text-ink-600 sm:col-span-2 dark:text-stone-300">
				Minimum pont
				<input type="number" min="0" max="100" step="5" bind:value={eMin} class="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-white/15 dark:bg-white/5 dark:text-white" />
				<span class="font-bold">%</span>
			</label>
		</div>
		{#if eMsg}
			<p class="mt-2 text-[13px] font-medium text-ink-600 dark:text-stone-300">{eMsg}</p>
		{/if}
		<button
			onclick={() => void submitExam()}
			disabled={busy}
			class="mt-4 w-full rounded-full bg-red-600 py-3 text-[15px] font-bold text-white transition hover:brightness-95 disabled:opacity-60"
		>
			{busy ? 'Indítás…' : 'Dolgozat indítása'}
		</button>
	</div>
</Drawer>
