import type { DurableObjectState } from '@cloudflare/workers-types';
import { DurableObject } from 'cloudflare:workers';
import type { LiveConfig, LiveQuestion } from './live';

/* Munkamenet-állapot a workers futtatóhoz. A WebSocketPair a futtató globálisa,
   a workers-types modulhatókörű deklarációja innen nem látszik, ezért lokálisan deklaráljuk. */
declare const WebSocketPair: new () => { 0: LiveSocket; 1: LiveSocket };
interface LiveSocket {
	send: (msg: string) => void;
}

/* Élő dolgozat Durable Object: hibernálható WebSocket szoba.
   Az API route ellenőriz, itt a hívóban bízunk, de userId kötelező. */

interface LiveParticipant {
	id: string;
	name: string;
	joinedAt: number;
	role: string;
}

interface LiveAnswer {
	answer: string;
	ok: boolean;
	at: number;
}

interface LiveViewer {
	id: string;
	name: string;
	joinedAt: number;
}

interface LiveState {
	initialized: boolean;
	config: LiveConfig | null;
	questions: LiveQuestion[];
	order: number[];
	userOrders: Record<string, number[]>;
	status: 'lobby' | 'live' | 'done';
	currentIndex: number;
	/** Diákok: csak ők számítanak résztvevőnek, eredménybe, számlálóba. */
	participants: Record<string, LiveParticipant>;
	/** Tanárok: nézők, soha nem részei a névsornak és a pontoknak. */
	viewers: Record<string, LiveViewer>;
	answers: Record<string, Record<string, LiveAnswer>>;
	startedAt: number | null;
	finishedAt: number | null;
}

interface RoomEnv {
	DB?: unknown;
}

function defaultState(): LiveState {
	return {
		initialized: false,
		config: null,
		questions: [],
		order: [],
		userOrders: {},
		status: 'lobby',
		currentIndex: 0,
		participants: {},
		viewers: {},
		answers: {},
		startedAt: null,
		finishedAt: null
	};
}

function shuffledOrder(n: number): number[] {
	const order = Array.from({ length: n }, (_, i) => i);
	for (let i = order.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[order[i], order[j]] = [order[j], order[i]];
	}
	return order;
}

/** Válasz kiértékelése kérdéstípusonként. */
export function checkLiveAnswer(question: LiveQuestion, raw: unknown): boolean {
	const answer = String(raw ?? '');
	const type = String(question.type ?? 'choice');
	if (type === 'text') {
		return normalizeText(answer) === normalizeText(question.correct_answer ?? '');
	}
	if (type === 'tf' || type === 'choice') {
		const multiple = (question.settings as { multiple?: boolean } | undefined)?.multiple === true;
		if (!multiple) return answer.trim() === String(question.correct_answer ?? '').trim();
		const actual = parseItems(answer);
		const expected = parseItems(String(question.correct_answer ?? ''));
		return (
			actual !== null &&
			expected !== null &&
			expected.length > 0 &&
			actual.length === expected.length &&
			new Set(actual).size === actual.length &&
			expected.every((item) => actual.includes(item))
		);
	}
	if (type === 'order' || type === 'match' || type === 'gap' || type === 'map') {
		const actual = parseItems(answer);
		const expected = parseItems(String(question.correct_answer ?? ''));
		return (
			actual !== null &&
			expected !== null &&
			expected.length > 0 &&
			actual.length === expected.length &&
			actual.every((item, index) => item === expected[index])
		);
	}
	return answer.trim() === String(question.correct_answer ?? '').trim();
}

