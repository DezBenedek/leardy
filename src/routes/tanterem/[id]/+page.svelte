<script lang="ts">
	import { createBackNavigation } from '$lib/platform/back-navigation';
	import { attachmentTitle } from '$lib/content/message-attachments';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		ChevronRight,
		ClipboardList,
		FileText,
		Megaphone,
		Plus,
		Radio,
		Save,
		Settings,
		Trash2
	} from '@lucide/svelte';
	import AssignmentImageEditor from '$lib/components/AssignmentImageEditor.svelte';
	import AssignmentAudioRecorder from '$lib/components/AssignmentAudioRecorder.svelte';
	import ClassStats from '$lib/components/ClassStats.svelte';
	import AttachSheet, { type AttachPick } from '$lib/components/AttachSheet.svelte';
	import AttachPickSheet, { type AttachKind } from '$lib/components/AttachPickSheet.svelte';
	import ContentPicker, { type ContentPick } from '$lib/components/ContentPicker.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import QuizModal from '$lib/components/QuizModal.svelte';
	import QuizRunner, { type QuizMiss } from '$lib/components/QuizRunner.svelte';
	import { loadQuizReview, saveQuizReview, type QuizReview } from '$lib/quiz/quiz-review';
	import { loadSettings, saveSettings as saveAppSettings, toggleClassroomMuted } from '$lib/state/settings';
	import type { Subject } from '$lib/curriculum/curriculum';
	import type { QuizQuestion } from '$lib/curriculum/curriculum';
	import { toast } from '$lib/state/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import type { PageData } from './$types';
	import { fmtDate, fmtDuration, fmtTime, toDueInput } from './classroom-format';
	import {
		audioFileName,
		draftSummary,
		messageChips,
		parseTaskLessons,
		taskLessonTitle,
		type AssignmentMine,
		type AssignmentRow,
		type FeedAssignment,
		type FeedItem,
		type FeedMessage,
		type FeedTask,
		type LiveRow,
		type Member,
		type UploadItem
	} from './classroom-task-utils';
	import {
		apiAssignmentSubmissions,
		apiBrowse,
		apiContent,
		apiCreateAssignment,
		apiCreateMessage,
		apiCreateTask,
		apiDeleteAssignment,
		apiDeleteClassroom,
		apiDeleteLive,
		apiDeleteMessage,
		apiDeleteUpload,
		apiKick,
		apiLeave,
		apiLibrary,
		apiLoadLive,
		apiMineMap,
		apiPatchAssignment,
		apiPatchClassroom,
		apiPatchMessage,
		apiPatchTask,
		apiPostAssignmentSubmission,
		apiPostTaskSubmission,
		apiPublishLive,
		apiRegenCode,
		apiTaskQuiz,
		apiTaskSubmissions,
		apiUploadAssignment
	} from './classroom-api';
	import FeedList from './FeedList.svelte';
	import MessageDetail from './MessageDetail.svelte';
	import TaskDetail from './TaskDetail.svelte';
	import AssignmentDetail from './AssignmentDetail.svelte';
	import CreateMessageForm from './CreateMessageForm.svelte';
	import CreateTaskForm from './CreateTaskForm.svelte';
	import CreateAssignmentForm from './CreateAssignmentForm.svelte';
	import ClassroomSettingsDrawer from './ClassroomSettingsDrawer.svelte';
	import MembersDrawer from './MembersDrawer.svelte';
	import GradingDrawer from './GradingDrawer.svelte';
	import ImagePreviewOverlay from './ImagePreviewOverlay.svelte';

	let { data }: { data: PageData } = $props();
	let room = $derived(data.room);

	let messages = $state<FeedMessage[]>([]);
	let tasks = $state<FeedTask[]>([]);
	let assignments = $state<FeedAssignment[]>([]);
	let members = $state<Member[]>([]);
	let liveSessions = $state<LiveRow[]>([]);
	let activeLive = $derived(liveSessions.filter((s) => s.status === 'live' || s.status === 'lobby'));
	let draftLive = $derived(liveSessions.filter((s) => s.status === 'draft'));
	let pastLive = $derived(liveSessions.filter((s) => s.status === 'done'));
	let publishingId = $state<string | null>(null);
	let deletingDraftId = $state<string | null>(null);
	let deletingDraft = $state(false);

	async function publishDraft(id: string) {
		if (publishingId) return;
		publishingId = id;
		try {
			const res = await apiPublishLive(id);
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült meghirdetni', j.error ?? 'Próbáld újra!');
				return;
			}
			toast.success('Élő dolgozat meghirdetve');
			await loadLive();
		} finally {
			publishingId = null;
		}
	}

	async function deleteDraft() {
		const id = deletingDraftId;
		if (!id || deletingDraft) return;
		deletingDraft = true;
		try {
			const res = await apiDeleteLive(id);
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült törölni', j.error ?? 'Próbáld újra!');
				return;
			}
			deletingDraftId = null;
			toast.success('Piszkozat törölve');
			await loadLive();
		} finally {
			deletingDraft = false;
		}
	}
	let displayName = $state('');
	let displaySubject = $state('');
	let displayCode = $state('');
	let seeded = $state(false);
	let seededData: PageData | undefined;

	let feed = $derived<FeedItem[]>(
		[
			...messages.map((msg) => ({ kind: 'message' as const, ts: msg.created_at, msg })),
			...tasks.map((task) => ({ kind: 'task' as const, ts: task.created_at, task })),
			...assignments.map((a) => ({ kind: 'assignment' as const, ts: a.created_at, assignment: a }))
		].sort((a, b) => b.ts - a.ts)
	);

	let detailMsg = $state<FeedMessage | null>(null);
	let detailTask = $state<FeedTask | null>(null);
	let detailAssignment = $state<FeedAssignment | null>(null);

	function openDetail(kind: 'message' | 'task' | 'assignment', id: string) {
		const url = new URL(window.location.href);
		url.searchParams.set('drawer', kind);
		url.searchParams.set('item', id);
		replaceState(url, { ...page.state, classroomDetail: { kind, id } });
	}

	let restoredDetailKey = '';
	$effect(() => {
		if (!seeded) return;
		const detail = page.state.classroomDetail;
		const kind = detail === undefined ? page.url.searchParams.get('drawer') : detail?.kind;
		const id = detail === undefined ? page.url.searchParams.get('item') : detail?.id;
		const key = `${room.id}:${kind}:${id}`;
		if (key === restoredDetailKey) return;
		restoredDetailKey = key;
		untrack(() => {
			closeDetail(false);
			if (kind === 'message') detailMsg = messages.find((item) => item.id === id) ?? null;
			if (kind === 'task') detailTask = tasks.find((item) => item.id === id) ?? null;
			if (kind === 'assignment') detailAssignment = assignments.find((item) => item.id === id) ?? null;
		});
	});

	interface MySubmission {
		best_score: number;
		best_total: number;
		best_pct: number;
		attempts: number;
		submitted: number;
		submitted_at: number | null;
	}
	interface TaskResultRow {
		user_id: string;
		name: string;
		best_score: number | null;
		best_total: number | null;
		best_pct: number | null;
		attempts: number | null;
		submitted: number | null;
		submitted_at: number | null;
	}

	/** Falon a kész jelöléshez: feladat id -> saját állapot (diákoknak). */
	let myMap = $state<Record<string, { best_pct: number; submitted: boolean }>>({});
	/** Falon a beadandó jegy/pipa jelvényhez: beadandó id -> saját állapot (diákoknak). */
	let assignmentMap = $state<Record<string, { submitted: boolean; grade: number | null }>>({});
	/** Nyitott feladat saját beküldése / tanári eredménylista. */
	let myResult = $state<MySubmission | null>(null);
	let taskResults = $state<TaskResultRow[]>([]);
	let resultsLoading = $state(false);
	let submitBusy = $state(false);
	/** Nyitott feladat utolsó kitöltésének átnézete. */
	let lastReview = $state<QuizReview | null>(null);

	function closeDetail(clearUrl = true) {
		if (clearUrl && (page.state.classroomDetail || new URL(window.location.href).searchParams.has('drawer'))) {
			const url = new URL(window.location.href);
			url.searchParams.delete('drawer');
			url.searchParams.delete('item');
			replaceState(url, { ...page.state, classroomDetail: null });
		}
		detailMsg = null;
		detailTask = null;
		detailAssignment = null;
		myResult = null;
		taskResults = [];
		lastReview = null;
		assignmentMine = null;
		assignmentUploads = [];
		assignmentResults = [];
		gradingStudent = null;
		previewUpload = null;
		assignmentTextSaved = false;
		if (assignmentTextTimer) {
			clearTimeout(assignmentTextTimer);
			assignmentTextTimer = null;
		}
		editingMsg = false;
		editingTask = false;
		editingAssignment = false;
		editError = null;
	}

	async function loadMineMap() {
		if (data.own) return;
		try {
			const res = await apiMineMap(room.id);
			const j = await res.json().catch(() => ({}));
			if (res.ok && j.mine) myMap = j.mine;
			if (res.ok && j.assignments) assignmentMap = j.assignments;
		} catch {
			// csendben: a fal jelölés nélkül is jó
		}
	}

	async function loadTaskResults(taskId: string) {
		resultsLoading = true;
		try {
			const res = await apiTaskSubmissions(room.id, taskId);
			const j = await res.json().catch(() => ({}));
			if (!res.ok) return;
			if (data.own && Array.isArray(j.results)) taskResults = j.results;
			else if (j.mine) myResult = j.mine;
			else myResult = null;
		} catch {
			// csendben
		} finally {
			resultsLoading = false;
		}
	}

	$effect(() => {
		const t = detailTask;
		myResult = null;
		taskResults = [];
		lastReview = t ? loadQuizReview(room.id, t.id) : null;
		if (t) void loadTaskResults(t.id);
	});

	async function toggleSubmit(task: FeedTask, want: boolean) {
		if (submitBusy) return;
		submitBusy = true;
		try {
			const res = await apiPostTaskSubmission(room.id, task.id, { submitted: want });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült', j.error ?? 'Próbáld újra!');
				return;
			}
			myResult = j.mine ?? null;
			myMap = {
				...myMap,
				[task.id]: {
					best_pct: j.mine?.best_pct ?? 0,
					submitted: (j.mine?.submitted ?? 0) === 1
				}
			};
			toast.success(want ? 'Beküldve' : 'Visszavonva');
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			submitBusy = false;
		}
	}

	// ---------- Bejegyzés szerkesztése (tanár) ----------

	let editingMsg = $state(false);
	let deleteMessageOpen = $state(false);
	let deletingMessage = $state(false);
	async function deleteMessage() {
		if (!detailMsg || !data.own || deletingMessage) return;
		const id = detailMsg.id;
		deletingMessage = true;
		try {
			const response = await apiDeleteMessage(room.id, id);
			if (!response.ok) {
				const result = await response.json().catch(() => ({}));
				throw new Error(result.error ?? 'Nem sikerült törölni az üzenetet.');
			}
			messages = messages.filter((message) => message.id !== id);
			deleteMessageOpen = false;
			closeDetail();
			toast.success('Üzenet törölve');
		} catch (error) {
			deleteMessageOpen = false;
			toast.error('Sikertelen törlés', error instanceof Error ? error.message : 'Próbáld újra!');
		} finally {
			deletingMessage = false;
		}
	}
	let editingTask = $state(false);
	let editError = $state<string | null>(null);
	let savingEdit = $state(false);
	let editMsgTitle = $state('');
	let editMsgBody = $state('');
	let editAttaches = $state<AttachPick[]>([]);
	let attachTarget = $state<'new' | 'edit'>('new');
	let editTaskTitle = $state('');
	let editTaskLessons = $state<ContentPick[]>([]);
	let taskPickerTarget = $state<'new' | 'edit'>('new');
	let editTaskCount = $state(10);
	let editTaskTarget = $state(80);
	let editTaskDue = $state('');

	async function openEdit() {
		if (detailTask) await ensureSubjects();
		editError = null;
		if (detailMsg && data.own) {
			editMsgTitle = detailMsg.title;
			editMsgBody = detailMsg.body;
			editAttaches = messageChips(detailMsg).map((r) => ({ type: r.ref_type as AttachPick['type'], id: r.ref_id, title: r.ref_title, crumb: attachmentTitle(r.ref_title, displaySubject) }));
			editingMsg = true;
		} else if (detailTask && data.own) {
			editTaskTitle = detailTask.title;
			editTaskLessons = parseTaskLessons(detailTask).map((l) => ({ kind: 'lesson', subjectId: classroomSubjectId, subjectTitle: displaySubject,
				levelId: '', levelTitle: '', levelLabel: 'Tananyag', topicId: '', topicTitle: '', lessonId: l.id, lessonTitle: l.title, quizCount: 1, crumb: l.title }));
			editTaskCount = detailTask.question_count;
			editTaskTarget = detailTask.target_pct;
			editTaskDue = toDueInput(detailTask.due_date);
			editingTask = true;
		} else if (detailAssignment && data.own) {
			openAssignmentEdit();
		}
	}

	async function saveMsgEdit(e: SubmitEvent) {
		e.preventDefault();
		if (!detailMsg || savingEdit) return;
		savingEdit = true;
		editError = null;
		try {
			const res = await apiPatchMessage(room.id, detailMsg.id, { title: editMsgTitle, body: editMsgBody,
				refs: editAttaches.map((a) => ({ ref_type: a.type, ref_id: a.id, ref_title: a.crumb })) });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				editError = j.error ?? 'Nem sikerült menteni.';
				return;
			}
			const updated = { ...detailMsg, title: j.title, body: j.body, refs: j.refs, ref_type: j.refs[0]?.ref_type ?? null, ref_id: j.refs[0]?.ref_id ?? null, ref_title: j.refs[0]?.ref_title ?? null };
			messages = messages.map((m) => m.id === updated.id ? updated : m);
			detailMsg = updated;
			editingMsg = false;
			toast.success('Üzenet frissítve');
		} catch {
			editError = 'Hálózati hiba. Próbáld újra!';
		} finally {
			savingEdit = false;
		}
	}

	async function saveTaskEdit(e: SubmitEvent) {
		e.preventDefault();
		if (!detailTask || savingEdit) return;
		if (!editTaskLessons.length) { editError = 'Válassz legalább egy leckét!'; return; }
		savingEdit = true;
		editError = null;
		let due: number | null = null;
		if (editTaskDue.trim() !== '') {
			const t = new Date(editTaskDue).getTime();
			if (!Number.isFinite(t)) {
				editError = 'Hibás határidő.';
				savingEdit = false;
				return;
			}
			due = t;
		}
		try {
			const res = await apiPatchTask(room.id, detailTask.id, {
				title: editTaskTitle,
				lessons: editTaskLessons.map((p) => ({ id: p.lessonId, title: taskLessonTitle(p) })),
				question_count: editTaskCount,
				target_pct: editTaskTarget,
				due_date: due
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				editError = j.error ?? 'Nem sikerült menteni.';
				return;
			}
			tasks = tasks.map((t) =>
				t.id === detailTask!.id
					? { ...t, title: j.title, lesson_ids_json: j.lesson_ids_json ?? t.lesson_ids_json, question_count: j.question_count, target_pct: j.target_pct, due_date: j.due_date }
					: t
			);
			detailTask = {
				...detailTask,
				lesson_ids_json: j.lesson_ids_json ?? detailTask.lesson_ids_json,
				title: j.title,
				question_count: j.question_count,
				target_pct: j.target_pct,
				due_date: j.due_date
			};
			editingTask = false;
			toast.success('Feladat frissítve');
		} catch {
			editError = 'Hálózati hiba. Próbáld újra!';
		} finally {
			savingEdit = false;
		}
	}

	// ---------- Feladat kitöltése ----------

	let quizQuestions = $state<QuizQuestion[]>([]);
	let quizTitle = $state('');
	let quizOpen = $state(false);
	let quizLoading = $state(false);

	async function startTaskQuiz(task: FeedTask) {
		if (quizLoading) return;
		quizLoading = true;
		try {
			const res = await apiTaskQuiz(room.id, task.id);
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült összeállítani', j.error ?? 'Próbáld újra!');
				return;
			}
			if (!Array.isArray(j.questions) || j.questions.length === 0) {
				toast.error('Nincs kérdés', 'A leckékhez még nincs kvíz.');
				return;
			}
			quizQuestions = j.questions as QuizQuestion[];
			quizTitle = task.title || 'Kvízfeladat';
			quizOpen = true;
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			quizLoading = false;
		}
	}

	async function onQuizDone(score: number, total: number, missed: QuizMiss[] = []) {
		const pct = total > 0 ? Math.round((score / total) * 100) : 0;
		const task = detailTask;
		if (!task || data.own) return;
		const r: QuizReview = { score, total, pct, at: Date.now(), missed };
		lastReview = r;
		saveQuizReview(room.id, task.id, r);
		try {
			const res = await apiPostTaskSubmission(room.id, task.id, { score, total });
			const j = await res.json().catch(() => ({}));
			if (res.ok && j.mine) {
				myResult = j.mine;
				myMap = {
					...myMap,
					[task.id]: { best_pct: j.mine.best_pct ?? pct, submitted: (j.mine.submitted ?? 0) === 1 }
				};
			}
		} catch {
			// a pontszám mentése nem kritikus a visszajelzéshez
		}
	}

	async function loadLive() {
		try {
			const res = await apiLoadLive(room.id);
			const j = await res.json().catch(() => ({}));
			if (res.ok && Array.isArray(j.sessions)) liveSessions = j.sessions;
		} catch {
			// csendben: a fal a dolgozatsáv nélkül is teljes
		}
	}

	onMount(() => {
		void loadLive();
		const timer = setInterval(() => void loadLive(), 20_000);
		return () => clearInterval(timer);
	});

	$effect(() => {
		if (seededData !== data) {
			messages = [...data.messages];
			tasks = [...data.tasks];
			assignments = [...(data.assignments ?? [])];
			members = [...data.members];
			displayName = data.room.name;
			displaySubject = data.room.subject ?? '';
			displayCode = data.room.code;
			seeded = true;
			seededData = data;
			void loadMineMap();
			void loadLive();
		}
	});

	type Sheet = null | 'choice' | 'message' | 'task' | 'assignment' | 'settings';
	let sheet = $state<Sheet>(null);
	let membersOpen = $state(false);

	function closeSheet() {
		sheet = null;
		deleteOpen = false;
		confirmKickId = null;
		confirmLeave = false;
		msgError = null;
		taskError = null;
		assignmentError = null;
	}

	const goBack = createBackNavigation(() => resolve('/tanterem'));

	// ---------- Osztálybeállítások (egyetlen fogaskerék, drawer) ----------

	let roomNotif = $state(true);
	let roomNotifInit = $state(false);
	let leaving = $state(false);
	let confirmLeave = $state(false);

	$effect(() => {
		try {
			roomNotif = !(loadSettings().mutedClassrooms ?? []).includes(room.id);
		} catch {
			roomNotif = true;
		}
		roomNotifInit = true;
	});

	// A drawerben a Switch közvetlenül a roomNotif állapotot írja, itt csak mentünk.
	$effect(() => {
		if (!roomNotifInit) return;
		const wantMuted = !roomNotif;
		try {
			const s = loadSettings();
			const has = (s.mutedClassrooms ?? []).includes(room.id);
			if (has !== wantMuted) {
				saveAppSettings({ ...s, mutedClassrooms: toggleClassroomMuted(s, room.id) });
			}
		} catch {
			// nem kritikus
		}
	});

	async function leaveClass() {
		if (leaving) return;
		leaving = true;
		try {
			const res = await apiLeave(room.id);
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült kilépni', j.error ?? 'Próbáld újra!');
				return;
			}
			toast.success('Kiléptél az osztályból');
			await goto('/tanterem');
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			leaving = false;
		}
	}

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(displayCode);
			toast.success('Kód másolva', displayCode);
		} catch {
			toast.error('Másolás sikertelen', displayCode);
		}
	}

	// ---------- Közös tananyag-betöltés a választókhoz ----------

	interface DeckOpt {
		quizId: string;
		title: string;
	}

	let subjects = $state<Subject[]>([]);
	let subjectsLoaded = $state(false);
	let decks = $state<DeckOpt[]>([]);
	let decksLoaded = $state(false);

	let classroomSubjectId = $derived(subjects.find((s) => s.id === displaySubject || s.title.toLocaleLowerCase('hu-HU') === displaySubject.trim().toLocaleLowerCase('hu-HU'))?.id ?? '');

	async function ensureSubjects() {
		if (subjectsLoaded) return;
		try {
			const res = await apiBrowse();
			const j = await res.json().catch(() => ({}));
			if (res.ok && Array.isArray(j.subjects)) {
				subjects = j.subjects as Subject[];
				subjectsLoaded = true;
			}
		} catch {
			// csendben: az űrlap hiba nélkül marad
		}
	}

	async function ensureDecks() {
		if (decksLoaded) return;
		try {
			const res = await apiLibrary();
			const j = await res.json().catch(() => ({}));
			if (res.ok && Array.isArray(j.packages)) {
				decks = j.packages.map((p: { quizId: string; title: string }) => ({
					quizId: p.quizId,
					title: p.title
				}));
				decksLoaded = true;
			}
		} catch {
			// csendben
		}
	}

	const inputCls =
		'w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:ring-brand-500/20';

	// ---------- Üzenet ----------

	let msgTitle = $state('');
	let msgBody = $state('');
	let attaches = $state<AttachPick[]>([]);
	let attachOpen = $state(false);
	let sendingMsg = $state(false);
	let msgError = $state<string | null>(null);

	function openMessage() {
		sheet = 'message';
		ensureSubjects();
		ensureDecks();
	}

	async function openAttach(target: 'new' | 'edit' = 'new') {
		attachTarget = target;
		await Promise.all([ensureSubjects(), ensureDecks()]);
		attachOpen = true;
	}

	async function sendMessage(e: SubmitEvent) {
		e.preventDefault();
		if (sendingMsg) return;
		msgError = null;
		sendingMsg = true;
		try {
			const res = await apiCreateMessage(room.id, {
				title: msgTitle,
				body: msgBody,
				refs: attaches.map((a) => ({
					ref_type: a.type,
					ref_id: a.id,
					ref_title: a.crumb
				}))
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				msgError = j.error ?? 'Nem sikerült elküldeni.';
				return;
			}
			const list = await apiContent(room.id).then((r) =>
				r.json().catch(() => ({}))
			);
			if (Array.isArray(list.messages)) messages = list.messages;
			msgTitle = '';
			msgBody = '';
			attaches = [];
			sheet = null;
			toast.success('Üzenet elküldve');
		} catch {
			msgError = 'Hálózati hiba. Próbáld újra!';
		} finally {
			sendingMsg = false;
		}
	}

	// ---------- Feladat ----------

	let taskTitle = $state('');
	let taskLessons = $state<ContentPick[]>([]);
	let taskPickerOpen = $state(false);
	let questionCount = $state(10);
	let targetPct = $state(80);
	let shuffleMode = $state('mixed');
	let dueInput = $state('');
	let creatingTask = $state(false);
	let taskError = $state<string | null>(null);

	function openTask() {
		sheet = 'task';
		ensureSubjects();
	}

	async function createTask(e: SubmitEvent) {
		e.preventDefault();
		if (creatingTask) return;
		taskError = null;
		if (taskLessons.length === 0) {
			taskError = 'Válassz legalább egy leckét!';
			return;
		}
		let due: number | null = null;
		if (dueInput.trim() !== '') {
			const t = new Date(dueInput).getTime();
			if (!Number.isFinite(t)) {
				taskError = 'Hibás határidő.';
				return;
			}
			due = t;
		}
		creatingTask = true;
		try {
			const res = await apiCreateTask(room.id, {
				title: taskTitle,
				lessons: taskLessons.map((p) => ({ id: p.lessonId, title: taskLessonTitle(p) })),
				question_count: questionCount,
				target_pct: targetPct,
				shuffle: shuffleMode === 'mixed' ? 1 : 0,
				due_date: due
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				taskError = j.error ?? 'Nem sikerült létrehozni.';
				return;
			}
			const list = await apiContent(room.id).then((r) =>
				r.json().catch(() => ({}))
			);
			if (Array.isArray(list.tasks)) tasks = list.tasks;
			taskTitle = '';
			taskLessons = [];
			dueInput = '';
			sheet = null;
			toast.success('Feladat kiosztva');
		} catch {
			taskError = 'Hálózati hiba. Próbáld újra!';
		} finally {
			creatingTask = false;
		}
	}

	// ---------- Beadandó ----------

	let assignmentTitle = $state('');
	let assignmentDesc = $state('');
	let assignmentDue = $state('');
	let assignmentRequireText = $state(true);
	let assignmentRequireImages = $state(false);
	let assignmentRequireFiles = $state(false);
	let assignmentRequireAudio = $state(false);
	let creatingAssignment = $state(false);
	let assignmentError = $state<string | null>(null);

	let editingAssignment = $state(false);
	let editAssignmentTitle = $state('');
	let editAssignmentDesc = $state('');
	let editAssignmentDue = $state('');
	let editAssignmentRequireText = $state(true);
	let editAssignmentRequireImages = $state(false);
	let editAssignmentRequireFiles = $state(false);
	let editAssignmentRequireAudio = $state(false);

	let assignmentMine = $state<AssignmentMine | null>(null);
	let assignmentUploads = $state<UploadItem[]>([]);
	let assignmentResults = $state<AssignmentRow[]>([]);
	let assignmentLoading = $state(false);
	let assignmentText = $state('');
	let assignmentSaving = $state(false);
	/** Automatikus mentés jelzése a karakterszám mellett. */
	let assignmentTextSaved = $state(false);
	let assignmentTextTimer: ReturnType<typeof setTimeout> | null = null;
	let assignmentSubmitBusy = $state(false);
	let assignmentUploadBusy = $state(false);
	let imageEditorOpen = $state(false);
	let audioRecorderOpen = $state(false);
	let fileInputEl: HTMLInputElement | null = $state(null);
	let attachPickOpen = $state(false);

	/** Csatolmányválasztó: a beadandó követelményei szerint nyitja a megfelelő feltöltőt. */
	function onAttachPick(kind: AttachKind) {
		if (kind === 'image') imageEditorOpen = true;
		else if (kind === 'audio') audioRecorderOpen = true;
		else fileInputEl?.click();
	}
	let confirmDeleteAssignment = $state(false);
	let deletingAssignment = $state(false);
	let statsOpen = $state(false);
	/** Tanári beküldéslista: kiválasztott diák részletező drawerhez. */
	let gradingStudent = $state<AssignmentRow | null>(null);
	/** Kép előnézet a tanári részletezőben. */
	let previewUpload = $state<UploadItem | null>(null);

	function onGradeSaved(userId: string, grade: number | null, feedback: string) {
		assignmentResults = assignmentResults.map((r) =>
			r.user_id === userId ? { ...r, grade, feedback, graded_at: grade !== null || feedback !== '' ? Date.now() : null } : r
		);
		if (gradingStudent?.user_id === userId) {
			gradingStudent = { ...gradingStudent, grade, feedback, graded_at: grade !== null || feedback !== '' ? Date.now() : null };
		}
	}

	function openAssignmentSheet() {
		sheet = 'assignment';
		assignmentError = null;
	}

	async function refreshAssignments() {
		const list = await apiContent(room.id).then((r) =>
			r.json().catch(() => ({}))
		);
		if (Array.isArray(list.assignments)) assignments = list.assignments;
		if (Array.isArray(list.tasks)) tasks = list.tasks;
		if (Array.isArray(list.messages)) messages = list.messages;
	}

	async function createAssignment(e: SubmitEvent) {
		e.preventDefault();
		if (creatingAssignment) return;
		assignmentError = null;
		if (assignmentTitle.trim().length < 3) {
			assignmentError = 'Adj legalább 3 karakteres címet!';
			return;
		}
		if (!assignmentRequireText && !assignmentRequireImages && !assignmentRequireFiles && !assignmentRequireAudio) {
			assignmentError = 'Válassz legalább egy követelményt: szöveg, kép, hang vagy fájl!';
			return;
		}
		let due: number | null = null;
		if (assignmentDue.trim() !== '') {
			const t = new Date(assignmentDue).getTime();
			if (!Number.isFinite(t)) {
				assignmentError = 'Hibás határidő.';
				return;
			}
			due = t;
		}
		creatingAssignment = true;
		try {
			const res = await apiCreateAssignment(room.id, {
				title: assignmentTitle,
				description: assignmentDesc,
				due_date: due,
				require_text: assignmentRequireText,
				require_images: assignmentRequireImages,
				require_files: assignmentRequireFiles,
				require_audio: assignmentRequireAudio
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				assignmentError = j.error ?? 'Nem sikerült létrehozni.';
				return;
			}
			await refreshAssignments();
			assignmentTitle = '';
			assignmentDesc = '';
			assignmentDue = '';
			sheet = null;
			toast.success('Beadandó kiosztva');
		} catch {
			assignmentError = 'Hálózati hiba. Próbáld újra!';
		} finally {
			creatingAssignment = false;
		}
	}

	function openAssignmentEdit() {
		if (!detailAssignment || !data.own) return;
		editError = null;
		editAssignmentTitle = detailAssignment.title;
		editAssignmentDesc = detailAssignment.description ?? '';
		editAssignmentDue = toDueInput(detailAssignment.due_date);
		editAssignmentRequireText = detailAssignment.require_text === 1;
		editAssignmentRequireImages = detailAssignment.require_images === 1;
		editAssignmentRequireFiles = detailAssignment.require_files === 1;
		editAssignmentRequireAudio = (detailAssignment.require_audio ?? 0) === 1;
		confirmDeleteAssignment = false;
		editingAssignment = true;
	}

	async function saveAssignmentEdit(e: SubmitEvent) {
		e.preventDefault();
		if (!detailAssignment || savingEdit) return;
		savingEdit = true;
		editError = null;
		let due: number | null = null;
		if (editAssignmentDue.trim() !== '') {
			const t = new Date(editAssignmentDue).getTime();
			if (!Number.isFinite(t)) {
				editError = 'Hibás határidő.';
				savingEdit = false;
				return;
			}
			due = t;
		}
		try {
			const res = await apiPatchAssignment(room.id, detailAssignment.id, {
				title: editAssignmentTitle,
				description: editAssignmentDesc,
				due_date: due,
				require_text: editAssignmentRequireText,
				require_images: editAssignmentRequireImages,
				require_files: editAssignmentRequireFiles,
				require_audio: editAssignmentRequireAudio
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				editError = j.error ?? 'Nem sikerült menteni.';
				return;
			}
			const patch = {
				title: j.title,
				description: j.description ?? '',
				due_date: j.due_date,
				require_text: j.require_text,
				require_images: j.require_images,
				require_files: j.require_files,
				require_audio: j.require_audio ?? 0
			};
			assignments = assignments.map((a) => (a.id === detailAssignment!.id ? { ...a, ...patch } : a));
			detailAssignment = { ...detailAssignment, ...patch };
			editingAssignment = false;
			toast.success('Beadandó frissítve');
		} catch {
			editError = 'Hálózati hiba. Próbáld újra!';
		} finally {
			savingEdit = false;
		}
	}

	async function deleteAssignment() {
		if (!detailAssignment || deletingAssignment) return;
		deletingAssignment = true;
		try {
			const res = await apiDeleteAssignment(room.id, detailAssignment.id);
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				toast.error('Nem sikerült törölni', j.error ?? '');
				return;
			}
			assignments = assignments.filter((a) => a.id !== detailAssignment!.id);
			toast.success('Beadandó törölve');
			closeDetail();
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			deletingAssignment = false;
		}
	}

	async function loadAssignmentDetail(aid: string) {
		assignmentLoading = true;
		try {
			const res = await apiAssignmentSubmissions(room.id, aid);
			const j = await res.json().catch(() => ({}));
			if (!res.ok) return;
			if (data.own && Array.isArray(j.results)) {
				assignmentResults = j.results;
				assignmentMine = null;
				assignmentUploads = [];
			} else {
				assignmentMine = j.mine ?? null;
				assignmentUploads = Array.isArray(j.uploads) ? j.uploads : [];
				assignmentText = j.mine?.text_body ?? '';
				if (!data.own && j.mine) {
					assignmentMap = {
						...assignmentMap,
						[aid]: { submitted: (j.mine.submitted ?? 0) === 1, grade: j.mine.grade ?? null }
					};
				}
			}
		} catch {
			// csendben
		} finally {
			assignmentLoading = false;
		}
	}

	$effect(() => {
		const a = detailAssignment;
		assignmentMine = null;
		assignmentUploads = [];
		assignmentResults = [];
		gradingStudent = null;
		previewUpload = null;
		assignmentText = '';
		assignmentTextSaved = false;
		if (assignmentTextTimer) {
			clearTimeout(assignmentTextTimer);
			assignmentTextTimer = null;
		}
		editingAssignment = false;
		confirmDeleteAssignment = false;
		if (a) void loadAssignmentDetail(a.id);
	});

	async function onImageEditorDone(blob: Blob, width: number, height: number) {
		imageEditorOpen = false;
		if (!detailAssignment || assignmentUploadBusy) return;
		assignmentUploadBusy = true;
		try {
			const form = new FormData();
			form.set('kind', 'image');
			form.set('file', new File([blob], 'kep.webp', { type: blob.type || 'image/webp' }));
			form.set('width', String(width));
			form.set('height', String(height));
			const res = await apiUploadAssignment(room.id, detailAssignment.id, form);
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Feltöltés sikertelen', j.error ?? 'Próbáld újra!');
				return;
			}
			if (j.upload) assignmentUploads = [...assignmentUploads, j.upload];
			toast.success('Kép feltöltve', 'Optimalizálva, R2-be mentve.');
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			assignmentUploadBusy = false;
		}
	}

	async function onAudioDone(blob: Blob, durationSec: number) {
		audioRecorderOpen = false;
		if (!detailAssignment || assignmentUploadBusy) return;
		assignmentUploadBusy = true;
		try {
			const form = new FormData();
			form.set('kind', 'audio');
			form.set('file', new File([blob], audioFileName(blob), { type: blob.type || 'audio/webm' }));
			const res = await apiUploadAssignment(room.id, detailAssignment.id, form);
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Feltöltés sikertelen', j.error ?? 'Próbáld újra!');
				return;
			}
			if (j.upload) assignmentUploads = [...assignmentUploads, j.upload];
			toast.success('Hangfelvétel feltöltve', `${fmtDuration(durationSec)} R2-be mentve.`);
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			assignmentUploadBusy = false;
		}
	}

	async function onFilePicked(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files ? [...input.files] : [];
		input.value = '';
		if (!detailAssignment || files.length === 0 || assignmentUploadBusy) return;
		assignmentUploadBusy = true;
		try {
			for (const f of files) {
				const form = new FormData();
				form.set('kind', 'file');
				form.set('file', f);
				const res = await apiUploadAssignment(room.id, detailAssignment.id, form);
				const j = await res.json().catch(() => ({}));
				if (!res.ok) {
					toast.error(f.name, j.error ?? 'Nem sikerült feltölteni.');
					continue;
				}
				if (j.upload) assignmentUploads = [...assignmentUploads, j.upload];
			}
			toast.success('Fájl feltöltve');
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			assignmentUploadBusy = false;
		}
	}

	async function deleteUpload(uploadId: string) {
		if (!detailAssignment) return;
		try {
			const res = await apiDeleteUpload(room.id, detailAssignment.id, uploadId);
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				toast.error('Nem sikerült törölni', j.error ?? '');
				return;
			}
			assignmentUploads = assignmentUploads.filter((u) => u.id !== uploadId);
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		}
	}

	/** Szöveg automatikus mentése gépelés után (Piszkozat gomb helyett). */
	function scheduleAssignmentAutosave() {
		assignmentTextSaved = false;
		if (assignmentTextTimer) clearTimeout(assignmentTextTimer);
		assignmentTextTimer = setTimeout(() => {
			assignmentTextTimer = null;
			void saveAssignmentText();
		}, 1000);
	}

	async function saveAssignmentText() {
		if (!detailAssignment || assignmentSaving || assignmentSubmitBusy || data.own || assignmentMine?.submitted === 1) return;
		if (detailAssignment.due_date !== null && Date.now() > (detailAssignment.due_date ?? 0)) {
			const wasSubmitted = (assignmentMine?.submitted ?? 0) === 1;
			if (!wasSubmitted) return;
		}
		assignmentSaving = true;
		try {
			const res = await apiPostAssignmentSubmission(room.id, detailAssignment.id, { text: assignmentText });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült menteni', j.error ?? 'Próbáld újra!');
				return;
			}
			assignmentMine = j.mine ?? null;
			if (Array.isArray(j.uploads)) assignmentUploads = j.uploads;
			assignmentTextSaved = true;
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			assignmentSaving = false;
		}
	}

	async function submitAssignment(want: boolean) {
		if (!detailAssignment || assignmentSubmitBusy || assignmentSaving || assignmentUploadBusy) return;
		if (assignmentTextTimer) clearTimeout(assignmentTextTimer);
		assignmentTextTimer = null;
		assignmentSubmitBusy = true;
		try {
			const res = await apiPostAssignmentSubmission(room.id, detailAssignment.id, { text: assignmentText, submitted: want });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült', j.error ?? 'Próbáld újra!');
				return;
			}
			assignmentMine = j.mine ?? null;
			if (Array.isArray(j.uploads)) assignmentUploads = j.uploads;
			if (!data.own && j.mine && detailAssignment) {
				assignmentMap = {
					...assignmentMap,
					[detailAssignment.id]: { submitted: (j.mine.submitted ?? 0) === 1, grade: j.mine.grade ?? null }
				};
			}
			toast.success(
				want
					? assignmentUploads.length > 0
						? 'Beadandó beküldve'
						: 'Késznek jelölve!'
					: 'Beküldés visszavonva'
			);
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			assignmentSubmitBusy = false;
		}
	}

	// ---------- Beállítások ----------

	let setName = $state('');
	let setSubjectId = $state('');
	/** Régi, szabad szöveges tantárgy (ha nincs a listában): mentéskor megmarad. */
	let setSubjectKeep = $state('');
	let savingSettings = $state(false);
	let deleteOpen = $state(false);
	let deleting = $state(false);
	let regenCode = $state(false);
	let confirmKickId = $state<string | null>(null);
	let kicking = $state(false);

	function matchSettingsSubject() {
		const match = subjects.find(
			(s) => s.title.toLowerCase() === displaySubject.trim().toLowerCase()
		);
		setSubjectId = match?.id ?? '';
		setSubjectKeep = match ? '' : displaySubject;
	}

	async function openSettings() {
		confirmKickId = null;
		confirmLeave = false;
		sheet = 'settings';
		if (!data.own) return;
		setName = displayName;
		setSubjectKeep = displaySubject;
		matchSettingsSubject();
		// A tantárgylista async töltődik: csak utána lehet a mentett
		// tantárgyat kiválasztva mutatni.
		await ensureSubjects();
		if (sheet === 'settings') matchSettingsSubject();
	}

	async function saveSettings(e: SubmitEvent) {
		e.preventDefault();
		if (savingSettings) return;
		savingSettings = true;
		try {
			const subject = setSubjectId
				? (subjects.find((s) => s.id === setSubjectId)?.title ?? '')
				: setSubjectKeep;
			const res = await apiPatchClassroom(room.id, { name: setName, subject });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült menteni', j.error ?? '');
				return;
			}
			displayName = setName.trim();
			displaySubject = subject;
			sheet = null;
			toast.success('Osztály frissítve');
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			savingSettings = false;
		}
	}

	async function regenerateCode() {
		if (regenCode) return;
		regenCode = true;
		try {
			const res = await apiRegenCode(room.id);
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült', j.error ?? 'Próbáld újra!');
				return;
			}
			displayCode = j.code;
			try {
				await navigator.clipboard.writeText(j.code);
				toast.success('Új kód készült és másolva', j.code);
			} catch {
				toast.success('Új kód készült', j.code);
			}
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			regenCode = false;
		}
	}

	async function kickMember(id: string, name: string) {
		if (confirmKickId !== id) {
			confirmKickId = id;
			return;
		}
		if (kicking) return;
		kicking = true;
		try {
			const res = await apiKick(room.id, id);
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				toast.error('Nem sikerült', j.error ?? 'Próbáld újra!');
				return;
			}
			members = members.filter((m) => m.id !== id);
			confirmKickId = null;
			toast.success('Tag kidobva', name);
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			kicking = false;
		}
	}

	async function deleteClass() {
		if (deleting) return;
		deleting = true;
		try {
			const res = await apiDeleteClassroom(room.id);
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				toast.error('Nem sikerült törölni', j.error ?? '');
				return;
			}
			toast.success('Osztály törölve');
			await goto('/tanterem');
		} catch {
			toast.error('Hálózati hiba. Próbáld újra!');
		} finally {
			deleting = false;
		}
	}

	const stepperBtn =
		'grid size-9 place-items-center rounded-full border border-stone-200 text-lg font-bold text-ink-600 transition hover:bg-stone-50 active:scale-95 dark:border-white/15 dark:text-stone-300 dark:hover:bg-white/10';

	let membersLabel = $derived([displaySubject, `${members.length} fő`].filter(Boolean).join(' · '));
