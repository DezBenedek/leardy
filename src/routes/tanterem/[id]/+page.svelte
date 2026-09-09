<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ArrowLeft,
		Bell,
		BookOpenText,
		ChevronRight,
		ClipboardList,
		FileText,
		FolderOpen,
		Layers,
		Link2,
		Megaphone,
		Plus,
		Share2,
		Trash2,
		X
	} from '@lucide/svelte';
	import { auth } from '$lib/auth.svelte';
	import { get as cacheGet, invalidate, peek } from '$lib/cache';
	import ContentPicker, { type PickedRef, type PickerKind } from '$lib/components/ContentPicker.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import {
		studyApi,
		type AssessmentRow,
		type AssignmentRow,
		type AttachmentKind,
		type Classroom,
		type LessonRow,
		type MessageRow,
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
	let drawer = $state<'message' | 'share' | 'task' | 'exam' | null>(null);
	let busy = $state(false);

	function openDrawer(kind: 'message' | 'share' | 'task' | 'exam') {
		plusOpen = false;
		drawer = kind;
		if (kind !== 'message') void loadLib();
	}

	// ---------- Közös könyvtár a csatolmányokhoz ----------
	let libTopics = $state<Topic[]>([]);
	let libDecks = $state<MyTopic[]>([]);
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
			libQuizzes = q.assessments;
			libLoaded = true;
		} catch {
			// csatolmány nélkül is lehet üzenni
		}
	}

	// ---------- Üzenet (sima hír + opcionális link) ----------
	let mTitle = $state('');
	let mBody = $state('');
	let mLink = $state('');

	// ---------- Megosztás (lecke / kártya / kvíz / témakör / link a falra) ----------
	let shareKind = $state<AttachmentKind>('lesson');
	let sTopic = $state('');
	let sTopicTitle = $state('');
	let sLesson = $state('');
	let sLessonTitle = $state('');
	let sLink = $state('');
	let sTitle = $state('');
	let sBody = $state('');
	let sMsg = $state<string | null>(null);

	const SHARE_KINDS: { id: AttachmentKind; label: string }[] = [
		{ id: 'lesson', label: 'Lecke' },
		{ id: 'deck', label: 'Kártya' },
		{ id: 'quiz', label: 'Kvíz' },
		{ id: 'topic', label: 'Témakör' },
		{ id: 'link', label: 'Link' }
	];

	function shareIcon(kind: AttachmentKind) {
		if (kind === 'lesson') return BookOpenText;
		if (kind === 'deck') return Layers;
		if (kind === 'quiz') return ClipboardList;
		if (kind === 'topic') return FolderOpen;
		return Link2;
	}

	async function fetchLessons(topicId: string): Promise<LessonRow[]> {
		try {
			return (await studyApi.topic(topicId)).lessons;
		} catch {
			return [];
		}
	}

	// ---------- Tartalomválasztó: témakör -> lecke leolvasás, mindenhol drawerben ----------
	type PickerKey =
		| 'share-lesson'
		| 'share-deck'
		| 'share-quiz'
		| 'share-topic'
		| 'task-quiz'
		| 'task-lesson'
		| 'exam-quiz'
		| 'exam-deck';
	let picker = $state<{ key: PickerKey; kind: PickerKind; multiple?: boolean } | null>(null);

	async function openPicker(key: PickerKey, kind: PickerKind, multiple = false) {
		await loadLib();
		picker = { key, kind, multiple };
	}

	function onPick(v: PickedRef) {
		const key = picker?.key;
		picker = null;
		if (!key) return;
		if (key === 'share-lesson' && v.parentId) {
			sTopic = v.parentId;
			sTopicTitle = v.parentTitle ?? '';
			sLesson = v.id;
			sLessonTitle = v.title;
			sTitle = v.title;
		} else if (key === 'share-deck' || key === 'share-quiz' || key === 'share-topic') {
			sTopic = v.id;
			sTopicTitle = v.title;
			sTitle = v.title;
		} else if (key === 'task-quiz') {
			tQuiz = v.id;
			tQuizTitle = v.title;
		} else if (key === 'task-lesson' && v.parentId) {
			tTopic = v.parentId;
			tTopicTitle = v.parentTitle ?? '';
			tLesson = v.id;
			tLessonTitle = v.title;
		}
	}

	function onPickMulti(ids: string[]) {
		const key = picker?.key;
		picker = null;
		if (key === 'exam-deck') {
			eDecks = ids.map((id) => ({ id, title: libDecks.find((d) => d.id === id)?.title ?? 'Csomag' }));
		} else if (key === 'exam-quiz') {
			eQuizzes = ids.map((id) => ({ id, title: libQuizzes.find((x) => x.id === id)?.title ?? 'Kvíz' }));
		}
	}

	async function send() {
		if (!mTitle.trim() || busy) return;
		busy = true;
		try {
			await studyApi.sendMessage(params.id, {
				title: mTitle.trim(),
				body: mBody.trim(),
				link_url: mLink.trim()
			});
			mTitle = '';
			mBody = '';
			mLink = '';
			drawer = null;
			await loadMessages();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	function selectedShareTitle(): string | null {
		if (shareKind === 'lesson') return sLessonTitle || null;
		if (shareKind === 'link') return null;
		return sTopicTitle || null;
	}

	async function submitShare() {
		if (busy) return;
		sMsg = null;
		if (!sTitle.trim()) {
			sMsg = 'Adj címet a megosztásnak!';
			return;
		}
		let ref_type: string | undefined;
		let ref_id: string | undefined;
		if (shareKind === 'lesson') {
			if (!sLesson) {
				sMsg = 'Válassz leckét!';
				return;
			}
			ref_type = 'lesson';
			ref_id = sLesson;
		} else if (shareKind === 'deck') {
			if (!sTopic) {
				sMsg = 'Válassz kártyacsomagot!';
				return;
			}
			ref_type = 'deck';
			ref_id = sTopic;
		} else if (shareKind === 'quiz') {
			if (!sTopic) {
				sMsg = 'Válassz kvízt!';
				return;
			}
			ref_type = 'assessment';
			ref_id = sTopic;
		} else if (shareKind === 'topic') {
			if (!sTopic) {
				sMsg = 'Válassz témakört!';
				return;
			}
			ref_type = 'topic';
			ref_id = sTopic;
		} else if (!sLink.trim()) {
			sMsg = 'Add meg a linket!';
			return;
		}
		busy = true;
		try {
			await studyApi.sendMessage(params.id, {
				title: sTitle.trim(),
				body: sBody.trim(),
				link_url: shareKind === 'link' ? sLink.trim() : '',
				...(ref_type && ref_id ? { ref_type, ref_id } : {})
			});
			sTopic = '';
			sTopicTitle = '';
			sLesson = '';
			sLessonTitle = '';
			sLink = '';
			sTitle = '';
			sBody = '';
			drawer = null;
			await loadMessages();
		} catch (e) {
			sMsg = e instanceof Error ? e.message : 'Hiba történt.';
		} finally {
			busy = false;
		}
	}

	// ---------- Feladat: melyik kvízt / leckét kell megcsinálni + mit kell elérni ----------
	let tMode = $state<'quiz' | 'lesson'>('quiz');
	let tQuiz = $state('');
	let tQuizTitle = $state('');
	let tTopic = $state('');
	let tTopicTitle = $state('');
	let tLesson = $state('');
	let tLessonTitle = $state('');
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
				const lessonTitle = tLessonTitle || 'Lecke';
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

	// ---------- Doga: kvízből ÉS (akár több) kártyacsomagból is ----------
	let eMode = $state<'quiz' | 'deck'>('quiz');
	let eQuizzes = $state<{ id: string; title: string }[]>([]);
	let eDecks = $state<{ id: string; title: string }[]>([]);
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
			let assessmentId = '';
			if (eMode === 'quiz') {
				if (eQuizzes.length === 0) {
					eMsg = 'Válassz legalább egy kvízt!';
					return;
				}
				if (eQuizzes.length === 1) {
					assessmentId = eQuizzes[0].id;
				} else {
					const ids = eQuizzes.map((x) => x.id);
					const quizTitle = `${eQuizzes[0].title} +${eQuizzes.length - 1}`;
					const merged = await studyApi.mergeAssessments({
						assessment_ids: ids,
						title: `${quizTitle} — dolgozat`,
						max_attempts: 1,
						time_limit_mins: eTime,
						shuffle: true,
						feedback_delayed: true,
						is_exam: true
					});
					assessmentId = merged.assessment.id;
				}
			}
			if (eMode === 'deck') {
				if (eDecks.length === 0) {
					eMsg = 'Válassz legalább egy kártyacsomagot!';
					return;
				}
				const ids = eDecks.map((d) => d.id);
				const deckTitle = eDecks.length === 1 ? eDecks[0].title : `${eDecks[0].title} +${eDecks.length - 1}`;
				const built = await studyApi.buildAssessment({
					topic_id: ids[0],
					topic_ids: ids,
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
				eMsg = 'Válassz forrást a dolgozathoz!';
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
							<span class="block truncate text-[12px] text-stone-500 dark:text-stone-400">Rövid hír a falra</span>
						</span>
					</button>
					<button onclick={() => openDrawer('share')} class="flex w-full items-center gap-3 border-t border-stone-100 px-4 py-3 text-left transition hover:bg-stone-50 dark:border-white/5 dark:hover:bg-white/5">
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300"><Share2 size={19} /></span>
						<span class="min-w-0 flex-1">
							<span class="block text-[14px] font-bold text-ink-900 dark:text-white">Megosztás</span>
							<span class="block truncate text-[12px] text-stone-500 dark:text-stone-400">Lecke, kártya, kvíz a falra</span>
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
			Még üres a fal.{#if canPost} A jobb felső + gombbal ossz meg tartalmat, vagy adj ki feladatot, dolgozatot!{/if}
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

<!-- ÜZENET drawer: sima hír -->
<Drawer open={drawer === 'message'} label="Új üzenet" wide onClose={() => (drawer = null)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Üzenet</h2>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Rövid hír az osztály falára.</p>
		{#if err}
			<p role="alert" class="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>
		{/if}
		<label class="mt-4 block text-[13px] font-semibold text-ink-900 dark:text-white">
			Cím
			<input bind:value={mTitle} placeholder="Pl. Holnapi óra elmarad" aria-label="Üzenet címe" class="mt-1 {input}" />
		</label>
		<label class="mt-2.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
			Szöveg <span class="font-normal text-stone-400">(opcionális)</span>
			<textarea bind:value={mBody} rows="3" placeholder="Részletek…" aria-label="Üzenet szövege" class="mt-1 {input}"></textarea>
		</label>
		<label class="mt-2.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
			Link <span class="font-normal text-stone-400">(opcionális)</span>
			<input bind:value={mLink} placeholder="https://…" inputmode="url" aria-label="Link" class="mt-1 {input}" />
		</label>

		<button
			onclick={() => void send()}
			disabled={!mTitle.trim() || busy}
			class="mt-4 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
		>
			{busy ? 'Közzététel…' : 'Közzététel a falra'}
		</button>
	</div>
</Drawer>

<!-- MEGOSZTÁS drawer: lecke / kártya / kvíz / témakör / link -->
<Drawer open={drawer === 'share'} label="Megosztás" wide onClose={() => (drawer = null)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Megosztás</h2>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Tartalom az osztály falára.</p>

		<div class="mt-4 grid grid-cols-3 gap-1.5" role="tablist" aria-label="Megosztás típusa">
			{#each SHARE_KINDS as k (k.id)}
				{@const Icon = shareIcon(k.id)}
				<button
					role="tab"
					aria-selected={shareKind === k.id}
					onclick={() => {
						shareKind = k.id;
						sTopic = '';
						sTopicTitle = '';
						sLesson = '';
						sLessonTitle = '';
						sLink = '';
					}}
					class={['flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-2.5 transition active:scale-95', shareKind === k.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-stone-200 dark:border-white/10']}
				>
					<Icon size={20} class={shareKind === k.id ? 'text-brand-600 dark:text-white' : 'text-stone-400'} />
					<span class={['text-[12px] font-bold', shareKind === k.id ? 'text-brand-700 dark:text-white' : 'text-stone-500 dark:text-stone-400']}>{k.label}</span>
				</button>
			{/each}
		</div>

		<div class="mt-3 rounded-2xl bg-stone-100 p-3.5 dark:bg-white/5">
			{#if shareKind === 'lesson'}
				<button
					onclick={() => void openPicker('share-lesson', 'lesson')}
					class="flex w-full items-center gap-2.5 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-left transition hover:border-brand-500 active:scale-[0.99] dark:border-white/15 dark:bg-white/5"
				>
					<BookOpenText size={18} class="shrink-0 text-brand-600 dark:text-white" />
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[14px] font-bold text-ink-900 dark:text-white">
							{sLessonTitle || 'Válassz leckét…'}
						</span>
						{#if sLessonTitle}
							<span class="block truncate text-[12px] text-stone-500 dark:text-stone-400">{sTopicTitle}</span>
						{:else}
							<span class="block text-[12px] text-stone-500 dark:text-stone-400">Témakör → lecke</span>
						{/if}
					</span>
					<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
				</button>
			{:else if shareKind === 'deck'}
				<button
					onclick={() => void openPicker('share-deck', 'deck')}
					class="flex w-full items-center gap-2.5 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-left transition hover:border-brand-500 active:scale-[0.99] dark:border-white/15 dark:bg-white/5"
				>
					<Layers size={18} class="shrink-0 text-emerald-600 dark:text-emerald-300" />
					<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
						{sTopicTitle || 'Válassz kártyacsomagot…'}
					</span>
					<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
				</button>
			{:else if shareKind === 'quiz'}
				<button
					onclick={() => void openPicker('share-quiz', 'quiz')}
					class="flex w-full items-center gap-2.5 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-left transition hover:border-brand-500 active:scale-[0.99] dark:border-white/15 dark:bg-white/5"
				>
					<ClipboardList size={18} class="shrink-0 text-brand-600 dark:text-white" />
					<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
						{sTopicTitle || 'Válassz kvízt…'}
					</span>
					<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
				</button>
				<a href="/kvizek" class="mt-1.5 block text-[13px] font-semibold text-brand-600 dark:text-brand-300">+ Új kvíz a Kvízek oldalon →</a>
			{:else if shareKind === 'topic'}
				<button
					onclick={() => void openPicker('share-topic', 'topic')}
					class="flex w-full items-center gap-2.5 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-left transition hover:border-brand-500 active:scale-[0.99] dark:border-white/15 dark:bg-white/5"
				>
					<FolderOpen size={18} class="shrink-0 text-amber-600 dark:text-amber-300" />
					<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
						{sTopicTitle || 'Válassz témakört…'}
					</span>
					<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
				</button>
			{:else}
				<label class="block text-[13px] font-semibold text-ink-900 dark:text-white">
					Link
					<input bind:value={sLink} placeholder="https://…" inputmode="url" aria-label="Link" class="mt-1 {input}" />
				</label>
			{/if}

			{#if selectedShareTitle()}
				{@const SIcon = shareIcon(shareKind)}
				<div class="mt-2.5 flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 dark:bg-white/10">
					<span class="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-white">
						<SIcon size={17} />
					</span>
					<p class="min-w-0 flex-1 truncate text-sm font-bold text-ink-900 dark:text-white">{selectedShareTitle()}</p>
				</div>
			{/if}
		</div>

		<label class="mt-3 block text-[13px] font-semibold text-ink-900 dark:text-white">
			Cím a falon
			<input bind:value={sTitle} placeholder="Pl. Ezt nézzétek át!" aria-label="Megosztás címe" class="mt-1 {input}" />
		</label>
		<label class="mt-2.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
			Megjegyzés <span class="font-normal text-stone-400">(opcionális)</span>
			<textarea bind:value={sBody} rows="2" placeholder="Pár szó hozzá…" aria-label="Megjegyzés" class="mt-1 {input}"></textarea>
		</label>

		{#if sMsg}
			<p class="mt-2 text-[13px] font-medium text-ink-600 dark:text-stone-300">{sMsg}</p>
		{/if}
		<button
			onclick={() => void submitShare()}
			disabled={busy || !sTitle.trim()}
			class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
		>
			<Share2 size={17} /> {busy ? 'Megosztás…' : 'Megosztás a falon'}
		</button>
	</div>
</Drawer>

<!-- FELADAT drawer: melyik kvízt / leckét kell megcsinálni + mit kell elérni -->
<Drawer open={drawer === 'task'} label="Új feladat" wide onClose={() => (drawer = null)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Feladat kiadása</h2>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Mit kell megcsinálni, és mit kell elérni.</p>

		<section class="mt-4 rounded-2xl bg-stone-100 p-3.5 dark:bg-white/5" aria-label="Mit kell megcsinálni">
			<p class="text-[12px] font-extrabold tracking-wide text-stone-400 uppercase dark:text-stone-500">1 · Tananyag</p>
			<div class="mt-2 grid grid-cols-2 gap-1.5" role="tablist" aria-label="Forrás">
				{#each [{ id: 'quiz', label: 'Kvíz' }, { id: 'lesson', label: 'Lecke' }] as m (m.id)}
					<button
						role="tab"
						aria-selected={tMode === m.id}
						onclick={() => (tMode = m.id as typeof tMode)}
						class={['rounded-xl py-2.5 text-[14px] font-bold transition active:scale-95', tMode === m.id ? 'bg-ink-900 text-white shadow-sm dark:bg-white dark:text-ink-900' : 'bg-white text-ink-600 dark:bg-white/10 dark:text-stone-300']}
					>
						{m.label}
					</button>
				{/each}
			</div>
			{#if tMode === 'quiz'}
				<button
					onclick={() => void openPicker('task-quiz', 'quiz')}
					class="mt-2 flex w-full items-center gap-2.5 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-left transition hover:border-brand-500 active:scale-[0.99] dark:border-white/15 dark:bg-white/5"
				>
					<ClipboardList size={18} class="shrink-0 text-brand-600 dark:text-white" />
					<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
						{tQuizTitle || 'Válassz kvízt…'}
					</span>
					<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
				</button>
				<a href="/kvizek" class="mt-1.5 block text-[13px] font-semibold text-brand-600 dark:text-brand-300">+ Új kvíz készítése a Kvízek oldalon →</a>
			{:else}
				<button
					onclick={() => void openPicker('task-lesson', 'lesson')}
					class="mt-2 flex w-full items-center gap-2.5 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-left transition hover:border-brand-500 active:scale-[0.99] dark:border-white/15 dark:bg-white/5"
				>
					<BookOpenText size={18} class="shrink-0 text-brand-600 dark:text-white" />
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[14px] font-bold text-ink-900 dark:text-white">
							{tLessonTitle || 'Válassz leckét…'}
						</span>
						{#if tLessonTitle}
							<span class="block truncate text-[12px] text-stone-500 dark:text-stone-400">{tTopicTitle}</span>
						{:else}
							<span class="block text-[12px] text-stone-500 dark:text-stone-400">Témakör → lecke — ezt kell megcsinálni</span>
						{/if}
					</span>
					<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
				</button>
			{/if}
		</section>

		<section class="mt-2.5 rounded-2xl bg-stone-100 p-3.5 dark:bg-white/5" aria-label="Elvárások">
			<p class="text-[12px] font-extrabold tracking-wide text-stone-400 uppercase dark:text-stone-500">2 · Elvárások</p>
			<label class="mt-2 block text-[13px] font-semibold text-ink-900 dark:text-white">
				Határidő
				<input type="datetime-local" bind:value={tDue} aria-label="Határidő" class="mt-1 {input}" />
			</label>
			<div class="mt-2 grid grid-cols-3 gap-1.5">
				<label class="rounded-xl bg-white px-2.5 py-2 text-center dark:bg-white/10">
					<span class="block text-[11px] font-bold text-stone-400 uppercase">Cél %</span>
					<input type="number" min="0" max="100" step="5" bind:value={tMin} aria-label="Minimum pont százalék" class="mt-0.5 w-full bg-transparent text-center text-[16px] font-extrabold text-ink-900 outline-none tabular-nums dark:text-white" />
				</label>
				<label class="rounded-xl bg-white px-2.5 py-2 text-center dark:bg-white/10">
					<span class="block text-[11px] font-bold text-stone-400 uppercase">Próba</span>
					<input type="number" min="0" max="20" bind:value={tAttempts} aria-label="Próbálkozások száma" class="mt-0.5 w-full bg-transparent text-center text-[16px] font-extrabold text-ink-900 outline-none tabular-nums dark:text-white" />
				</label>
				<label class="rounded-xl bg-white px-2.5 py-2 text-center dark:bg-white/10">
					<span class="block text-[11px] font-bold text-stone-400 uppercase">Perc</span>
					<input type="number" min="0" max="180" bind:value={tTime} aria-label="Időkorlát percben" class="mt-0.5 w-full bg-transparent text-center text-[16px] font-extrabold text-ink-900 outline-none tabular-nums dark:text-white" />
				</label>
			</div>
		</section>

		<section class="mt-2.5 divide-y divide-stone-200 rounded-2xl bg-stone-100 px-3.5 dark:divide-white/10 dark:bg-white/5" aria-label="Beállítások">
			<label class="flex cursor-pointer items-center gap-3 py-3">
				<span class="min-w-0 flex-1">
					<span class="block text-[14px] font-bold text-ink-900 dark:text-white">Keverés</span>
					<span class="block text-[12px] text-stone-500 dark:text-stone-400">Más sorrend mindenkinek</span>
				</span>
				<input type="checkbox" bind:checked={tShuffle} class="size-5 shrink-0 accent-emerald-500" />
			</label>
			<label class="flex cursor-pointer items-center gap-3 py-3">
				<span class="min-w-0 flex-1">
					<span class="block text-[14px] font-bold text-ink-900 dark:text-white">Eredmény csak határidő után</span>
					<span class="block text-[12px] text-stone-500 dark:text-stone-400">Addig csak a beadás látszik</span>
				</span>
				<input type="checkbox" bind:checked={tDelayed} class="size-5 shrink-0 accent-emerald-500" />
			</label>
		</section>

		{#if tMsg}
			<p class="mt-2.5 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-center text-[13px] font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">{tMsg}</p>
		{/if}
		<button
			onclick={() => void submitTask()}
			disabled={busy}
			class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 py-3.5 text-[15px] font-bold text-white transition hover:brightness-95 active:scale-[0.99] disabled:opacity-60"
		>
			<ClipboardList size={18} /> {busy ? 'Kiadás…' : 'Feladat kiadása'}
		</button>
	</div>
</Drawer>

<!-- DOLGOZAT drawer: kvízből ÉS kártyacsomagból is -->
<Drawer open={drawer === 'exam'} label="Új dolgozat" wide onClose={() => (drawer = null)}>
	<div class="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
		<h2 class="font-display text-[24px] font-bold tracking-tight text-ink-900 dark:text-white">Dolgozat indítása</h2>
		<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Kvízből vagy kártyacsomagból — 1 próbálkozás, szigorú.</p>

		<section class="mt-4 rounded-2xl bg-red-50/60 p-3.5 dark:bg-red-400/10" aria-label="Forrás">
			<p class="text-[12px] font-extrabold tracking-wide text-red-400 uppercase dark:text-red-300">1 · Forrás</p>
			<div class="mt-2 grid grid-cols-2 gap-1.5" role="tablist" aria-label="Forrás">
				{#each [{ id: 'quiz', label: 'Kvízből' }, { id: 'deck', label: 'Kártyából' }] as m (m.id)}
					<button
						role="tab"
						aria-selected={eMode === m.id}
						onclick={() => (eMode = m.id as typeof eMode)}
						class={['rounded-xl py-2.5 text-[14px] font-bold transition active:scale-95', eMode === m.id ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-ink-600 dark:bg-white/10 dark:text-stone-300']}
					>
						{m.label}
					</button>
				{/each}
			</div>
			{#if eMode === 'quiz'}
				<button
					onclick={() => void openPicker('exam-quiz', 'quiz', true)}
					class="mt-2 flex w-full items-center gap-2.5 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-left transition hover:border-red-400 active:scale-[0.99] dark:border-white/15 dark:bg-white/5"
				>
					<ClipboardList size={18} class="shrink-0 text-red-500" />
					<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
						{eQuizzes.length === 0 ? 'Válassz kvízeket… (több is mehet)' : eQuizzes.length === 1 ? eQuizzes[0].title : `${eQuizzes.length} kvíz kiválasztva`}
					</span>
					<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
				</button>
				{#if eQuizzes.length > 1}
					<div class="mt-1.5 flex flex-wrap gap-1.5">
						{#each eQuizzes as qz (qz.id)}
							<button
								onclick={() => (eQuizzes = eQuizzes.filter((x) => x.id !== qz.id))}
								title="Eltávolítás"
								class="inline-flex max-w-full items-center gap-1 rounded-full bg-ink-900 py-1 pr-2 pl-3 text-[12px] font-bold text-white dark:bg-white dark:text-ink-900"
							>
								<span class="truncate">{qz.title}</span> ✕
							</button>
						{/each}
					</div>
				{/if}
			{:else}
				<button
					onclick={() => void openPicker('exam-deck', 'deck', true)}
					class="mt-2 flex w-full items-center gap-2.5 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-left transition hover:border-red-400 active:scale-[0.99] dark:border-white/15 dark:bg-white/5"
				>
					<Layers size={18} class="shrink-0 text-emerald-600 dark:text-emerald-300" />
					<span class="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-900 dark:text-white">
						{eDecks.length === 0 ? 'Válassz csomagokat… (több is mehet)' : `${eDecks.length} csomag kiválasztva`}
					</span>
					<ChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />
				</button>
				{#if eDecks.length > 0}
					<div class="mt-1.5 flex flex-wrap gap-1.5">
						{#each eDecks as deck (deck.id)}
							<button
								onclick={() => (eDecks = eDecks.filter((x) => x.id !== deck.id))}
								title="Eltávolítás"
								class="inline-flex max-w-full items-center gap-1 rounded-full bg-ink-900 py-1 pr-2 pl-3 text-[12px] font-bold text-white dark:bg-white dark:text-ink-900"
							>
								<span class="truncate">{deck.title}</span> ✕
							</button>
						{/each}
					</div>
				{/if}
				<div class="mt-2 flex items-center gap-2 rounded-xl bg-white px-3 py-2 dark:bg-white/10">
					<span class="flex-1 text-[13px] font-bold text-ink-900 dark:text-white">Kérdésszám</span>
					<input type="number" min="3" max="30" bind:value={eCount} aria-label="Kérdésszám" class="w-16 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-center font-extrabold tabular-nums dark:border-white/15 dark:bg-white/5 dark:text-white" />
				</div>
			{/if}
		</section>

		<section class="mt-2.5 rounded-2xl bg-stone-100 p-3.5 dark:bg-white/5" aria-label="Elvárások">
			<p class="text-[12px] font-extrabold tracking-wide text-stone-400 uppercase dark:text-stone-500">2 · Elvárások</p>
			<label class="mt-2 block text-[13px] font-semibold text-ink-900 dark:text-white">
				Határidő
				<input type="datetime-local" bind:value={eDue} aria-label="Határidő" class="mt-1 {input}" />
			</label>
			<div class="mt-2 grid grid-cols-2 gap-1.5">
				<label class="rounded-xl bg-white px-2.5 py-2 text-center dark:bg-white/10">
					<span class="block text-[11px] font-bold text-stone-400 uppercase">Idő (perc)</span>
					<input type="number" min="0" max="180" bind:value={eTime} aria-label="Időkorlát percben" class="mt-0.5 w-full bg-transparent text-center text-[16px] font-extrabold text-ink-900 outline-none tabular-nums dark:text-white" />
				</label>
				<label class="rounded-xl bg-white px-2.5 py-2 text-center dark:bg-white/10">
					<span class="block text-[11px] font-bold text-stone-400 uppercase">Cél %</span>
					<input type="number" min="0" max="100" step="5" bind:value={eMin} aria-label="Minimum pont százalék" class="mt-0.5 w-full bg-transparent text-center text-[16px] font-extrabold text-ink-900 outline-none tabular-nums dark:text-white" />
				</label>
			</div>
		</section>

		{#if eMsg}
			<p class="mt-2.5 rounded-xl bg-red-50 px-3.5 py-2.5 text-center text-[13px] font-bold text-red-700 dark:bg-red-400/10 dark:text-red-300">{eMsg}</p>
		{/if}
		<button
			onclick={() => void submitExam()}
			disabled={busy}
			class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-red-600 py-3.5 text-[15px] font-bold text-white transition hover:brightness-95 active:scale-[0.99] disabled:opacity-60"
		>
			<FileText size={18} /> {busy ? 'Indítás…' : 'Dolgozat indítása'}
		</button>
	</div>
</Drawer>

<!-- Tartalomválasztó: minden osztály-megosztás innen választ (témakör -> lecke leolvasással) -->
{#if picker}
	{@const pickerTitle =
		picker.key === 'share-lesson' || picker.key === 'task-lesson'
			? 'Lecke választása'
			: picker.key === 'exam-deck'
				? 'Csomagok választása'
				: picker.key === 'share-deck'
					? 'Kártyacsomag választása'
					: picker.key === 'share-topic'
						? 'Témakör választása'
						: 'Kvíz választása'}
	<ContentPicker
		open={true}
		kind={picker.kind}
		title={pickerTitle}
		topics={libTopics}
		decks={libDecks}
		quizzes={libQuizzes}
		multiple={picker.multiple}
		selected={picker.key === 'exam-deck' ? eDecks.map((d) => d.id) : picker.key === 'exam-quiz' ? eQuizzes.map((x) => x.id) : []}
		loadLessons={fetchLessons}
		onSelect={onPick}
		onMulti={onPickMulti}
		onClose={() => (picker = null)}
	/>
{/if}
