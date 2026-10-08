<script lang="ts">
	import { createBackNavigation } from '$lib/back-navigation';
	import { lessonPath } from '$lib/lesson-paths';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
import {
	ArrowLeft,
	BookMarked,
	BookOpen,
	CalendarDays,
	Check,
	ChevronRight,
	ClipboardList,
	Copy,
	FileText,
	FileUp,
	GraduationCap,
	Image as ImageIcon,
	Layers,
	ListChecks,
	LogOut,
	Megaphone,
	Mic,
	Paperclip,
	Plus,
	RefreshCw,
	RotateCcw,
	Send,
	Settings,
	Shuffle,
	Target,
	Timer,
	Trash2,
	TrendingUp,
	Undo2,
	UserMinus,
	Users,
	X
	} from '@lucide/svelte';
	import AssignmentImageEditor from '$lib/components/AssignmentImageEditor.svelte';
	import AssignmentAudioRecorder from '$lib/components/AssignmentAudioRecorder.svelte';
	import AssignmentGrading from '$lib/components/AssignmentGrading.svelte';
	import ClassStats from '$lib/components/ClassStats.svelte';
	import AttachSheet, { type AttachPick } from '$lib/components/AttachSheet.svelte';
	import AttachPickSheet, { type AttachKind } from '$lib/components/AttachPickSheet.svelte';
	import ContentPicker, { type ContentPick } from '$lib/components/ContentPicker.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import QuizModal from '$lib/components/QuizModal.svelte';
	import QuizRunner, { type QuizMiss } from '$lib/components/QuizRunner.svelte';
	import QuizReviewList from '$lib/components/QuizReviewList.svelte';
	import { loadQuizReview, saveQuizReview, type QuizReview } from '$lib/quiz-review';
	import SubjectPicker from '$lib/components/SubjectPicker.svelte';
	import { loadSettings, saveSettings as saveAppSettings, toggleClassroomMuted } from '$lib/settings';
	import type { Subject } from '$lib/curriculum';
	import type { QuizQuestion } from '$lib/curriculum';
	import { toast } from '$lib/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import EmptyState from '$lib/ui/EmptyState.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Segmented from '$lib/ui/Segmented.svelte';
	import Switch from '$lib/ui/Switch.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let room = $derived(data.room);

	interface FeedMessage {
		id: string;
		title: string;
		body: string;
		teacher_name?: string;
		ref_type: string | null;
		ref_id: string | null;
		ref_title: string | null;
		refs: { ref_type: string; ref_id: string; ref_title: string }[];
		created_at: number;
	}
	interface FeedTask {
		id: string;
		title: string;
		lesson_ids_json: string;
		question_count: number;
		target_pct: number;
		shuffle: number;
		due_date: number | null;
		created_at: number;
	}
	interface FeedAssignment {
		id: string;
		title: string;
		description: string;
		due_date: number | null;
		require_text: number;
		min_chars: number;
		require_images: number;
		max_images: number;
		require_files: number;
		max_files: number;
		require_audio: number;
		created_at: number;
	}
	interface UploadItem {
		id: string;
		kind: string;
		file_name: string;
		mime: string;
		size: number;
		width: number | null;
		height: number | null;
		created_at: number;
	}
	interface Member {
		id: string;
		name: string;
		joined_at: number;
	}

	let messages = $state<FeedMessage[]>([]);
	let tasks = $state<FeedTask[]>([]);
	let assignments = $state<FeedAssignment[]>([]);
	let members = $state<Member[]>([]);
	let displayName = $state('');
	let displaySubject = $state('');
	let displayCode = $state('');
	let seeded = $state(false);

	type FeedItem =
		| { kind: 'message'; ts: number; msg: FeedMessage }
		| { kind: 'task'; ts: number; task: FeedTask }
		| { kind: 'assignment'; ts: number; assignment: FeedAssignment };

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

	function closeDetail() {
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
			const res = await fetch(`/api/classrooms/${room.id}/submissions/mine`);
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
			const res = await fetch(`/api/classrooms/${room.id}/tasks/${taskId}/submissions`);
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
			const res = await fetch(`/api/classrooms/${room.id}/tasks/${task.id}/submissions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ submitted: want })
			});
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
	let editingTask = $state(false);
	let editError = $state<string | null>(null);
	let savingEdit = $state(false);
	let editMsgTitle = $state('');
	let editMsgBody = $state('');
	let editTaskTitle = $state('');
	let editTaskCount = $state(10);
	let editTaskTarget = $state(80);
	let editTaskDue = $state('');

	function toDueInput(ts: number | null): string {
		if (!ts) return '';
		const d = new Date(ts);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
	}

	function openEdit() {
		editError = null;
		if (detailMsg && data.own) {
			editMsgTitle = detailMsg.title;
			editMsgBody = detailMsg.body;
			editingMsg = true;
		} else if (detailTask && data.own) {
			editTaskTitle = detailTask.title;
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
			const res = await fetch(`/api/classrooms/${room.id}/messages/${detailMsg.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: editMsgTitle, body: editMsgBody })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				editError = j.error ?? 'Nem sikerült menteni.';
				return;
			}
			messages = messages.map((m) => (m.id === detailMsg!.id ? { ...m, title: j.title, body: j.body } : m));
			detailMsg = { ...detailMsg, title: j.title, body: j.body };
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
			const res = await fetch(`/api/classrooms/${room.id}/tasks/${detailTask.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: editTaskTitle,
					question_count: editTaskCount,
					target_pct: editTaskTarget,
					due_date: due
				})
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				editError = j.error ?? 'Nem sikerült menteni.';
				return;
			}
			tasks = tasks.map((t) =>
				t.id === detailTask!.id
					? { ...t, title: j.title, question_count: j.question_count, target_pct: j.target_pct, due_date: j.due_date }
					: t
			);
			detailTask = {
				...detailTask,
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
			const res = await fetch(`/api/classrooms/${room.id}/tasks/${task.id}/quiz`);
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
			const res = await fetch(`/api/classrooms/${room.id}/tasks/${task.id}/submissions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ score, total })
			});
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

	$effect(() => {
		if (!seeded) {
			messages = [...data.messages];
			tasks = [...data.tasks];
			assignments = [...(data.assignments ?? [])];
			members = [...data.members];
			displayName = data.room.name;
			displaySubject = data.room.subject ?? '';
			displayCode = data.room.code;
			seeded = true;
			void loadMineMap();
		}
	});

	type Sheet = null | 'choice' | 'message' | 'task' | 'assignment' | 'settings';
	let sheet = $state<Sheet>(null);
	let settingsView = $state<'main' | 'members'>('main');

	function closeSheet() {
		sheet = null;
		settingsView = 'main';
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
			const res = await fetch(`/api/classrooms/${room.id}/leave`, { method: 'DELETE' });
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

	function fmtTime(ts: number): string {
		try {
			return new Date(ts).toLocaleString('hu-HU', {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	}

	function fmtDate(ts: number): string {
		try {
			return new Date(ts).toLocaleString('hu-HU', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	}

	function fmtDateOnly(ts: number): string {
		try {
			return new Date(ts).toLocaleDateString('hu-HU', {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return '';
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
			// csendben: az űrlap hiba nélkül marad
		}
	}

	async function ensureDecks() {
		if (decksLoaded) return;
		try {
			const res = await fetch('/api/library');
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

	function openAttach() {
		ensureSubjects();
		ensureDecks();
		attachOpen = true;
	}

	const attachIcons: Record<string, typeof BookOpen> = {
		subject: GraduationCap,
		lesson: BookOpen,
		quiz: Target,
		deck: Layers,
		topic: BookMarked
	};

	async function sendMessage(e: SubmitEvent) {
		e.preventDefault();
		if (sendingMsg) return;
		msgError = null;
		sendingMsg = true;
		try {
			const res = await fetch(`/api/classrooms/${room.id}/messages`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: msgTitle,
					body: msgBody,
					refs: attaches.map((a) => ({
						ref_type: a.type,
						ref_id: a.id,
						ref_title: a.crumb
					}))
				})
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				msgError = j.error ?? 'Nem sikerült elküldeni.';
				return;
			}
			const list = await fetch(`/api/classrooms/${room.id}/content`).then((r) =>
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

	function attachHrefFor(t: string | null, id: string | null): string | null {
		if (!t || !id) return null;
		if (t === 'subject') return '/tanulas';
		if (t === 'lesson' || t === 'quiz') return lessonPath(id);
		if (t === 'deck') {
			if (id.startsWith('deck:')) return `/kartyak/${id.slice(5)}`;
			return '/kartyak/felfedezes';
		}
		return null;
	}

	function attachLabel(t: string | null): string {
		if (t === 'subject') return 'Témakör';
		if (t === 'lesson') return 'Lecke';
		if (t === 'quiz') return 'Kvíz';
		if (t === 'deck') return 'Kártya';
		if (t === 'topic') return 'Témakör';
		return 'Csatolmány';
	}

	function messageChips(m: FeedMessage): { ref_type: string; ref_id: string; ref_title: string }[] {
		if (m.refs && m.refs.length > 0) return m.refs;
		if (m.ref_type && m.ref_id) {
			return [{ ref_type: m.ref_type, ref_id: m.ref_id, ref_title: m.ref_title ?? '' }];
		}
		return [];
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

	function step(value: number, delta: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value + delta));
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
			const res = await fetch(`/api/classrooms/${room.id}/tasks`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: taskTitle,
					lessons: taskLessons.map((p) => ({ id: p.lessonId, title: p.lessonTitle })),
					question_count: questionCount,
					target_pct: targetPct,
					shuffle: shuffleMode === 'mixed' ? 1 : 0,
					due_date: due
				})
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				taskError = j.error ?? 'Nem sikerült létrehozni.';
				return;
			}
			const list = await fetch(`/api/classrooms/${room.id}/content`).then((r) =>
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

	interface AssignmentMine {
		text_body: string;
		submitted: number;
		submitted_at: number | null;
		updated_at: number;
		grade: number | null;
		feedback: string;
		graded_at: number | null;
	}
	interface AssignmentRow {
		user_id: string;
		name: string;
		text_body: string;
		submitted: number;
		submitted_at: number | null;
		grade: number | null;
		feedback: string;
		graded_at: number | null;
		image_count: number;
		file_count: number;
		uploads: UploadItem[];
	}

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

	/** Diák hol tart: értékelve / beküldve / dolgozik / még semmi. */
	function assignmentStatus(r: AssignmentRow): string {
		if (r.grade !== null && r.grade !== undefined) return `Értékelve: ${r.grade}`;
		if (r.submitted === 1) return 'Beküldve';
		const audioCount = r.uploads.filter((u) => u.kind === 'audio').length;
		if (r.text_body || r.image_count > 0 || r.file_count > 0 || audioCount > 0) return 'Dolgozik rajta';
		return 'Még nem kezdte';
	}

	function openAssignmentSheet() {
		sheet = 'assignment';
		assignmentError = null;
	}

	function assignmentReqSummary(a: FeedAssignment): string {
		const parts: string[] = [];
		if (a.require_text) parts.push('Szöveg');
		if (a.require_images) parts.push('Kép');
		if ((a.require_audio ?? 0) === 1) parts.push('Hang');
		if (a.require_files) parts.push('Fájl');
		return parts.length > 0 ? parts.join(' - ') : 'Szabad beküldés';
	}

	async function refreshAssignments() {
		const list = await fetch(`/api/classrooms/${room.id}/content`).then((r) =>
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
			const res = await fetch(`/api/classrooms/${room.id}/assignments`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: assignmentTitle,
					description: assignmentDesc,
					due_date: due,
					require_text: assignmentRequireText,
					require_images: assignmentRequireImages,
					require_files: assignmentRequireFiles,
					require_audio: assignmentRequireAudio
				})
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
			const res = await fetch(`/api/classrooms/${room.id}/assignments/${detailAssignment.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: editAssignmentTitle,
					description: editAssignmentDesc,
					due_date: due,
					require_text: editAssignmentRequireText,
					require_images: editAssignmentRequireImages,
					require_files: editAssignmentRequireFiles,
					require_audio: editAssignmentRequireAudio
				})
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
			const res = await fetch(`/api/classrooms/${room.id}/assignments/${detailAssignment.id}`, {
				method: 'DELETE'
			});
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
			const res = await fetch(`/api/classrooms/${room.id}/assignments/${aid}/submissions`);
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

	function uploadUrl(aid: string, uploadId: string): string {
		return `/api/classrooms/${room.id}/assignments/${aid}/uploads/${uploadId}`;
	}

	function fmtSize(bytes: number): string {
		if (!Number.isFinite(bytes) || bytes < 0) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	}

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
			const res = await fetch(
				`/api/classrooms/${room.id}/assignments/${detailAssignment.id}/uploads`,
				{ method: 'POST', body: form }
			);
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
			const res = await fetch(
				`/api/classrooms/${room.id}/assignments/${detailAssignment.id}/uploads`,
				{ method: 'POST', body: form }
			);
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

	function audioFileName(blob: Blob): string {
		const t = blob.type || '';
		if (t.includes('mp4') || t.includes('aac') || t.includes('m4a')) return 'hangfelvetel.m4a';
		if (t.includes('webm') || t.includes('opus') || t.includes('ogg')) return 'hangfelvetel.webm';
		return 'hangfelvetel.wav';
	}

	function fmtDuration(s: number): string {
		if (!Number.isFinite(s) || s < 0) return '';
		const m = Math.floor(s / 60);
		const sec = Math.round(s % 60);
		return m > 0 ? `${m}p ${sec}mp` : `${sec}mp`;
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
				const res = await fetch(
					`/api/classrooms/${room.id}/assignments/${detailAssignment.id}/uploads`,
					{ method: 'POST', body: form }
				);
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
			const res = await fetch(
				`/api/classrooms/${room.id}/assignments/${detailAssignment.id}/uploads/${uploadId}`,
				{ method: 'DELETE' }
			);
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
		if (!detailAssignment || assignmentSaving || data.own) return;
		if (detailAssignment.due_date !== null && Date.now() > (detailAssignment.due_date ?? 0)) {
			const wasSubmitted = (assignmentMine?.submitted ?? 0) === 1;
			if (!wasSubmitted) return;
		}
		assignmentSaving = true;
		try {
			const res = await fetch(
				`/api/classrooms/${room.id}/assignments/${detailAssignment.id}/submissions`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ text: assignmentText })
				}
			);
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
		if (!detailAssignment || assignmentSubmitBusy) return;
		assignmentSubmitBusy = true;
		try {
			const res = await fetch(
				`/api/classrooms/${room.id}/assignments/${detailAssignment.id}/submissions`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ text: assignmentText, submitted: want })
				}
			);
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

	function parseTaskLessons(t: FeedTask): { id: string; title: string }[] {
		try {
			const raw = JSON.parse(t.lesson_ids_json) as unknown;
			if (!Array.isArray(raw)) return [];
			return raw
				.map((l) => {
					if (typeof l === 'string') return { id: l, title: 'Lecke' };
					const o = l as { id?: unknown; title?: unknown };
					return { id: String(o.id ?? ''), title: String(o.title ?? 'Lecke') };
				})
				.filter((l) => l.id);
		} catch {
			return [];
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
		settingsView = 'main';
		confirmKickId = null;
		confirmLeave = false;
		sheet = 'settings';
		if (!data.own) return;
		setName = displayName;
		// A tantárgylista async töltődik: csak utána lehet a mentett
		// tantárgyat kiválasztva mutatni.
		await ensureSubjects();
		if (sheet === 'settings' && settingsView === 'main') matchSettingsSubject();
	}

	async function saveSettings(e: SubmitEvent) {
		e.preventDefault();
		if (savingSettings) return;
		savingSettings = true;
		try {
			const subject = setSubjectId
				? (subjects.find((s) => s.id === setSubjectId)?.title ?? '')
				: setSubjectKeep;
			const res = await fetch(`/api/classrooms/${room.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: setName, subject })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error('Nem sikerült menteni', j.error ?? '');
				return;
			}
			displayName = setName.trim();
			displaySubject = subject;
			sheet = null;
			settingsView = 'main';
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
			const res = await fetch(`/api/classrooms/${room.id}/code`, { method: 'POST' });
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
			const res = await fetch(`/api/classrooms/${room.id}/members/${id}`, { method: 'DELETE' });
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
			const res = await fetch(`/api/classrooms/${room.id}`, { method: 'DELETE' });
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

<div class="mt-4 grid min-w-0 gap-2.5 [&>*]:min-w-0">
	{#if feed.length === 0}
		<EmptyState
			title="Még nincs bejegyzés"
			description={data.own ? 'A Létrehozás gombbal küldhetsz az osztálynak.' : 'A tanárod bejegyzései itt jelennek meg.'}
		/>
	{:else}
		{#each feed as item (item.kind + ':' + (item.kind === 'message' ? item.msg.id : item.kind === 'task' ? item.task.id : item.assignment.id))}
			{#if item.kind === 'assignment'}
				<Card
					href={data.own ? `/tanterem/${room.id}/beadando/${item.assignment.id}` : undefined}
					onclick={data.own ? undefined : () => (detailAssignment = item.assignment)}
					ariaLabel={item.assignment.title || 'Beadandó részletei'}
				>
					<div class="flex min-w-0 items-start gap-3 overflow-hidden">
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
							<FileText size={20} />
						</span>
						<div class="min-w-0 flex-1 overflow-hidden">
							<p class="truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
								{item.assignment.title || 'Beadandó'}
							</p>
							<p class="mt-0.5 truncate text-[13px] text-stone-500 dark:text-stone-400">
								Beadandó · {assignmentReqSummary(item.assignment)}
							</p>
							{#if item.assignment.due_date}
								{@const late = item.assignment.due_date < Date.now()}
								<p class="mt-1 flex min-w-0 items-start gap-1.5 text-[13px] font-bold {late ? 'text-red-600 dark:text-red-300' : 'text-stone-500 dark:text-stone-400'}">
									<CalendarDays size={14} class="mt-0.5 shrink-0" />
									<span class="min-w-0 flex-1 break-words">{late ? 'Lejárt: ' : 'Határidő: '}{fmtDate(item.assignment.due_date)}</span>
								</p>
							{/if}
						</div>
						{#if !data.own}
							{@const st = assignmentMap[item.assignment.id]}
							{#if st?.grade !== null && st?.grade !== undefined}
								<span
									class="grid size-7 shrink-0 place-items-center self-start rounded-full bg-brand-500 text-[15px] font-extrabold text-white"
									title="Érdemjegy: {st.grade}"
									role="img"
									aria-label="Érdemjegy: {st.grade}"
								>
									{st.grade}
								</span>
							{:else if st?.submitted}
								<span
									class="grid size-6 shrink-0 place-items-center self-start rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
									title="Beküldve"
									role="img"
									aria-label="Beküldve"
								>
									<Check size={15} strokeWidth={3} />
								</span>
							{/if}
						{/if}
					</div>
				</Card>
			{:else if item.kind === 'task'}
				{@const lessons = parseTaskLessons(item.task)}
				<Card
					href={data.own ? `/tanterem/${room.id}/feladat/${item.task.id}` : undefined}
					onclick={data.own ? undefined : () => (detailTask = item.task)}
					ariaLabel={item.task.title || 'Feladat részletei'}
				>
					<div class="flex min-w-0 items-start gap-3 overflow-hidden">
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
							<ClipboardList size={20} />
						</span>
						<div class="min-w-0 flex-1 overflow-hidden">
							<p class="truncate text-[15px] font-extrabold text-ink-900 dark:text-white">
								{item.task.title || 'Kvízfeladat'}
							</p>
							<p class="mt-0.5 truncate text-[13px] text-stone-500 dark:text-stone-400">
								{lessons.length} lecke · {item.task.question_count} kérdés · cél: {item.task.target_pct}%
							</p>
							{#if item.task.due_date}
								{@const late = item.task.due_date < Date.now()}
								<p class="mt-1 flex min-w-0 items-start gap-1.5 text-[13px] font-bold {late ? 'text-red-600 dark:text-red-300' : 'text-stone-500 dark:text-stone-400'}">
									<CalendarDays size={14} class="mt-0.5 shrink-0" />
									<span class="min-w-0 flex-1 break-words">{late ? 'Lejárt: ' : 'Határidő: '}{fmtDate(item.task.due_date)}</span>
								</p>
							{/if}
						</div>
						{#if !data.own && myMap[item.task.id]?.submitted}
							<span
								class="grid size-6 shrink-0 place-items-center self-start rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
								title="Beküldve"
								role="img"
								aria-label="Beküldve"
							>
								<Check size={15} strokeWidth={3} />
							</span>
						{/if}
					</div>
				</Card>
			{:else}
				{@const chips = messageChips(item.msg)}
				<Card onclick={() => (detailMsg = item.msg)} ariaLabel={item.msg.title}>
					<div class="flex min-w-0 items-start gap-3 overflow-hidden">
						<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
							<Megaphone size={20} />
						</span>
						<div class="min-w-0 flex-1 overflow-hidden">
							<p class="truncate text-[15px] font-extrabold text-ink-900 dark:text-white">{item.msg.title}</p>
							{#if item.msg.body}
								<p class="mt-0.5 line-clamp-2 text-sm leading-relaxed break-words text-stone-600 dark:text-stone-300">{item.msg.body}</p>
							{/if}
							<p class="mt-1.5 flex min-w-0 items-center gap-1 text-[12px] text-stone-400 dark:text-stone-500">
								<span class="min-w-0 flex-1 truncate">{item.msg.teacher_name ?? ''} · {fmtTime(item.msg.created_at)}</span>
								{#if chips.length > 0}
									<span class="inline-flex shrink-0 items-center gap-1 font-bold">
										<Paperclip size={12} /> {chips.length}
									</span>
								{/if}
							</p>
						</div>
					</div>
				</Card>
			{/if}
		{/each}
	{/if}
</div>

<!-- Bejegyzés részletei: csatolmányok csak itt -->
<Drawer
	open={detailMsg !== null || detailTask !== null || detailAssignment !== null}
	label="Bejegyzés részletei"
	title={editingMsg || editingTask || editingAssignment ? 'Szerkesztés' : (detailMsg ? detailMsg.title : (detailTask ? (detailTask.title || 'Kvízfeladat') : (detailAssignment ? (detailAssignment.title || 'Beadandó') : 'Részletek')))}
	onClose={closeDetail}
	onEdit={data.own && !editingMsg && !editingTask && !editingAssignment ? openEdit : undefined}
>
	{#if detailAssignment}
		{#if editingAssignment}
			<form onsubmit={saveAssignmentEdit} class="mt-3 grid gap-3.5" novalidate>
				<Input label="Beadandó címe" required placeholder="pl. Olvasónapló 1. fejezet" bind:value={editAssignmentTitle} disabled={savingEdit} error={editError} />
				<div>
					<label for="edit-assignment-desc" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
						Leírás
					</label>
					<textarea
						id="edit-assignment-desc"
						rows="3"
						maxlength="2000"
						placeholder="Mit kell beadni? (nem kötelező)"
						bind:value={editAssignmentDesc}
						disabled={savingEdit}
						class={inputCls}
					></textarea>
				</div>
				<div>
					<label for="edit-assignment-due" class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
						<CalendarDays size={14} /> Határidő <span class="font-normal text-stone-400">(üresen hagyható)</span>
					</label>
					<input
						id="edit-assignment-due"
						type="datetime-local"
						bind:value={editAssignmentDue}
						disabled={savingEdit}
						class={[inputCls, 'dark:[color-scheme:dark]']}
					/>
				</div>
				<div class="grid gap-2">
					<p class="text-[13px] font-semibold text-ink-900 dark:text-white">Mit kell beadni?</p>
					<div class="flex items-center justify-between gap-2">
						<span class="text-[14px] font-bold text-ink-900 dark:text-white">Szöveg kérése</span>
						<Switch bind:checked={editAssignmentRequireText} disabled={savingEdit} label="Szöveg kérése" />
					</div>
					<div class="flex items-center justify-between gap-2">
						<span class="text-[14px] font-bold text-ink-900 dark:text-white">Kép feltöltés</span>
						<Switch bind:checked={editAssignmentRequireImages} disabled={savingEdit} label="Kép feltöltés kérése" />
					</div>
					<div class="flex items-center justify-between gap-2">
						<span class="text-[14px] font-bold text-ink-900 dark:text-white">Hangfelvétel</span>
						<Switch bind:checked={editAssignmentRequireAudio} disabled={savingEdit} label="Hangfelvétel kérése" />
					</div>
					<div class="flex items-center justify-between gap-2">
						<span class="text-[14px] font-bold text-ink-900 dark:text-white">Fájl feltöltés</span>
						<Switch bind:checked={editAssignmentRequireFiles} disabled={savingEdit} label="Fájl feltöltés kérése" />
					</div>
				</div>
				<div class="grid grid-cols-2 gap-2.5">
					<Button variant="outline" block disabled={savingEdit} onclick={() => (editingAssignment = false)}>
						Mégse
					</Button>
					<Button type="submit" block busy={savingEdit}>
						{savingEdit ? 'Mentés…' : 'Mentés'}
					</Button>
				</div>
				{#if !confirmDeleteAssignment}
					<Button variant="danger" block disabled={savingEdit} onclick={() => (confirmDeleteAssignment = true)}>
						<Trash2 size={16} /> Beadandó törlése
					</Button>
				{:else}
					<div class="grid grid-cols-2 gap-2.5">
						<Button variant="outline" block disabled={deletingAssignment} onclick={() => (confirmDeleteAssignment = false)}>
							Mégse
						</Button>
						<Button variant="danger" block busy={deletingAssignment} onclick={deleteAssignment}>
							{deletingAssignment ? 'Törlés…' : 'Biztosan törlöm'}
						</Button>
					</div>
				{/if}
			</form>
		{:else}
			{@const aSubmitted = (assignmentMine?.submitted ?? 0) === 1}
			{@const aPastDue = detailAssignment.due_date !== null && Date.now() > (detailAssignment.due_date ?? 0)}
			{@const aSubmittedCount = assignmentResults.filter((r) => r.submitted === 1).length}
			{@const aImages = assignmentUploads.filter((u) => u.kind === 'image')}
			{@const aFiles = assignmentUploads.filter((u) => u.kind === 'file')}
			{@const aAudios = assignmentUploads.filter((u) => u.kind === 'audio')}
			{@const aTotal = aImages.length + aAudios.length + aFiles.length}
			<div class="mt-3 grid min-w-0 gap-3 overflow-hidden">
				{#if detailAssignment.description}
					<p class="text-sm leading-relaxed break-words whitespace-pre-line text-stone-600 dark:text-stone-300">{detailAssignment.description}</p>
				{/if}
				{#if detailAssignment.due_date}
					{@const late = detailAssignment.due_date < Date.now()}
					<p class="flex items-center gap-1.5 text-[13px] font-bold {late ? 'text-red-600 dark:text-red-300' : 'text-stone-500 dark:text-stone-400'}">
						<CalendarDays size={14} />
						{late ? 'Lejárt: ' : 'Határidő: '}{fmtDate(detailAssignment.due_date)}
					</p>
				{/if}
				{#if assignmentLoading}
					<p class="text-[13px] text-stone-400 dark:text-stone-500">Betöltés…</p>
				{:else if !data.own}
					{#if detailAssignment.require_text}
						<div>
							<label for="assignment-text" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
								Szöveges válasz
							</label>
							<textarea
								id="assignment-text"
								rows="5"
								maxlength="20000"
								placeholder="Írd ide a beadandót…"
								bind:value={assignmentText}
								oninput={scheduleAssignmentAutosave}
								disabled={assignmentSubmitBusy || (aSubmitted && aPastDue)}
								class={inputCls}
							></textarea>
							<p class="mt-1 text-[12px] text-stone-400 tabular-nums dark:text-stone-500">
								{assignmentText.trim().length} karakter{assignmentSaving ? ' · Mentés…' : assignmentTextSaved ? ' · Mentve' : ''}
							</p>
						</div>
					{/if}
				{#if aSubmitted && assignmentMine && (assignmentMine.grade !== null || (assignmentMine.feedback ?? '') !== '')}
						<div class="rounded-2xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
							{#if assignmentMine.grade !== null}
								<p class="flex items-center gap-2 text-[15px] font-extrabold text-ink-900 dark:text-white">
									<span class="grid size-7 place-items-center rounded-full bg-brand-500 text-[14px] text-white">
										{assignmentMine.grade}
									</span>
									Tanári értékelés
								</p>
							{/if}
							{#if assignmentMine.feedback}
								<p class="mt-1 text-sm leading-relaxed break-words whitespace-pre-line text-stone-600 dark:text-stone-300">{assignmentMine.feedback}</p>
							{/if}
						</div>
					{/if}
				{#if detailAssignment.require_images || (detailAssignment.require_audio ?? 0) === 1 || detailAssignment.require_files}
					<div class="rounded-2xl border border-stone-200 {aSubmitted ? 'p-2.5' : 'p-3.5'} dark:border-white/10">
						<div class="mb-1 flex items-center gap-2">
							<p class="flex min-w-0 flex-1 items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
								<Paperclip size={14} /> Csatolmányok ({aTotal})
							</p>
							{#if !aPastDue && !aSubmitted}
								<button
									type="button"
									aria-label="Csatolmány hozzáadása"
									disabled={assignmentUploadBusy}
									onclick={() => (attachPickOpen = true)}
									class="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 active:scale-95 disabled:opacity-60"
								>
									<Plus size={17} />
								</button>
							{/if}
						</div>
						{#if aTotal === 0 && !assignmentUploadBusy}
							<p class="text-[13px] text-stone-400 dark:text-stone-500">
								Még nincs csatolmány. A + gombbal adhatsz hozzá képet, hangot vagy fájlt.
							</p>
						{/if}
						{#if assignmentUploadBusy}
							<p class="text-[13px] text-stone-400 dark:text-stone-500">Feltöltés…</p>
						{/if}
						{#if detailAssignment.require_images && aImages.length > 0}
							<div class="mt-1.5 grid {aSubmitted ? 'grid-cols-4 gap-1' : 'grid-cols-3 gap-1.5'}">
								{#each aImages as u (u.id)}
									<div class="group relative overflow-hidden rounded-lg bg-stone-100 dark:bg-white/10">
										<img src={uploadUrl(detailAssignment.id, u.id)} alt={u.file_name} loading="lazy" class="aspect-square w-full object-cover" />
										{#if !aSubmitted && !aPastDue}
											<button
												type="button"
												aria-label="Kép törlése"
												onclick={() => deleteUpload(u.id)}
												class="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
											>
												<X size={14} />
											</button>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
						{#if (detailAssignment.require_audio ?? 0) === 1 && aAudios.length > 0}
							<ul class="mt-1.5 grid {aSubmitted ? 'gap-1' : 'gap-2'}">
								{#each aAudios as u, i (u.id)}
									<li class="rounded-xl bg-stone-100 {aSubmitted ? 'p-1.5' : 'p-2.5'} dark:bg-white/10">
										<div class="flex items-center gap-2">
											<p class="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">
												Hangfelvétel {i + 1} <span class="font-normal text-stone-400">({fmtSize(u.size)})</span>
											</p>
											{#if !aSubmitted && !aPastDue}
												<button
													type="button"
													aria-label="Hangfelvétel törlése"
													onclick={() => deleteUpload(u.id)}
													class="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-black/5 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
												>
													<X size={15} />
												</button>
											{/if}
										</div>
										<audio controls preload="none" src={uploadUrl(detailAssignment.id, u.id)} class="mt-1.5 w-full"></audio>
									</li>
								{/each}
							</ul>
						{/if}
						{#if detailAssignment.require_files && aFiles.length > 0}
							<ul class="mt-1.5 grid {aSubmitted ? 'gap-1' : 'gap-1.5'}">
								{#each aFiles as u (u.id)}
									<li class="flex items-center gap-2 rounded-xl bg-stone-100 {aSubmitted ? 'px-2.5 py-1.5' : 'px-3 py-2'} dark:bg-white/10">
										<a href={uploadUrl(detailAssignment.id, u.id)} class="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-700 dark:text-stone-200" download>
											{u.file_name} <span class="font-normal text-stone-400">({fmtSize(u.size)})</span>
										</a>
										{#if !aSubmitted && !aPastDue}
											<button
												type="button"
												aria-label="Fájl törlése"
												onclick={() => deleteUpload(u.id)}
												class="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-black/5 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
											>
												<X size={15} />
											</button>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
					{#if aSubmitted}
						<p class="flex items-center gap-1.5 text-[14px] font-extrabold text-emerald-700 dark:text-emerald-300">
							<Check size={16} /> {aTotal > 0 ? 'Beküldve' : 'Késznek jelölve'}{#if assignmentMine?.submitted_at} · {fmtDate(assignmentMine.submitted_at)}{/if}
						</p>
						<Button variant="outline" block disabled={assignmentSubmitBusy || aPastDue} onclick={() => submitAssignment(false)}>
							<Undo2 size={16} /> Visszavonom
						</Button>
					{:else}
						<Button block disabled={assignmentSubmitBusy || aPastDue} onclick={() => submitAssignment(true)}>
							<Send size={16} /> {assignmentSubmitBusy ? '…' : aTotal > 0 ? 'Beküldöm' : 'Megjelölés készként'}
						</Button>
						{#if aPastDue}
							<p class="text-[12px] text-stone-400 dark:text-stone-500">A határidő lejárt, már nem küldhető be.</p>
						{/if}
					{/if}
				{:else}
					<div>
						<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">
							Beküldések ({aSubmittedCount}/{assignmentResults.length})
						</p>
						{#if assignmentLoading}
							<p class="text-[13px] text-stone-400 dark:text-stone-500">Betöltés…</p>
						{:else if assignmentResults.length === 0}
							<p class="text-[13px] text-stone-400 dark:text-stone-500">Még senki sem küldte be.</p>
						{:else}
							<ul class="grid min-w-0 gap-1.5 overflow-hidden">
								{#each assignmentResults as r (r.user_id)}
									{@const graded = r.grade !== null && r.grade !== undefined}
									{@const done = r.submitted === 1}
									<li class="min-w-0">
										<button
											type="button"
											onclick={() => (gradingStudent = r)}
											aria-label={`${r.name} beküldésének megtekintése`}
											class="flex w-full min-w-0 items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-left transition hover:bg-stone-200/70 active:scale-[0.99] dark:bg-white/10 dark:hover:bg-white/15"
										>
											<span class="min-w-0 flex-1">
												<span class="block truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">
													{r.name}
												</span>
												<span class="block truncate text-[12px] {graded || done ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'text-stone-400 dark:text-stone-500'}">
													{assignmentStatus(r)}
												</span>
											</span>
											{#if graded}
												<span
													class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-500 text-[14px] font-extrabold text-white"
													title="Értékelve: {r.grade}"
												>
													{r.grade}
												</span>
											{:else if done}
												<span
													class="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
													title="Beküldve"
												>
													<Check size={15} strokeWidth={3} />
												</span>
											{/if}
											<ChevronRight size={16} class="shrink-0 text-stone-400 dark:text-stone-500" />
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	{:else if detailMsg}
		{#if editingMsg}
			<form onsubmit={saveMsgEdit} class="mt-3 grid gap-3.5" novalidate>
				<Input label="Cím" required placeholder="Üzenet címe" bind:value={editMsgTitle} disabled={savingEdit} error={editError} />
				<div>
					<label for="edit-msg-body" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
						Leírás
					</label>
					<textarea
						id="edit-msg-body"
						rows="3"
						maxlength="2000"
						bind:value={editMsgBody}
						disabled={savingEdit}
						class={inputCls}
					></textarea>
				</div>
				<div class="grid grid-cols-2 gap-2.5">
					<Button variant="outline" block disabled={savingEdit} onclick={() => (editingMsg = false)}>
						Mégse
					</Button>
					<Button type="submit" block busy={savingEdit} disabled={editMsgTitle.trim().length < 3}>
						{savingEdit ? 'Mentés…' : 'Mentés'}
					</Button>
				</div>
			</form>
		{:else}
		{@const chips = messageChips(detailMsg)}
		<div class="mt-3 grid min-w-0 gap-3 overflow-hidden">
			{#if detailMsg.body}
				<p class="text-sm leading-relaxed break-words whitespace-pre-line text-stone-600 dark:text-stone-300">{detailMsg.body}</p>
			{/if}
			<p class="text-[12px] text-stone-400 dark:text-stone-500">
				{detailMsg.teacher_name ?? ''} · {fmtTime(detailMsg.created_at)}
			</p>
			{#if chips.length > 0}
				<div>
					<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">
						Csatolmányok ({chips.length})
					</p>
					<ul class="grid min-w-0 gap-1.5 overflow-hidden">
						{#each chips as c (c.ref_type + ':' + c.ref_id)}
							{@const href = attachHrefFor(c.ref_type, c.ref_id)}
							<li class="min-w-0">
								{#if href}
									<a
										{href}
										class="flex min-w-0 items-center gap-1.5 rounded-xl bg-stone-100 px-3 py-2 text-[13px] font-bold text-ink-700 transition hover:bg-stone-200/70 dark:bg-white/10 dark:text-stone-200 dark:hover:bg-white/15"
									>
										{#if c.ref_type === 'subject'}<GraduationCap size={14} />{/if}
										{#if c.ref_type === 'lesson'}<BookOpen size={14} />{/if}
										{#if c.ref_type === 'quiz'}<Target size={14} />{/if}
										{#if c.ref_type === 'deck'}<Layers size={14} />{/if}
										{#if c.ref_type === 'topic'}<BookMarked size={14} />{/if}
										<span class="min-w-0 flex-1 truncate">{attachLabel(c.ref_type)}: {c.ref_title ?? ''}</span>
									</a>
								{:else}
									<p class="flex min-w-0 items-center gap-1.5 rounded-xl bg-stone-100 px-3 py-2 text-[13px] font-bold text-stone-500 dark:bg-white/10 dark:text-stone-400">
										{#if c.ref_type === 'topic'}<BookMarked size={14} />{/if}
										<span class="min-w-0 flex-1 truncate">{attachLabel(c.ref_type)}: {c.ref_title ?? ''}</span>
									</p>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
		{/if}
	{:else if detailTask}
		{#if editingTask}
			<form onsubmit={saveTaskEdit} class="mt-3 grid gap-3.5" novalidate>
				<Input label="Feladat címe" placeholder="pl. 3. lecke kvíz" bind:value={editTaskTitle} disabled={savingEdit} error={editError} />
				<div class="grid grid-cols-2 gap-3">
					<div>
						<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">Kérdések száma</p>
						<div class="flex items-center gap-2">
							<button type="button" aria-label="Kevesebb kérdés" class={stepperBtn} onclick={() => (editTaskCount = step(editTaskCount, -1, 1, 100))}>
								−
							</button>
							<span class="w-10 text-center text-[16px] font-extrabold text-ink-900 tabular-nums dark:text-white">
								{editTaskCount}
							</span>
							<button type="button" aria-label="Több kérdés" class={stepperBtn} onclick={() => (editTaskCount = step(editTaskCount, 1, 1, 100))}>
								+
							</button>
						</div>
					</div>
					<div>
						<p class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
							<Target size={14} /> Cél
						</p>
						<div class="flex items-center gap-2">
							<button type="button" aria-label="Kisebb cél" class={stepperBtn} onclick={() => (editTaskTarget = step(editTaskTarget, -5, 10, 100))}>
								−
							</button>
							<span class="w-10 text-center text-[16px] font-extrabold text-ink-900 tabular-nums dark:text-white">
								{editTaskTarget}%
							</span>
							<button type="button" aria-label="Nagyobb cél" class={stepperBtn} onclick={() => (editTaskTarget = step(editTaskTarget, 5, 10, 100))}>
								+
							</button>
						</div>
					</div>
				</div>
				<div>
					<label for="edit-task-due" class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
						<CalendarDays size={14} /> Határidő <span class="font-normal text-stone-400">(üresen hagyható)</span>
					</label>
					<input
						id="edit-task-due"
						type="datetime-local"
						bind:value={editTaskDue}
						disabled={savingEdit}
						class={[inputCls, 'dark:[color-scheme:dark]']}
					/>
				</div>
				<div class="grid grid-cols-2 gap-2.5">
					<Button variant="outline" block disabled={savingEdit} onclick={() => (editingTask = false)}>
						Mégse
					</Button>
					<Button type="submit" block busy={savingEdit}>
						{savingEdit ? 'Mentés…' : 'Mentés'}
					</Button>
				</div>
			</form>
		{:else}
		{@const lessons = parseTaskLessons(detailTask)}
		{@const submitted = (myResult?.submitted ?? 0) === 1}
		{@const pastDue = detailTask.due_date !== null && Date.now() > (detailTask.due_date ?? 0)}
		{@const submittedCount = taskResults.filter((r) => (r.submitted ?? 0) === 1).length}
			<div class="mt-3 grid min-w-0 gap-3 overflow-hidden">
			{#if !data.own}
				<div>
					<Button
						block
						size="lg"
						busy={quizLoading}
						disabled={quizLoading || lessons.length === 0}
						onclick={() => detailTask && startTaskQuiz(detailTask)}
					>
						<ListChecks size={18} /> {quizLoading ? 'Összeállítás…' : 'Kitöltés'}
					</Button>
				</div>
			{/if}
			{#if detailTask.due_date}
				{@const late = detailTask.due_date < Date.now()}
				<p class="flex items-center gap-1.5 text-[13px] font-bold {late ? 'text-red-600 dark:text-red-300' : 'text-stone-500 dark:text-stone-400'}">
					<CalendarDays size={14} />
					{late ? 'Lejárt: ' : 'Határidő: '}{fmtDate(detailTask.due_date)}
				</p>
			{/if}
			{#if !data.own}
				{#if resultsLoading && !myResult}
					<p class="text-[13px] text-stone-400 dark:text-stone-500">Betöltés…</p>
				{:else}
				<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
					{#if submitted}
						<p class="flex items-center gap-1.5 text-[14px] font-extrabold text-emerald-700 dark:text-emerald-300">
							<Check size={16} /> Beküldve
						</p>
						{#if myResult && myResult.attempts > 0}
							<p class="mt-1 text-[13px] text-stone-500 dark:text-stone-400">
								Legjobb: {myResult.best_score}/{myResult.best_total} ({myResult.best_pct}%)
							</p>
						{/if}
						<Button
							variant="outline"
							block
							disabled={submitBusy || pastDue}
							onclick={() => detailTask && toggleSubmit(detailTask, false)}
						>
							<Undo2 size={16} /> {submitBusy ? '…' : 'Visszavonom'}
						</Button>
						{#if pastDue}
							<p class="mt-1.5 text-[12px] text-stone-400 dark:text-stone-500">
								Határidő után már nem vonható vissza.
							</p>
						{/if}
					{:else}
						{#if myResult && myResult.attempts > 0}
							<p class="text-[14px] font-extrabold text-ink-900 dark:text-white">
								Legjobb: {myResult.best_score}/{myResult.best_total} ({myResult.best_pct}%)
							</p>
							<p class="mt-0.5 text-[13px] text-stone-500 dark:text-stone-400">
								{myResult.attempts} próbálkozás
							</p>
						{:else}
							<p class="text-[13px] text-stone-500 dark:text-stone-400">
								Töltsd ki a kvízt, az eredmény mentődik. A cél alatt is beküldheted.
							</p>
						{/if}
						<div class="mt-2">
							<Button
								block
								disabled={submitBusy || !myResult || myResult.attempts === 0}
								onclick={() => detailTask && toggleSubmit(detailTask, true)}
							>
								<Send size={16} /> {submitBusy ? '…' : 'Beküldöm'}
							</Button>
						</div>
					{/if}
				</div>
				{/if}
				{#if lastReview}
					<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
						<QuizReviewList review={lastReview} />
						<div class="mt-2.5 grid grid-cols-2 gap-2">
							<Button
								variant="outline"
								block
								disabled={quizLoading}
								onclick={() => detailTask && startTaskQuiz(detailTask)}
							>
								<RotateCcw size={16} /> Újra
							</Button>
							{#if !submitted}
								<Button
									block
									disabled={submitBusy || pastDue}
									onclick={() => detailTask && toggleSubmit(detailTask, true)}
								>
									<Send size={16} /> {submitBusy ? '…' : 'Beküldöm'}
								</Button>
							{/if}
						</div>
					</div>
				{/if}
			{:else}
				<div>
					<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">
						Kitöltések ({submittedCount}/{taskResults.length})
					</p>
					{#if resultsLoading}
						<p class="text-[13px] text-stone-400 dark:text-stone-500">Betöltés…</p>
					{:else if taskResults.length === 0}
						<p class="text-[13px] text-stone-400 dark:text-stone-500">Még senki sem töltötte ki!</p>
					{:else}
						<ul class="grid min-w-0 gap-1.5 overflow-hidden">
							{#each taskResults as r (r.user_id)}
								<li class="flex min-w-0 items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/10">
									<span class="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">
										{r.name}
									</span>
									{#if (r.submitted ?? 0) === 1}
										<span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
											<Check size={12} /> {r.best_pct ?? 0}%
										</span>
									{:else if (r.attempts ?? 0) > 0}
										<span class="shrink-0 text-[12px] font-bold text-stone-500 tabular-nums dark:text-stone-400">
											{r.best_pct ?? 0}%
										</span>
									{:else}
										<span class="shrink-0 text-[12px] text-stone-400 dark:text-stone-500">–</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
			{#if lessons.length > 0}
				<div>
					<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">
						Leckék ({lessons.length})
					</p>
					<ul class="grid min-w-0 gap-1.5 overflow-hidden">
						{#each lessons as l (l.id)}
							<li class="min-w-0">
								<a
									href={lessonPath(l.id)}
									class="block min-w-0 truncate rounded-xl bg-stone-100 px-3 py-2 text-[13px] font-bold text-ink-700 transition hover:bg-stone-200/70 dark:bg-white/10 dark:text-stone-200 dark:hover:bg-white/15"
								>
									{l.title}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
		{/if}
	{/if}
</Drawer>

<!-- Tanári beküldés-részletező: értékelés felül, feltöltések egymás alatt -->
<Drawer
	open={gradingStudent !== null && detailAssignment !== null}
	label="Beküldés részletei"
	title={gradingStudent?.name ?? 'Beküldés'}
	onBack={() => {
		gradingStudent = null;
		previewUpload = null;
	}}
	onClose={() => {
		gradingStudent = null;
		previewUpload = null;
	}}
>
	{#if gradingStudent && detailAssignment}
		{@const gs = gradingStudent}
		{@const gImgs = gs.uploads.filter((u) => u.kind === 'image')}
		{@const gAuds = gs.uploads.filter((u) => u.kind === 'audio')}
		{@const gFiles = gs.uploads.filter((u) => u.kind === 'file')}
		<div class="mt-3 grid min-w-0 gap-3 overflow-hidden">
			<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
				<p class="mb-1 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
					Értékelés
				</p>
				<AssignmentGrading
					classroomId={room.id}
					assignmentId={detailAssignment.id}
					student={gs}
					onSaved={onGradeSaved}
				/>
			</div>
			<p class="text-[13px] font-bold {gs.submitted === 1 ? 'text-emerald-700 dark:text-emerald-300' : 'text-stone-500 dark:text-stone-400'}">
				{assignmentStatus(gs)}{#if gs.submitted === 1 && gs.submitted_at} · {fmtDate(gs.submitted_at)}{/if}
			</p>
			{#if gs.text_body}
				<div class="rounded-2xl bg-stone-100 p-3.5 dark:bg-white/10">
					<p class="text-sm leading-relaxed break-words whitespace-pre-line text-stone-700 dark:text-stone-200">{gs.text_body}</p>
				</div>
			{/if}
			{#if gs.uploads.length === 0}
				<p class="text-[13px] text-stone-400 dark:text-stone-500">Nincs feltöltött fájl.</p>
			{:else}
				<div class="grid min-w-0 gap-2">
					<p class="text-[13px] font-semibold text-ink-900 dark:text-white">
						Feltöltések ({gs.uploads.length})
					</p>
					{#if gImgs.length > 0}
						<ul class="grid min-w-0 gap-2">
							{#each gImgs as u (u.id)}
								<li class="min-w-0">
									<button
										type="button"
										onclick={() => (previewUpload = u)}
										aria-label="{u.file_name} előnézete"
										class="block w-full overflow-hidden rounded-xl bg-stone-100 transition hover:opacity-90 active:scale-[0.99] dark:bg-white/10"
									>
										<img src={uploadUrl(detailAssignment.id, u.id)} alt={u.file_name} loading="lazy" class="max-h-64 w-full object-cover" />
									</button>
									<p class="mt-0.5 truncate text-[12px] text-stone-400 dark:text-stone-500">{u.file_name}</p>
								</li>
							{/each}
						</ul>
					{/if}
					{#if gAuds.length > 0}
						<ul class="grid min-w-0 gap-2">
							{#each gAuds as u, i (u.id)}
								<li class="rounded-xl bg-stone-100 p-2.5 dark:bg-white/10">
									<p class="truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">
										Hangfelvétel {i + 1} <span class="font-normal text-stone-400">({fmtSize(u.size)})</span>
									</p>
									<audio controls preload="none" src={uploadUrl(detailAssignment.id, u.id)} class="mt-1.5 w-full"></audio>
								</li>
							{/each}
						</ul>
					{/if}
					{#if gFiles.length > 0}
						<ul class="grid min-w-0 gap-1.5">
							{#each gFiles as u (u.id)}
								<li>
									<a
										href={uploadUrl(detailAssignment.id, u.id)}
										target="_blank"
										rel="noreferrer"
										class="flex min-w-0 items-center gap-2 rounded-xl bg-stone-100 px-3 py-2.5 text-[13px] font-bold text-ink-700 transition hover:bg-stone-200/70 dark:bg-white/10 dark:text-stone-200 dark:hover:bg-white/15"
									>
										<FileText size={15} class="shrink-0" />
										<span class="min-w-0 flex-1 truncate">{u.file_name} <span class="font-normal text-stone-400">({fmtSize(u.size)})</span></span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</Drawer>

{#if previewUpload && detailAssignment}
	<div class="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" role="presentation">
		<button type="button" tabindex="-1" aria-label="Előnézet bezárása" onclick={() => (previewUpload = null)} class="absolute inset-0"></button>
		<div class="relative max-h-full max-w-full overflow-auto">
			<img src={uploadUrl(detailAssignment.id, previewUpload.id)} alt={previewUpload.file_name} class="max-h-[80dvh] w-auto max-w-full rounded-xl" />
			<button
				type="button"
				onclick={() => (previewUpload = null)}
				aria-label="Bezárás"
				class="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
			>
				<X size={18} />
			</button>
		</div>
	</div>
{/if}

<QuizModal open={quizOpen} label={quizTitle || 'Kvíz'} title={quizTitle} onClose={() => (quizOpen = false)}>
	{#if quizQuestions.length > 0}
		{#key quizQuestions.map((q) => q.id).join(',')}
			<QuizRunner
				questions={quizQuestions}
				title={quizTitle}
				targetPct={detailTask?.target_pct ?? null}
				onReview={() => (quizOpen = false)}
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
		<div
			aria-disabled="true"
			class="flex w-full items-center gap-3.5 rounded-2xl border border-stone-200 p-4 opacity-50 dark:border-white/10"
		>
			<span class="grid size-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-ink-600 dark:bg-white/10 dark:text-white">
				<Timer size={22} />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Dolgozat (élő)</span>
				<span class="block truncate text-[13px] text-ink-400 dark:text-stone-500">Hamarosan</span>
			</span>
		</div>
	</div>
</Drawer>

<!-- Üzenet írása -->
<Drawer open={sheet === 'message'} label="Új üzenet" title="Új üzenet" wide onClose={closeSheet}>
	<form onsubmit={sendMessage} class="mt-3 grid gap-3.5" novalidate>
		<Input label="Cím" required placeholder="pl. Holnapi óra" bind:value={msgTitle} disabled={sendingMsg} error={msgError} />
		<div>
			<label for="msg-body" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
				Leírás
			</label>
			<textarea
				id="msg-body"
				rows="3"
				maxlength="2000"
				placeholder="Részletek az osztálynak (nem kötelező)"
				bind:value={msgBody}
				disabled={sendingMsg}
				class={inputCls}
			></textarea>
		</div>
		<div>
			<div class="mb-1.5 flex items-center justify-between gap-2">
				<p class="text-[13px] font-semibold text-ink-900 dark:text-white">Csatolmány</p>
				<button
					type="button"
					onclick={openAttach}
					disabled={sendingMsg}
					aria-label="Csatolmány választása"
					class="grid size-8 place-items-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95 disabled:pointer-events-none disabled:opacity-60 dark:shadow-black/30"
				>
					<Plus size={18} strokeWidth={3} />
				</button>
			</div>
			{#if attaches.length > 0}
				<ul class="grid min-w-0 gap-2">
					{#each attaches as a, i (a.type + ':' + a.id)}
						{@const AIcon = attachIcons[a.type] ?? BookOpen}
						<li class="flex min-w-0 items-center gap-2 rounded-2xl border border-brand-500/40 bg-brand-50 p-3 dark:bg-brand-500/15">
							<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-white">
								<AIcon size={17} />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[14px] font-extrabold text-ink-900 dark:text-white">
									{a.crumb}
								</span>
							</span>
							<button
								type="button"
								onclick={() => (attaches = attaches.filter((_, j) => j !== i))}
								aria-label="Csatolmány törlése"
								class="grid size-8 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-black/5 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
							>
								<X size={17} />
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-[13px] text-stone-400 dark:text-stone-500">
					A + gombbal csatolhatsz leckét, kvízt, kártyát vagy témakört, akár többet is.
				</p>
			{/if}
		</div>

		<Button type="submit" block busy={sendingMsg} disabled={msgTitle.trim().length < 3}>
			{sendingMsg ? 'Küldés…' : 'Üzenet küldése'}
		</Button>
	</form>
</Drawer>

<AttachSheet
	open={attachOpen}
	{subjects}
	{decks}
	onClose={() => (attachOpen = false)}
	onPick={(ps) => {
		const fresh = ps.filter((p) => !attaches.some((a) => a.type === p.type && a.id === p.id));
		attaches = [...attaches, ...fresh].slice(0, 10);
		attachOpen = false;
	}}
/>

<!-- Feladat kiosztása -->
<Drawer open={sheet === 'task'} label="Új feladat" title="Új feladat" wide onClose={closeSheet}>
	<form onsubmit={createTask} class="mt-3 grid gap-3.5" novalidate>
		<Input label="Feladat címe" placeholder="pl. 3. lecke kvíz (nem kötelező)" bind:value={taskTitle} disabled={creatingTask} error={taskError} />
		<div>
			<div class="mb-1.5 flex items-center justify-between gap-2">
				<p class="text-[13px] font-semibold text-ink-900 dark:text-white">
					Leckék{#if taskLessons.length > 0} ({taskLessons.length}){/if}
				</p>
				<button
					type="button"
					onclick={() => {
						ensureSubjects();
						taskPickerOpen = true;
					}}
					disabled={creatingTask}
					aria-label="Leckék választása"
					class="grid size-8 place-items-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95 disabled:pointer-events-none disabled:opacity-60 dark:shadow-black/30"
				>
					<Plus size={18} strokeWidth={3} />
				</button>
			</div>
			{#if taskLessons.length > 0}
				<ul class="grid min-w-0 gap-1.5">
					{#each taskLessons as t (t.lessonId)}
						<li class="flex min-w-0 items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 dark:bg-white/10">
							<span class="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-700 dark:text-stone-200">
								{t.crumb}
							</span>
							<button
								type="button"
								onclick={() => (taskLessons = taskLessons.filter((x) => x.lessonId !== t.lessonId))}
								aria-label="Lecke kivétele"
								class="grid size-7 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-black/5 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
							>
								<X size={15} />
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-[13px] text-stone-400 dark:text-stone-500">
					A + gombbal válassz kvízes leckéket, akár több témakörből is.
				</p>
			{/if}
		</div>
		<ContentPicker
			open={taskPickerOpen}
			{subjects}
			select="lesson"
			multi
			onlyWithQuiz
			initialSelected={taskLessons}
			onClose={() => (taskPickerOpen = false)}
			onPick={(ps) => {
				taskLessons = ps;
				taskPickerOpen = false;
			}}
		/>

		<div class="grid grid-cols-2 gap-3">
			<div>
				<p class="mb-1.5 text-[13px] font-semibold text-ink-900 dark:text-white">Kérdések száma</p>
				<div class="flex items-center gap-2">
					<button type="button" aria-label="Kevesebb kérdés" class={stepperBtn} onclick={() => (questionCount = step(questionCount, -1, 5, 100))}>
						−
					</button>
					<span class="w-10 text-center text-[16px] font-extrabold text-ink-900 tabular-nums dark:text-white">
						{questionCount}
					</span>
					<button type="button" aria-label="Több kérdés" class={stepperBtn} onclick={() => (questionCount = step(questionCount, 1, 5, 100))}>
						+
					</button>
				</div>
			</div>
			<div>
				<p class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
					<Target size={14} /> Célszázalék
				</p>
				<div class="flex items-center gap-2">
					<button type="button" aria-label="Kisebb cél" class={stepperBtn} onclick={() => (targetPct = step(targetPct, -5, 10, 100))}>
						−
					</button>
					<span class="w-10 text-center text-[16px] font-extrabold text-ink-900 tabular-nums dark:text-white">
						{targetPct}%
					</span>
					<button type="button" aria-label="Nagyobb cél" class={stepperBtn} onclick={() => (targetPct = step(targetPct, 5, 10, 100))}>
						+
					</button>
				</div>
			</div>
		</div>

		<div>
			<p class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
				<Shuffle size={14} /> Sorrend
			</p>
			<Segmented
				ariaLabel="Kérdéssorrend"
				bind:value={shuffleMode}
				options={[
					{ value: 'mixed', label: 'Kevert mindenkinek' },
					{ value: 'fixed', label: 'Fix sorrend' }
				]}
			/>
		</div>

		<div>
			<label for="task-due" class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
				<CalendarDays size={14} /> Határidő <span class="font-normal text-stone-400">(üresen hagyható)</span>
			</label>
			<input
				id="task-due"
				type="datetime-local"
				bind:value={dueInput}
				disabled={creatingTask}
				class={[inputCls, 'dark:[color-scheme:dark]']}
			/>
		</div>

		<Button type="submit" block busy={creatingTask} disabled={taskLessons.length === 0}>
			{creatingTask ? 'Kiosztás…' : 'Feladat kiosztása'}
		</Button>
	</form>
</Drawer>

<!-- Beadandó kiosztása -->
<Drawer open={sheet === 'assignment'} label="Új beadandó" title="Új beadandó" wide onClose={closeSheet}>
	<form onsubmit={createAssignment} class="mt-3 grid gap-3.5" novalidate>
		<Input label="Beadandó címe" required placeholder="pl. Olvasónapló 1. fejezet" bind:value={assignmentTitle} disabled={creatingAssignment} error={assignmentError} />
		<div>
			<label for="assignment-desc" class="mb-1.5 block text-[13px] font-semibold text-ink-900 dark:text-white">
				Leírás
			</label>
			<textarea
				id="assignment-desc"
				rows="3"
				maxlength="2000"
				placeholder="Mit kell beadni? (nem kötelező)"
				bind:value={assignmentDesc}
				disabled={creatingAssignment}
				class={inputCls}
			></textarea>
		</div>
		<div>
			<label for="assignment-due" class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-900 dark:text-white">
				<CalendarDays size={14} /> Határidő <span class="font-normal text-stone-400">(üresen hagyható)</span>
			</label>
			<input
				id="assignment-due"
				type="datetime-local"
				bind:value={assignmentDue}
				disabled={creatingAssignment}
				class={[inputCls, 'dark:[color-scheme:dark]']}
			/>
		</div>
		<div class="grid gap-2">
			<p class="text-[13px] font-semibold text-ink-900 dark:text-white">Mit kell beadni?</p>
			<div class="flex items-center justify-between gap-2">
				<span class="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-900 dark:text-white"><FileText size={15} /> Szöveg</span>
				<Switch bind:checked={assignmentRequireText} disabled={creatingAssignment} label="Szöveg kérése" />
			</div>
			<div class="flex items-center justify-between gap-2">
				<span class="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-900 dark:text-white"><ImageIcon size={15} /> Kép feltöltés</span>
				<Switch bind:checked={assignmentRequireImages} disabled={creatingAssignment} label="Kép feltöltés kérése" />
			</div>
			<div class="flex items-center justify-between gap-2">
				<span class="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-900 dark:text-white"><Mic size={15} /> Hangfelvétel</span>
				<Switch bind:checked={assignmentRequireAudio} disabled={creatingAssignment} label="Hangfelvétel kérése" />
			</div>
			<div class="flex items-center justify-between gap-2">
				<span class="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-900 dark:text-white"><FileUp size={15} /> Fájl feltöltés</span>
				<Switch bind:checked={assignmentRequireFiles} disabled={creatingAssignment} label="Fájl feltöltés kérése" />
			</div>
		</div>
		<Button type="submit" block busy={creatingAssignment}>
			{creatingAssignment ? 'Kiosztás…' : 'Beadandó kiosztása'}
		</Button>
	</form>
</Drawer>

<!-- Osztálybeállítások -->
<Drawer
	open={sheet === 'settings'}
	label={settingsView === 'members' ? 'Tagok' : 'Osztálybeállítások'}
	title={settingsView === 'members' ? `Tagok (${members.length})` : 'Osztálybeállítások'}
	onBack={settingsView === 'members'
		? () => {
				settingsView = 'main';
				confirmKickId = null;
			}
		: undefined}
	onClose={closeSheet}
>
	{#if settingsView === 'members'}
		<div class="mt-2 grid gap-2">
			{#if members.length === 0}
				<Card><p class="text-sm text-stone-500 dark:text-stone-400">Még senki nem csatlakozott.</p></Card>
			{:else}
				{#each members as m (m.id)}
					{@const confirm = confirmKickId === m.id}
					<Card>
						<div class="flex items-center gap-3">
	<div class="min-w-0 flex-1 self-center">
								<p class="truncate text-[15px] font-bold text-ink-900 dark:text-white">{m.name}</p>
								<p class="text-[12px] text-stone-400 dark:text-stone-500">
									Csatlakozott: {fmtDate(m.joined_at)}
								</p>
							</div>
							{#if data.own}
								<button
									type="button"
									onclick={() => kickMember(m.id, m.name)}
									disabled={kicking}
									aria-label={confirm ? 'Kidobás megerősítése' : `${m.name} kidobása`}
									class={[
										'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition active:scale-[0.98] disabled:opacity-60',
										confirm
											? 'bg-red-600 text-white hover:bg-red-700'
											: 'border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10'
									]}
								>
									<UserMinus size={15} />
									{confirm ? (kicking ? '…' : 'Biztos?') : 'Kidobom'}
								</button>
							{/if}
						</div>
					</Card>
				{/each}
			{/if}
		</div>
	{:else if data.own}
		<div class="mt-3 flex items-center gap-3">
			<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Értesítés</p>
			<Switch bind:checked={roomNotif} label="Értesítés" />
		</div>
		<form onsubmit={saveSettings} class="mt-3 grid gap-3.5" novalidate>
			<Input label="Osztály neve" required bind:value={setName} disabled={savingSettings} />
			<div>
				<SubjectPicker {subjects} bind:value={setSubjectId} disabled={savingSettings} />
			</div>
			<div class="grid grid-cols-2 gap-2.5">
				<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
					<p class="flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
						<Users size={13} /> Tagok
					</p>
					<p class="mt-1 text-[20px] font-extrabold text-ink-900 tabular-nums dark:text-white">
						{members.length}
					</p>
				</div>
				<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
					<p class="flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
						<CalendarDays size={13} /> Létrehozva
					</p>
					<p class="mt-1 text-[15px] font-extrabold text-ink-900 dark:text-white">
						{fmtDateOnly(room.created_at)}
					</p>
				</div>
			</div>
			<div class="rounded-2xl border border-stone-200 p-3.5 dark:border-white/10">
				<p class="text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">
					Csatlakozási kód
				</p>
				<div class="mt-1.5 flex items-center justify-between gap-2">
					<p class="font-mono text-[24px] font-extrabold tracking-[0.2em] text-ink-900 dark:text-white">
						{displayCode}
					</p>
					<div class="flex shrink-0 gap-2">
						<IconButton ariaLabel="Kód másolása" size={40} onclick={copyCode}>
							<Copy size={18} />
						</IconButton>
						<IconButton ariaLabel="Új kód generálása" size={40} disabled={regenCode} onclick={regenerateCode}>
							<RefreshCw size={18} />
						</IconButton>
					</div>
				</div>
			</div>
			<Button variant="outline" block onclick={() => (settingsView = 'members')}>
				<Users size={17} /> Tagok ({members.length})
			</Button>
			<Button variant="outline" block onclick={() => (statsOpen = true)}>
				<TrendingUp size={17} /> Statisztika
			</Button>
			<Button type="submit" block busy={savingSettings} disabled={setName.trim().length < 3}>
				{savingSettings ? 'Mentés…' : 'Mentés'}
			</Button>
		</form>
		<button
			type="button"
			onclick={() => {
				deleteOpen = true;
			}}
			class="mt-4 flex w-full items-center gap-3 rounded-2xl border border-red-200 p-4 text-left transition hover:bg-red-50 active:scale-[0.99] dark:border-red-500/30 dark:hover:bg-red-500/10"
		>
			<span class="min-w-0 flex-1">
				<span class="block text-[15px] font-bold text-ink-900 dark:text-white">Osztály törlése</span>
				<span class="block text-[13px] text-stone-500 dark:text-stone-400">
					Az üzenetek és feladatok is törlődnek.
				</span>
			</span>
			<span class="grid size-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300">
				<Trash2 size={18} />
			</span>
		</button>
	{:else}
		<div class="mt-3 flex items-center gap-3">
			<p class="min-w-0 flex-1 text-[15px] font-semibold text-ink-900 dark:text-white">Értesítés</p>
			<Switch bind:checked={roomNotif} label="Értesítés" />
		</div>
		<div class="mt-2.5 rounded-2xl border border-stone-200 p-4 dark:border-white/10">
			<p class="text-[12px] font-bold tracking-wide text-stone-400 uppercase dark:text-stone-500">Osztály</p>
			<p class="mt-1 truncate text-[15px] font-bold text-ink-900 dark:text-white">{displayName || room.name}</p>
			<p class="mt-0.5 text-[13px] text-stone-500 dark:text-stone-400">
				{[displaySubject, `${members.length} fő`].filter(Boolean).join(' · ')}
			</p>
		</div>
		<div class="mt-2.5">
			<Button variant="outline" block onclick={() => (settingsView = 'members')}>
				<Users size={17} /> Tagok ({members.length})
			</Button>
		</div>
		{#if !confirmLeave}
			<button
				type="button"
				onclick={() => (confirmLeave = true)}
				class="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-red-600 transition hover:bg-red-50 active:scale-[0.99] dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
			>
				<LogOut size={17} />
				Kilépés az osztályból
			</button>
		{/if}
	{/if}
</Drawer>

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