</script>

<svelte:head>
	<title>{displayName || room.name} | Tanterem | Leardy</title>
</svelte:head>

<div class="flex items-center gap-2 px-1">
	<IconButton ariaLabel="Vissza az osztályokhoz" size={44} onclick={goBack}>
		<ArrowLeft size={21} />
	</IconButton>
	<div class="min-w-0 flex-1">
		<h1 class="font-display truncate text-[26px] leading-tight font-extrabold tracking-tight text-ink-900 dark:text-white">
			{displayName || room.name}
		</h1>
	</div>
	<IconButton ariaLabel="Osztálybeállítások" size={44} onclick={openSettings}>
		<Settings size={21} />
	</IconButton>
</div>

{#if data.own}
	<div class="mt-3">
		<Button block size="lg" onclick={() => (sheet = 'choice')}>
			<Plus size={18} /> Létrehozás
		</Button>
	</div>
{/if}

{#if activeLive.length > 0}
	<div class="mt-4 grid min-w-0 gap-2.5 [&>*]:min-w-0" aria-label="Épp zajló élő dolgozat">
		{#each activeLive as s (s.id)}
			<Card tone="brand" pad="lg">
				<div class="anim-rise flex items-center gap-3" style="--d:0ms">
					<span class="relative grid size-11 shrink-0 place-items-center rounded-full bg-white/15" aria-hidden="true">
						<span class="absolute inset-0 animate-ping rounded-full bg-white/20"></span>
						<Radio size={22} class="relative text-white" />
					</span>
					<div class="min-w-0 flex-1">
						<p class="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.14em] text-white/70 uppercase">
							<span class="size-1.5 animate-pulse rounded-full bg-white" aria-hidden="true"></span>
							{s.status === 'live' ? 'Élő dolgozat zajlik' : 'Élő dolgozat indul'}
						</p>
						<p class="font-display truncate text-[18px] font-extrabold tracking-tight text-white">
							{s.title}
						</p>
						<p class="truncate text-[13px] font-semibold text-white/80">
							{fmtTime(s.created_at)}{#if s.total > 0} · {s.total} kérdés{/if}
						</p>
					</div>
					<a
						href={resolve('/elo/[id]', { id: s.id })}
						class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-5 py-3 text-[15px] font-bold text-brand-600 shadow-lg transition hover:bg-brand-50 active:scale-[0.99] motion-reduce:transition-none"
					>
						{data.own ? 'Megnyitás' : 'Csatlakozás'}
					</a>
				</div>
			</Card>
		{/each}
	</div>
{/if}
{#if data.own && draftLive.length > 0}
	<div class="mt-4">
		<Card>
			<div class="anim-rise" style="--d:60ms">
				<h3 class="text-[15px] font-extrabold text-ink-900 dark:text-white">Piszkozatok</h3>
				<ul class="mt-2 grid gap-2">
					{#each draftLive as s (s.id)}
						<li class="rounded-2xl border border-dashed border-stone-300 p-3 dark:border-white/15">
							<div class="flex min-w-0 items-center gap-3">
								<span class="min-w-0 flex-1">
									<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
										{s.title}
									</span>
									<span class="block truncate text-[12px] font-semibold text-stone-500 dark:text-stone-400">
										{draftSummary(s)}
									</span>
								</span>
								<button
									type="button"
									aria-label="Piszkozat törlése"
									disabled={deletingDraft}
									onclick={() => (deletingDraftId = s.id)}
									class="grid size-9 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-black/5 hover:text-red-600 active:scale-95 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-red-300"
								>
									<Trash2 size={17} aria-hidden="true" />
								</button>
							</div>
							<div class="mt-2">
								<Button size="md" block disabled={publishingId !== null} onclick={() => publishDraft(s.id)}>
									{publishingId === s.id ? 'Meghirdetés…' : 'Meghirdetés'}
								</Button>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		</Card>
	</div>
{/if}
{#if data.own && pastLive.length > 0}
	<div class="mt-4">
		<Card>
			<div class="anim-rise" style="--d:60ms">
				<h3 class="text-[15px] font-extrabold text-ink-900 dark:text-white">Korábbi élő dolgozatok</h3>
				<ul class="mt-2 grid gap-1">
					{#each pastLive as s (s.id)}
						<li>
							<a
								href={resolve('/elo/[id]', { id: s.id })}
								class="flex items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-stone-100 active:scale-[0.99] motion-reduce:transition-none dark:hover:bg-white/5"
							>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
										{s.title}
									</span>
									<span class="block truncate text-[12px] font-semibold text-stone-500 dark:text-stone-400">
										{fmtTime(s.created_at)} · {s.done} beküldte
									</span>
								</span>
								<ChevronRight size={16} class="shrink-0 text-stone-300 dark:text-stone-600" aria-hidden="true" />
							</a>
						</li>
					{/each}
				</ul>
			</div>
		</Card>
	</div>
{/if}

<FeedList feed={feed} isOwner={data.own} roomId={room.id} {myMap} {assignmentMap} onOpen={openDetail} />

<!-- Bejegyzés részletei: csatolmányok csak itt -->
<Drawer
	open={detailMsg !== null || detailTask !== null || detailAssignment !== null}
	label="Bejegyzés részletei"
	title={editingMsg || editingTask || editingAssignment ? 'Szerkesztés' : (detailMsg ? detailMsg.title : (detailTask ? (detailTask.title || 'Kvízfeladat') : (detailAssignment ? (detailAssignment.title || 'Beadandó') : 'Részletek')))}
	onClose={closeDetail}
	canClose={() => !deleteMessageOpen && !deletingMessage}
	onEdit={data.own && !editingMsg && !editingTask && !editingAssignment ? openEdit : undefined}
>
	{#snippet actions()}
		{#if editingMsg || editingTask || editingAssignment}
			<Button type="submit" form={editingMsg ? 'edit-message' : editingTask ? 'edit-task' : 'edit-assignment'} size="sm" busy={savingEdit} disabled={editingMsg && editMsgTitle.trim().length < 3}><Save size={17} /> Mentés</Button>
		{/if}
	{/snippet}
	{#if detailAssignment}
		<AssignmentDetail
			assignment={detailAssignment}
			roomId={room.id}
			isOwner={data.own}
			mine={assignmentMine}
			uploads={assignmentUploads}
			results={assignmentResults}
			loading={assignmentLoading}
			bind:text={assignmentText}
			saving={assignmentSaving}
			textSaved={assignmentTextSaved}
			submitBusy={assignmentSubmitBusy}
			uploadBusy={assignmentUploadBusy}
			bind:editing={editingAssignment}
			bind:editTitle={editAssignmentTitle}
			bind:editDesc={editAssignmentDesc}
			bind:editDue={editAssignmentDue}
			bind:editRequireText={editAssignmentRequireText}
			bind:editRequireImages={editAssignmentRequireImages}
			bind:editRequireFiles={editAssignmentRequireFiles}
			bind:editRequireAudio={editAssignmentRequireAudio}
			savingEdit={savingEdit}
			deleting={deletingAssignment}
			bind:confirmDelete={confirmDeleteAssignment}
			editError={editError}
			{inputCls}
			onTextInput={scheduleAssignmentAutosave}
			onSubmit={submitAssignment}
			onAddAttachment={() => (attachPickOpen = true)}
			onDeleteUpload={deleteUpload}
			onSaveEdit={saveAssignmentEdit}
			onCancelEdit={() => (editingAssignment = false)}
			onDeleteAssignment={deleteAssignment}
			onGradeSelect={(r) => (gradingStudent = r)}
		/>
	{:else if detailMsg}
		<MessageDetail
			msg={detailMsg}
			{displaySubject}
			bind:editing={editingMsg}
			bind:editTitle={editMsgTitle}
			bind:editBody={editMsgBody}
			bind:editAttaches={editAttaches}
			saving={savingEdit}
			editError={editError}
			{inputCls}
			onSave={saveMsgEdit}
			onCancel={() => (editingMsg = false)}
			onDeleteRequest={() => { deleteMessageOpen = true; }}
			onOpenAttach={() => openAttach('edit')}
		/>
	{:else if detailTask}
		<TaskDetail
			task={detailTask}
			isOwner={data.own}
			myResult={myResult}
			taskResults={taskResults}
			resultsLoading={resultsLoading}
			submitBusy={submitBusy}
			quizLoading={quizLoading}
			lastReview={lastReview}
			bind:editing={editingTask}
			bind:editTitle={editTaskTitle}
			bind:editLessons={editTaskLessons}
			bind:editCount={editTaskCount}
			bind:editTarget={editTaskTarget}
			bind:editDue={editTaskDue}
			saving={savingEdit}
			editError={editError}
			{stepperBtn}
			{inputCls}
			onStartQuiz={() => detailTask && startTaskQuiz(detailTask)}
			onToggleSubmit={(want) => detailTask && toggleSubmit(detailTask, want)}
			onSaveEdit={saveTaskEdit}
			onCancelEdit={() => (editingTask = false)}
			onOpenLessonPicker={() => {
				taskPickerTarget = 'edit';
				void ensureSubjects().then(() => taskPickerOpen = true);
			}}
		/>
	{/if}
</Drawer>

<!-- Tanári beküldés-részletező: értékelés felül, feltöltések egymás alatt -->
<GradingDrawer
	student={gradingStudent}
	assignmentId={detailAssignment?.id ?? null}
	roomId={room.id}
	onBack={() => {
		gradingStudent = null;
		previewUpload = null;
	}}
	onClose={() => {
		gradingStudent = null;
		previewUpload = null;
	}}
	onSaved={onGradeSaved}
	onPreview={(u) => (previewUpload = u)}
/>

<ImagePreviewOverlay upload={previewUpload} assignmentId={detailAssignment?.id ?? null} roomId={room.id} onClose={() => (previewUpload = null)} />

<QuizModal open={quizOpen} label={quizTitle || 'Kvíz'} title={quizTitle} onClose={() => (quizOpen = false)}>
	{#if quizQuestions.length > 0}
		{#key quizQuestions.map((q) => q.id).join(',')}
			<QuizRunner
				questions={quizQuestions}
				title={quizTitle}
				targetPct={detailTask?.target_pct ?? null}
				onExit={() => (quizOpen = false)}
				onDone={onQuizDone}
			/>
		{/key}
	{/if}
</QuizModal>

<!-- Létrehozás választó -->
<Drawer open={sheet === 'choice'} label="Létrehozás" title="Mit hozol létre?" onClose={closeSheet}>
	<div class="mt-3 grid gap-2.5">
		<button
			type="button"
			onclick={openMessage}
			class="flex w-full items-center gap-3.5 rounded-2xl border border-stone-200 p-4 text-left transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:hover:bg-white/5"
		>
			<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-white">
				<Megaphone size={22} />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Üzenet</span>
				<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">Hír az osztálynak, tananyaggal</span>
			</span>
		</button>
		<button
			type="button"
			onclick={openTask}
			class="flex w-full items-center gap-3.5 rounded-2xl border border-stone-200 p-4 text-left transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:hover:bg-white/5"
		>
			<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-white">
				<ClipboardList size={22} />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Feladat</span>
				<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">Kvíz kiosztása határidővel</span>
			</span>
		</button>
		<button
			type="button"
			onclick={openAssignmentSheet}
			class="flex w-full items-center gap-3.5 rounded-2xl border border-stone-200 p-4 text-left transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:hover:bg-white/5"
		>
			<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-white">
				<FileText size={22} />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Beadandó</span>
				<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">Szöveg, kép, hang és fájl határidővel</span>
			</span>
		</button>
		<a
			href={resolve('/tanterem/[id]/elo/uj', { id: room.id })}
			class="flex w-full items-center gap-3.5 rounded-2xl border border-stone-200 p-4 text-left transition hover:bg-stone-50 active:scale-[0.99] dark:border-white/10 dark:hover:bg-white/5"
		>
			<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-white">
				<Radio size={22} />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Dolgozat (élő)</span>
				<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">Valós idejű kvíz a táblán, Durable Objecttel</span>
			</span>
		</a>
	</div>
</Drawer>

<!-- Üzenet írása -->
<Drawer open={sheet === 'message'} label="Új üzenet" title="Új üzenet" wide onClose={closeSheet}>
	<CreateMessageForm
		bind:title={msgTitle}
		bind:body={msgBody}
		bind:attaches={attaches}
		sending={sendingMsg}
		error={msgError}
		{inputCls}
		{displaySubject}
		onSubmit={sendMessage}
		onOpenAttach={() => openAttach()}
	/>
</Drawer>

<AttachSheet
	open={attachOpen}
	{subjects}
	{decks}
	startSubjectId={classroomSubjectId}
	onClose={() => (attachOpen = false)}
	onPick={(ps) => {
		const current = attachTarget === 'edit' ? editAttaches : attaches;
		const fresh = ps.filter((p) => !current.some((a) => a.type === p.type && a.id === p.id));
		if (attachTarget === 'edit') editAttaches = [...current, ...fresh].slice(0, 10);
		else attaches = [...current, ...fresh].slice(0, 10);
		attachOpen = false;
	}}
/>

<!-- Feladat kiosztása -->
<Drawer open={sheet === 'task'} label="Új feladat" title="Új feladat" wide onClose={closeSheet}>
	<CreateTaskForm
		bind:title={taskTitle}
		bind:lessons={taskLessons}
		bind:questionCount={questionCount}
		bind:targetPct={targetPct}
		bind:shuffleMode={shuffleMode}
		bind:dueInput={dueInput}
		creating={creatingTask}
		error={taskError}
		{stepperBtn}
		{inputCls}
		onSubmit={createTask}
		onOpenLessonPicker={() => {
			taskPickerTarget = 'new';
			void ensureSubjects().then(() => taskPickerOpen = true);
		}}
	/>
</Drawer>

<!-- Beadandó kiosztása -->
<Drawer open={sheet === 'assignment'} label="Új beadandó" title="Új beadandó" wide onClose={closeSheet}>
	<CreateAssignmentForm
		bind:title={assignmentTitle}
		bind:desc={assignmentDesc}
		bind:due={assignmentDue}
		bind:requireText={assignmentRequireText}
		bind:requireImages={assignmentRequireImages}
		bind:requireFiles={assignmentRequireFiles}
		bind:requireAudio={assignmentRequireAudio}
		creating={creatingAssignment}
		error={assignmentError}
		{inputCls}
		onSubmit={createAssignment}
	/>
</Drawer>

<!-- Osztálybeállítások -->
<ClassroomSettingsDrawer
	open={sheet === 'settings'}
	isOwner={data.own}
	bind:roomNotif={roomNotif}
	bind:setName={setName}
	bind:setSubjectId={setSubjectId}
	{subjects}
	membersCount={members.length}
	createdAt={room.created_at}
	displayCode={displayCode}
	displayName={displayName}
	{displaySubject}
	{membersLabel}
	saving={savingSettings}
	regenBusy={regenCode}
	{confirmLeave}
	{leaving}
	onClose={closeSheet}
	onSave={saveSettings}
	onCopyCode={copyCode}
	onRegenCode={regenerateCode}
	onOpenMembers={() => (membersOpen = true)}
	onOpenStats={() => (statsOpen = true)}
	onDeleteRequest={() => {
		deleteOpen = true;
	}}
	onLeaveRequest={() => (confirmLeave = true)}
/>

<ConfirmDialog
	open={deleteMessageOpen}
	title="Üzenet törlése"
	description="Az üzenet végleg törlődik."
	confirmLabel="Törlés"
	busy={deletingMessage}
	onClose={() => { deleteMessageOpen = false; }}
	onConfirm={() => { void deleteMessage(); }}
/>

<ConfirmDialog
	open={confirmLeave}
	title="Kilépés az osztályból"
	description="Az üzenetek és feladatok eltűnnek innen. Később új kóddal visszacsatlakozhatsz."
	confirmLabel="Kilépek"
	busy={leaving}
	onClose={() => {
		if (!leaving) confirmLeave = false;
	}}
	onConfirm={leaveClass}
/>

<ConfirmDialog
	open={deleteOpen}
	title="Osztály törlése"
	description="Az üzenetek és feladatok is törlődnek. Ez nem vonható vissza. A megerősítéshez írd be az osztály nevét, majd tartsd nyomva a törlés gombot."
	confirmLabel="Törlöm"
	busy={deleting}
	requireText={{ label: 'Osztály neve', placeholder: displayName, expected: displayName }}
	onClose={() => {
		if (!deleting) deleteOpen = false;
	}}
	onConfirm={deleteClass}
/>

<ConfirmDialog
	open={deletingDraftId !== null}
	title="Piszkozat törlése"
	description="A piszkozat végleg törlődik."
	confirmLabel="Törlés"
	busy={deletingDraft}
	onClose={() => {
		if (!deletingDraft) deletingDraftId = null;
	}}
	onConfirm={deleteDraft}
/>

<input
	bind:this={fileInputEl}
	type="file"
	multiple
	class="hidden"
	aria-hidden="true"
	tabindex="-1"
	onchange={onFilePicked}
/>

<AssignmentImageEditor
	open={imageEditorOpen}
	onClose={() => (imageEditorOpen = false)}
	onDone={onImageEditorDone}
/>

<AssignmentAudioRecorder
	open={audioRecorderOpen}
	onClose={() => (audioRecorderOpen = false)}
	onDone={onAudioDone}
/>

<ClassStats classroomId={room.id} open={statsOpen} onClose={() => (statsOpen = false)} />

<AttachPickSheet
	open={attachPickOpen}	allowImage={(detailAssignment?.require_images ?? 0) === 1}
	allowAudio={(detailAssignment?.require_audio ?? 0) === 1}
	allowFile={(detailAssignment?.require_files ?? 0) === 1}
	onPick={onAttachPick}
	onClose={() => (attachPickOpen = false)}
/>

<MembersDrawer
	open={membersOpen}
	{members}
	isOwner={data.own}
	{confirmKickId}
	{kicking}
	onClose={() => { membersOpen = false; confirmKickId = null; }}
	onKick={kickMember}
/>


		<ContentPicker
			open={taskPickerOpen}
			{subjects}
			startSubjectId={classroomSubjectId}
			select="lesson"
			multi
			onlyWithQuiz
			initialSelected={taskPickerTarget === 'edit' ? editTaskLessons : taskLessons}
			onClose={() => (taskPickerOpen = false)}
			onPick={(ps) => {
				if (taskPickerTarget === 'edit') editTaskLessons = ps;
				else taskLessons = ps;
				taskPickerOpen = false;
			}}
		/>