/** Kisbetűs, ékezet nélküli összevetés szöveges válaszhoz. */
function normalizeText(value: string): string {
	return String(value ?? '')
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

function parseItems(answer: string): string[] | null {
	try {
		const value: unknown = JSON.parse(answer ?? 'null');
		return Array.isArray(value) && value.every((item) => typeof item === 'string')
			? (value as string[])
			: null;
	} catch {
		return null;
	}
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/* A workerd a DurableObject alaposztályból származó exportált osztályokat ismeri fel:
   ezért terjesztjük ki formálisan is, nem csak strukturálisan egyezünk. */
export class LiveRoom extends DurableObject<RoomEnv> {
	private state: DurableObjectState;
	private room: LiveState = defaultState();
	private loaded = false;

	constructor(state: DurableObjectState, env: RoomEnv) {
		super(state, env);
		this.state = state;
		state.blockConcurrencyWhile(async () => {
			await this.load();
		});
	}

	private async load(): Promise<void> {
		if (this.loaded) return;
		try {
			const stored = await this.state.storage.get<LiveState>('live');
			if (stored && typeof stored === 'object') this.room = { ...defaultState(), ...stored };
		} catch {
			this.room = defaultState();
		}
		this.loaded = true;
	}

	private async save(): Promise<void> {
		try {
			await this.state.storage.put('live', this.room);
		} catch {
			// tárolóhiba nem akaszthatja meg a termet
		}
	}

	private orderFor(userId: string): number[] {
		const n = this.room.questions.length;
		const base =
			this.room.order.length === n ? this.room.order : Array.from({ length: n }, (_, i) => i);
		if (this.room.config?.orderMode !== 'shuffled') return base;
		const personal = this.room.userOrders[userId];
		if (Array.isArray(personal) && personal.length === n) return personal;
		return base;
	}

	private orderedQuestions(userId: string): LiveQuestion[] {
		const order = this.orderFor(userId);
		const out: LiveQuestion[] = [];
		for (const i of order) {
			const q = this.room.questions[i];
			if (q) out.push(q);
		}
		return out;
	}

	private isTeacherView(userId: string | null): boolean {
		if (!userId) return false;
		if (this.room.viewers[userId]) return true;
		return this.room.participants[userId]?.role === 'teacher';
	}

	/** Névsor tanár nélkül: régi termekben bennragadt tanár-résztvevőt is szűrjük. */
	private roster(): LiveParticipant[] {
		return Object.values(this.room.participants).filter((p) => p.role !== 'teacher');
	}

	private scores(): { userId: string; name: string; score: number; total: number; answered: number }[] {
		const total = this.room.questions.length;
		return this.roster().map((p) => {
			const rows = this.room.answers[p.id] ?? {};
			let score = 0;
			for (const key of Object.keys(rows)) {
				if (rows[key]?.ok) score++;
			}
			return { userId: p.id, name: p.name, score, total, answered: Object.keys(rows).length };
		});
	}

	/* Pillanatkép adott nézőnek: diák stage módban csak opciókat kap,
	   a kérdésszöveg helyett 'Nézd a táblát' áll. Megoldás soha nem megy ki diáknak. */
	snapshotFor(userId: string | null): Record<string, unknown> {
		const teacher = this.isTeacherView(userId);
		const stage = this.room.config?.playMode === 'stage';
		const ordered = userId ? this.orderedQuestions(userId) : this.room.questions;
		const questions = ordered.map((q) => {
			if (teacher) return q;
			const masked: LiveQuestion = {
				id: q.id,
				question_text: stage ? 'Nézd a táblát' : q.question_text,
				type: q.type,
				options: [...(q.options ?? [])],
				pairs: (q.pairs ?? []).map((p) => ({ left: p.left, right: '' })),
				correct_answer: ''
			};
			return masked;
		});
		const roster = this.roster();
		const rosterIds = new Set(roster.map((p) => p.id));
		const result: Record<string, unknown> = {
			status: this.room.status,
			currentIndex: this.room.currentIndex,
			total: this.room.questions.length,
			playMode: this.room.config?.playMode ?? 'solo',
			pacing: this.room.config?.pacing ?? 'self',
			orderMode: this.room.config?.orderMode ?? 'same',
			questions,
			participants: roster.map((p) =>
				teacher ? p : { id: p.id, name: p.name }
			),
			myAnswers: userId ? (this.room.answers[userId] ?? {}) : {},
			startedAt: this.room.startedAt,
			finishedAt: this.room.finishedAt
		};
		if (teacher) {
			const counts = this.room.questions.map((_, qi) => {
				let answered = 0;
				let correct = 0;
				for (const uid of rosterIds) {
					const row = this.room.answers[uid]?.[String(qi)];
					if (row) {
						answered++;
						if (row.ok) correct++;
					}
				}
				return { answered, correct };
			});
			// Szavazateloszlás a táblához: kérdésindex -> válasz -> darab (csak diákok).
			const dist: Record<string, Record<string, number>> = {};
			this.room.questions.forEach((_, qi) => {
				const tally: Record<string, number> = {};
				for (const uid of rosterIds) {
					const row = this.room.answers[uid]?.[String(qi)];
					if (row) tally[row.answer] = (tally[row.answer] ?? 0) + 1;
				}
				if (Object.keys(tally).length > 0) dist[String(qi)] = tally;
			});
			result['counts'] = counts;
			result['dist'] = dist;
			result['scores'] = this.scores();
			// Diákonkénti válaszzéletek a tanári nézethez: ki mire mit válaszolt.
			result['details'] = roster.map((p) => ({
				userId: p.id,
				name: p.name,
				answers: Object.entries(this.room.answers[p.id] ?? {})
					.map(([key, row]) => ({ index: Number(key), answer: row.answer ?? '', ok: row.ok === true }))
					.filter((a) => Number.isInteger(a.index))
					.sort((a, b) => a.index - b.index)
			}));
		} else {
			result['scores'] = this.room.status === 'done' ? this.scores() : [];
		}
		return result;
	}

	private broadcast(): void {
		let sockets: { send: (msg: string) => void }[] = [];
		try {
			const raw = (this.state as unknown as { getWebSockets: (tag?: string) => unknown[] }).getWebSockets();
			sockets = raw as typeof sockets;
		} catch {
			sockets = [];
		}
		for (const ws of sockets) {
			let userId: string | null = null;
			try {
				const tags = (
					this.state as unknown as { getTags: (ws: unknown) => unknown }
				).getTags(ws);
				userId = Array.isArray(tags) && tags.length > 0 ? String(tags[0]) : null;
			} catch {
				userId = null;
			}
			try {
				ws.send(JSON.stringify({ type: 'snapshot', userId, ...this.snapshotFor(userId) }));
			} catch {
				// halott socket: záródik magától
			}
		}
	}

	private ensureUserOrder(userId: string): void {
		const n = this.room.questions.length;
		if (this.room.config?.orderMode !== 'shuffled') return;
		const current = this.room.userOrders[userId];
		if (!Array.isArray(current) || current.length !== n) {
			this.room.userOrders[userId] = shuffledOrder(n);
		}
	}

	/* Tanár sosem résztvevő: nézőként rögzítjük, a régi tanár-résztvevőt
	   is áttesszük a nézők közé, hogy a névsorból és a pontokból kikerüljön. */
	private attachViewer(userId: string, name: string, isTeacher: boolean): void {
		if (!isTeacher) return;
		const clean = String(name || 'Tanár').slice(0, 80) || 'Tanár';
		const existing = this.room.participants[userId];
		if (existing && existing.role === 'teacher') delete this.room.participants[userId];
		if (!this.room.viewers[userId]) {
			this.room.viewers[userId] = { id: userId, name: clean, joinedAt: Date.now() };
		} else {
			this.room.viewers[userId].name = clean;
		}
	}

	private isViewer(userId: string): boolean {
		if (this.room.viewers[userId]) return true;
		return this.room.participants[userId]?.role === 'teacher';
	}

	// A worker Request és a DOM Request típusa eltér: any-vel fogadjuk, belül csak
	// szabványos tagokat (headers, method, url, json) használunk.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async fetch(request: any): Promise<Response> {
		await this.load();
		const upgrade = request.headers.get('Upgrade') ?? request.headers.get('upgrade');
		if (upgrade && upgrade.toLowerCase() === 'websocket') {
			return this.handleSocket(request);
		}
		if (request.method === 'POST') {
			let body: Record<string, unknown> = {};
			try {
				body = asRecord(await request.json());
			} catch {
				return Response.json({ error: 'Hibás kérés.' }, { status: 400 });
			}
			return this.handleEvent(body);
		}
		const url = new URL(request.url);
		const userId = url.searchParams.get('userId') ?? url.searchParams.get('user_id');
		return Response.json({ ok: true, userId, ...this.snapshotFor(userId) });
	}

	private handleSocket(request: Request): Response {
		const url = new URL(request.url);
		const userId = url.searchParams.get('userId') ?? url.searchParams.get('user_id') ?? '';
		if (!userId) {
			return Response.json({ error: 'Hiányzó userId.' }, { status: 400 });
		}
		const name = url.searchParams.get('name') ?? '';
		const role = url.searchParams.get('role') ?? 'student';
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		try {
			(this.state as unknown as { acceptWebSocket: (ws: unknown, tags: string[]) => void }).acceptWebSocket(
				server,
				[userId]
			);
		} catch {
			return Response.json({ error: 'A socket nem fogadható.' }, { status: 500 });
		}
		if (name) {
			this.attachViewer(userId, name, role === 'teacher');
			void this.save().then(() => this.broadcast());
		}
		try {
			server.send(JSON.stringify({ type: 'snapshot', userId, ...this.snapshotFor(userId) }));
		} catch {
			// első küldés hibája nem végzetes
		}
		return new Response(null, { status: 101, webSocket: client } as unknown as ResponseInit);
	}

	private async handleEvent(body: Record<string, unknown>): Promise<Response> {
		const type = String(body['type'] ?? '');
		if (type === 'init') {
			const config = asRecord(body['config']);
			const rawQuestions = Array.isArray(body['questions']) ? body['questions'] : [];
			const questions = (rawQuestions as LiveQuestion[]).filter(
				(q) => q && typeof q.id === 'string' && typeof q.question_text === 'string'
			);
			const lessonIds = Array.isArray(config['lessonIds'])
				? (config['lessonIds'] as unknown[]).map(String)
				: [];
			const pacing = config['pacing'] === 'synced' ? 'synced' : 'self';
			const playMode = config['playMode'] === 'stage' ? 'stage' : 'solo';
			// Együtt haladásnál és tantermi módban a közös index csak közös sorrenddel értelmes.
			const orderMode = pacing === 'synced' || playMode === 'stage' || config['orderMode'] !== 'shuffled' ? 'same' : 'shuffled';
			this.room = {
				...defaultState(),
				initialized: true,
				config: {
					lessonIds,
					deckIds: Array.isArray(config['deckIds'])
						? (config['deckIds'] as unknown[]).map(String)
						: [],
					orderMode,
					count: Math.max(1, Math.floor(Number(config['count']) || questions.length || 1)),
					pacing,
					playMode
				},
				questions,
				order: Array.from({ length: questions.length }, (_, i) => i),
				status: 'lobby',
				currentIndex: 0
			};
			await this.save();
			this.broadcast();
			return Response.json({ ok: true, total: questions.length });
		}
		if (type === 'join') {
			const userId = String(body['userId'] ?? '').trim();
			const name = String(body['name'] ?? 'Diák').slice(0, 80) || 'Diák';
			const role = body['role'] === 'teacher' ? 'teacher' : 'student';
			if (!userId) return Response.json({ error: 'Hiányzó userId.' }, { status: 400 });
			if (role === 'teacher') {
				this.attachViewer(userId, name, true);
			} else if (!this.room.participants[userId]) {
				this.room.participants[userId] = { id: userId, name, joinedAt: Date.now(), role };
				this.ensureUserOrder(userId);
			} else {
				this.room.participants[userId].name = name;
			}
			await this.save();
			this.broadcast();
			return Response.json({ ok: true, ...this.snapshotFor(userId) });
		}
		if (type === 'start') {
			this.room.status = 'live';
			if (!this.room.startedAt) this.room.startedAt = Date.now();
			await this.save();
			this.broadcast();
			return Response.json({ ok: true, status: this.room.status });
		}
		if (type === 'answer') {
			const userId = String(body['userId'] ?? '').trim();
			const questionIdx = Math.floor(Number(body['questionIdx']));
			if (!userId) return Response.json({ error: 'Hiányzó userId.' }, { status: 400 });
			if (this.isViewer(userId)) return Response.json({ error: 'A tanár nem válaszol.' }, { status: 403 });
			// A kliens a saját sorrendjében indexel: kevert módban visszafejtjük az alapindexre.
			const order = this.orderFor(userId);
			if (!Number.isInteger(questionIdx) || questionIdx < 0 || questionIdx >= order.length) {
				return Response.json({ error: 'Hibás kérdésindex.' }, { status: 400 });
			}
			const baseIdx = order[questionIdx];
			const question = this.room.questions[baseIdx];
			if (!question) return Response.json({ error: 'Hibás kérdésindex.' }, { status: 400 });
			const ok = checkLiveAnswer(question, body['answer']);
			const rows = this.room.answers[userId] ?? {};
			rows[String(baseIdx)] = { answer: String(body['answer'] ?? ''), ok, at: Date.now() };
			this.room.answers[userId] = rows;
			await this.save();
			this.broadcast();
			return Response.json({ ok, saved: true });
		}
		if (type === 'next') {
			const raw = body['index'];
			const next =
				raw === undefined || raw === null || String(raw) === ''
					? this.room.currentIndex + 1
					: Math.floor(Number(raw));
			const max = Math.max(0, this.room.questions.length - 1);
			this.room.currentIndex = Number.isFinite(next) ? Math.min(Math.max(0, next), max) : 0;
			await this.save();
			this.broadcast();
			return Response.json({ ok: true, currentIndex: this.room.currentIndex });
		}
		if (type === 'finish') {
			this.room.status = 'done';
			this.room.finishedAt = Date.now();
			await this.save();
			this.broadcast();
			return Response.json({ ok: true, results: this.scores() });
		}
		return Response.json({ error: 'Ismeretlen esemény.' }, { status: 400 });
	}

	async webSocketMessage(ws: unknown, message: unknown): Promise<void> {
		await this.load();
		let body: Record<string, unknown> = {};
		try {
			body = asRecord(JSON.parse(typeof message === 'string' ? message : ''));
		} catch {
			return;
		}
		if (String(body['type'] ?? '') === 'answer') {
			let userId: string | null = null;
			try {
				const tags = (
					this.state as unknown as { getTags: (socket: unknown) => unknown }
				).getTags(ws);
				userId = Array.isArray(tags) && tags.length > 0 ? String(tags[0]) : null;
			} catch {
				userId = null;
			}
			const uid = String(body['userId'] ?? userId ?? '').trim();
			const questionIdx = Math.floor(Number(body['questionIdx']));
			if (!uid || !Number.isInteger(questionIdx)) return;
			if (this.isViewer(uid)) return;
			const order = this.orderFor(uid);
			if (questionIdx < 0 || questionIdx >= order.length) return;
			const baseIdx = order[questionIdx];
			const question = this.room.questions[baseIdx];
			if (!question) return;
			const ok = checkLiveAnswer(question, body['answer']);
			const rows = this.room.answers[uid] ?? {};
			rows[String(baseIdx)] = { answer: String(body['answer'] ?? ''), ok, at: Date.now() };
			this.room.answers[uid] = rows;
			await this.save();
			this.broadcast();
		}
	}

	async webSocketClose(): Promise<void> {
		// Résztvevőt nem törlünk: az eredménye megmarad.
	}

	async webSocketError(): Promise<void> {
		// Nincs teendő, a kapcsolat záródik.
	}
}
