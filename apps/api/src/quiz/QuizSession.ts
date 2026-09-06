import { DurableObject } from "cloudflare:workers";
import {
	initialMachineState,
	QUESTION_DURATION_MS,
	reduce,
	scoreAnswer,
	studentMayReveal,
	type Phase,
	type QuizEvent,
	type QuizMachineState,
} from "./machine";
import { buildQuestions, typedMatches, type QuizQuestion, type SourceCard } from "./questions";

export type WsAttachment = {
	userId: string;
	role: "teacher" | "student";
	displayName: string;
};

export type StartQuizInput = {
	sessionId: string;
	classId: string;
	setId: string;
	teacherId: string;
	pace?: "teacher" | "timed" | "auto";
	seconds?: number;
	questionMode?: "choice" | "type" | "random";
};

export type QuizSnapshot = {
	sessionId: string;
	phase: Phase;
	questionIndex: number;
	questionCount: number;
	question: {
		prompt: string;
		kind: "choice" | "type";
		choices: string[];
		deadlineAt: number | null;
		correctIndex?: number;
		expected?: string;
	} | null;
	participants: WsAttachment[];
	results: {
		questionIndex: number;
		correctIndex: number;
		expected?: string;
		answers: { userId: string; displayName: string; choice: number; typed?: string | null; correct: boolean }[];
	} | null;
	scores: { userId: string; displayName: string; points: number }[];
};

const RESULTS_HOLD_MS = 2500;

type StateRow = {
	session_id: string;
	class_id: string;
	set_id: string;
	teacher_id: string;
	phase: Phase;
	question_index: number;
	question_count: number;
	deadline_at: number | null;
	remaining_ms: number | null;
	pace: "teacher" | "timed" | "auto";
	seconds: number;
};

export class QuizSession extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			this.migrate();
		});
		this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
	}

	private migrate() {
		this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
				id INTEGER PRIMARY KEY,
				applied_at TEXT NOT NULL DEFAULT (datetime('now'))
			)
		`);
		const currentVersion = this.ctx.storage.sql
			.exec<{ version: number }>("SELECT COALESCE(MAX(id), 0) as version FROM _sql_schema_migrations")
			.one().version;

		if (currentVersion < 1) {
			this.ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS quiz_state (
					id INTEGER PRIMARY KEY CHECK (id = 1),
					session_id TEXT NOT NULL,
					class_id TEXT NOT NULL,
					set_id TEXT NOT NULL,
					teacher_id TEXT NOT NULL,
					phase TEXT NOT NULL,
					question_index INTEGER NOT NULL DEFAULT -1,
					question_count INTEGER NOT NULL DEFAULT 0,
					deadline_at INTEGER
				);
				CREATE TABLE IF NOT EXISTS quiz_questions (
					idx INTEGER PRIMARY KEY,
					card_id TEXT NOT NULL,
					prompt TEXT NOT NULL,
					choices_json TEXT NOT NULL,
					correct_index INTEGER NOT NULL
				);
				CREATE TABLE IF NOT EXISTS quiz_answers (
					question_idx INTEGER NOT NULL,
					user_id TEXT NOT NULL,
					choice INTEGER NOT NULL,
					submitted_at INTEGER NOT NULL,
					PRIMARY KEY (question_idx, user_id)
				);
				INSERT INTO _sql_schema_migrations (id) VALUES (1);
			`);
		}
		if (currentVersion < 2) {
			this.ctx.storage.sql.exec(`ALTER TABLE quiz_state ADD COLUMN pace TEXT NOT NULL DEFAULT 'teacher'`);
			this.ctx.storage.sql.exec(`ALTER TABLE quiz_state ADD COLUMN seconds INTEGER NOT NULL DEFAULT 30`);
			this.ctx.storage.sql.exec(`ALTER TABLE quiz_questions ADD COLUMN kind TEXT NOT NULL DEFAULT 'choice'`);
			this.ctx.storage.sql.exec(`ALTER TABLE quiz_questions ADD COLUMN expected TEXT NOT NULL DEFAULT ''`);
			this.ctx.storage.sql.exec(`ALTER TABLE quiz_answers ADD COLUMN typed TEXT`);
			this.ctx.storage.sql.exec(`INSERT INTO _sql_schema_migrations (id) VALUES (2)`);
		}
		if (currentVersion < 3) {
			this.ctx.storage.sql.exec(`ALTER TABLE quiz_state ADD COLUMN remaining_ms INTEGER`);
			this.ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS quiz_scores (
					user_id TEXT PRIMARY KEY,
					points INTEGER NOT NULL DEFAULT 0
				)
			`);
			this.ctx.storage.sql.exec(`INSERT INTO _sql_schema_migrations (id) VALUES (3)`);
		}
	}

	async startQuiz(input: StartQuizInput): Promise<{ ok: true } | { ok: false; error: string }> {
		const existing = this.stateRow();
		if (existing) return { ok: true };

		const result = await this.env.DB.prepare(
			`SELECT id, front, back, hint, example FROM cards WHERE set_id = ? AND deleted_at IS NULL ORDER BY sort_order, id`,
		)
			.bind(input.setId)
			.all<SourceCard>();
		const cards = result.results ?? [];
		if (cards.length < 1) return { ok: false, error: "Set has no cards" };

		const questions = buildQuestions(cards, input.questionMode ?? "choice");
		const machine = initialMachineState(questions.length);
		const pace = input.pace ?? "teacher";
		const seconds = input.seconds ?? 30;
		this.ctx.storage.sql.exec(
			`INSERT INTO quiz_state (id, session_id, class_id, set_id, teacher_id, phase, question_index, question_count, deadline_at, pace, seconds)
			 VALUES (1, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
			input.sessionId,
			input.classId,
			input.setId,
			input.teacherId,
			machine.phase,
			machine.questionIndex,
			machine.questionCount,
			pace,
			seconds,
		);
		for (const question of questions) {
			this.ctx.storage.sql.exec(
				`INSERT INTO quiz_questions (idx, card_id, prompt, choices_json, correct_index, kind, expected) VALUES (?, ?, ?, ?, ?, ?, ?)`,
				question.idx,
				question.cardId,
				question.prompt,
				JSON.stringify(question.choices),
				question.correctIndex,
				question.kind,
				question.expected,
			);
		}
		return { ok: true };
	}

	async getSnapshot(viewer?: { userId: string; role: string }): Promise<QuizSnapshot | null> {
		return this.snapshot(viewer);
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected WebSocket", { status: 426 });
		}
		if (!this.stateRow()) {
			return new Response("Quiz not started", { status: 404 });
		}
		const userId = request.headers.get("X-User-Id") ?? "";
		const role = request.headers.get("X-Role") === "teacher" ? "teacher" : "student";
		const displayName = request.headers.get("X-Display-Name") ?? "Unknown";
		if (!userId) return new Response("Unauthorized", { status: 401 });

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.ctx.acceptWebSocket(server);
		const attachment: WsAttachment = { userId, role, displayName };
		server.serializeAttachment(attachment);
		this.broadcast({ type: "presence", participants: this.connectedParticipants() });
		const snap = this.snapshot({ userId, role });
		if (snap) server.send(JSON.stringify({ type: "snapshot", ...snap }));
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const attachment = ws.deserializeAttachment() as WsAttachment | null;
		if (!attachment) {
			ws.send(JSON.stringify({ type: "error", error: "Missing attachment" }));
			return;
		}
		if (typeof message !== "string") return;

		let parsed: { type?: string; questionIndex?: number; choice?: number; typed?: string };
		try {
			parsed = JSON.parse(message) as { type?: string; questionIndex?: number; choice?: number; typed?: string };
		} catch {
			ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
			return;
		}

		const type = parsed.type;
		if (type === "answer") {
			if (attachment.role !== "student") {
				ws.send(JSON.stringify({ type: "error", error: "Students only" }));
				return;
			}
			await this.apply(
				{
					type: "answer",
					userId: attachment.userId,
					questionIndex: Number(parsed.questionIndex),
					choice: parsed.choice,
					typed: parsed.typed,
				},
				ws,
			);
			return;
		}

		if (attachment.role !== "teacher") {
			ws.send(JSON.stringify({ type: "error", error: "Teacher only" }));
			return;
		}
		const hostId = this.stateRow()?.teacher_id;
		if (!hostId || attachment.userId !== hostId) {
			ws.send(JSON.stringify({ type: "error", error: "Host only" }));
			return;
		}

		if (type === "next") {
			await this.hostNext(ws);
			return;
		}
		if (type === "pause") {
			await this.apply({ type: "close_question" }, ws);
			return;
		}
		if (type === "resume") {
			await this.apply({ type: "resume_question" }, ws);
			return;
		}

		const teacherCmds = ["start_quiz", "start_question", "close_question", "resume_question", "show_results", "end_quiz"] as const;
		if (!teacherCmds.includes(type as (typeof teacherCmds)[number])) {
			ws.send(JSON.stringify({ type: "error", error: "Unknown command" }));
			return;
		}
		await this.apply({ type: type as Exclude<QuizEvent["type"], "answer"> }, ws);
	}

	async webSocketClose(_ws: WebSocket, _code: number, _reason: string) {
		this.broadcast({ type: "presence", participants: this.connectedParticipants() });
	}

	async webSocketError(_ws: WebSocket, _error: unknown) {
		this.broadcast({ type: "presence", participants: this.connectedParticipants() });
	}

	async alarm(): Promise<void> {
		const pace = this.stateRow()?.pace ?? "teacher";
		let machine = this.readMachine();
		if (!machine) return;

		if (machine.phase === "QUESTION_OPEN") {
			await this.apply({ type: "close_question" });
			machine = this.readMachine();
			if (machine && (pace === "auto" || pace === "timed")) {
				await this.apply({ type: "show_results" });
				if (pace === "auto") {
					await this.ctx.storage.setAlarm(Date.now() + RESULTS_HOLD_MS);
				}
			}
			return;
		}

		if (machine.phase === "RESULTS_SHOWN" && pace === "auto") {
			const next = machine.questionIndex + 1;
			if (next >= machine.questionCount) await this.apply({ type: "end_quiz" });
			else await this.apply({ type: "start_question" });
		}
	}

	private async apply(event: QuizEvent, ws?: WebSocket) {
		const machine = this.readMachine();
		if (!machine) {
			ws?.send(JSON.stringify({ type: "error", error: "Quiz not initialized" }));
			return;
		}
		const result = reduce(machine, event);
		if (!result.ok) {
			ws?.send(JSON.stringify({ type: "error", error: result.error }));
			return;
		}

		if (event.type === "answer") {
			const question = this.questions()[event.questionIndex];
			let choice = event.choice ?? -1;
			if (event.typed && question) {
				choice = typedMatches(event.typed, question.expected) ? 1 : 0;
			}
			this.ctx.storage.sql.exec(
				`INSERT OR IGNORE INTO quiz_answers (question_idx, user_id, choice, submitted_at, typed) VALUES (?, ?, ?, ?, ?)`,
				event.questionIndex,
				event.userId,
				choice,
				Date.now(),
				event.typed ?? null,
			);
			if (question) {
				const correct =
					question.kind === "type"
						? typedMatches(event.typed ?? "", question.expected)
						: choice === question.correctIndex;
				const row = this.stateRow();
				const remaining = row?.deadline_at ? Math.max(0, row.deadline_at - Date.now()) : 0;
				const total = (row?.seconds && row.seconds > 0 ? row.seconds : QUESTION_DURATION_MS / 1000) * 1000;
				const points = scoreAnswer(correct, remaining, total);
				if (points > 0) {
					this.ctx.storage.sql.exec(
						`INSERT INTO quiz_scores (user_id, points) VALUES (?, ?)
						 ON CONFLICT(user_id) DO UPDATE SET points = points + excluded.points`,
						event.userId,
						points,
					);
				}
			}
		}

		this.persistMachine(result.state);
		const pace = this.stateRow()?.pace ?? "teacher";
		const seconds = this.stateRow()?.seconds ?? 30;
		for (const effect of result.effects) {
			if (effect.type === "schedule_deadline") {
				if (pace === "teacher") continue;
				const row = this.stateRow();
				const durationMs = (seconds > 0 ? seconds : QUESTION_DURATION_MS / 1000) * 1000;
				const remaining = event.type === "resume_question" ? row?.remaining_ms : null;
				const useMs = remaining != null && remaining > 0 ? remaining : durationMs;
				const deadline = Date.now() + useMs;
				this.setDeadline(deadline);
				this.ctx.storage.sql.exec(`UPDATE quiz_state SET remaining_ms = NULL WHERE id = 1`);
				await this.ctx.storage.setAlarm(deadline);
			}
			if (effect.type === "cancel_deadline") {
				const row = this.stateRow();
				if (row?.deadline_at) {
					const remaining = Math.max(0, row.deadline_at - Date.now());
					this.ctx.storage.sql.exec(`UPDATE quiz_state SET remaining_ms = ? WHERE id = 1`, remaining);
				}
				await this.ctx.storage.deleteAlarm();
				this.clearDeadline();
			}
			if (effect.type === "broadcast_phase") {
				this.broadcast({ type: "phase", phase: result.state.phase, questionIndex: result.state.questionIndex });
			}
			if (effect.type === "broadcast_question") {
				this.broadcastQuestion(result.state);
			}
			if (effect.type === "broadcast_results") {
				this.broadcastResults(result.state);
			}
			if (effect.type === "broadcast_progress") {
				this.broadcastProgress(result.state);
			}
			if (effect.type === "broadcast_finished") {
				this.broadcast({ type: "finished", phase: "FINISHED", scores: this.leaderboard() });
			}
		}
		await this.persistStatus(result.state.phase);
		if (event.type === "answer") {
			ws?.send(JSON.stringify({ type: "answer_ack", questionIndex: event.questionIndex }));
		}
	}

	private stateRow(): StateRow | null {
		const rows = this.ctx.storage.sql
			.exec<StateRow>(
				`SELECT session_id, class_id, set_id, teacher_id, phase, question_index, question_count, deadline_at, remaining_ms, pace, seconds FROM quiz_state WHERE id = 1`,
			)
			.toArray();
		return rows[0] ?? null;
	}

	private readMachine(): QuizMachineState | null {
		const row = this.stateRow();
		if (!row) return null;
		const answers: Record<string, number> = {};
		for (const answer of this.ctx.storage.sql
			.exec<{ user_id: string; choice: number }>(
				`SELECT user_id, choice FROM quiz_answers WHERE question_idx = ?`,
				row.question_index,
			)
			.toArray()) {
			answers[answer.user_id] = answer.choice;
		}
		return {
			phase: row.phase,
			questionIndex: row.question_index,
			questionCount: row.question_count,
			answers,
		};
	}

	private persistMachine(state: QuizMachineState) {
		this.ctx.storage.sql.exec(
			`UPDATE quiz_state SET phase = ?, question_index = ?, question_count = ? WHERE id = 1`,
			state.phase,
			state.questionIndex,
			state.questionCount,
		);
	}

	private setDeadline(deadlineAt: number) {
		this.ctx.storage.sql.exec(`UPDATE quiz_state SET deadline_at = ? WHERE id = 1`, deadlineAt);
	}

	private clearDeadline() {
		this.ctx.storage.sql.exec(`UPDATE quiz_state SET deadline_at = NULL WHERE id = 1`);
	}

	private questions(): QuizQuestion[] {
		return this.ctx.storage.sql
			.exec<{
				idx: number;
				card_id: string;
				prompt: string;
				choices_json: string;
				correct_index: number;
				kind: "choice" | "type";
				expected: string;
			}>(`SELECT idx, card_id, prompt, choices_json, correct_index, kind, expected FROM quiz_questions ORDER BY idx`)
			.toArray()
			.map((row) => ({
				idx: row.idx,
				cardId: row.card_id,
				kind: row.kind === "type" ? "type" : "choice",
				prompt: row.prompt,
				choices: JSON.parse(row.choices_json) as string[],
				correctIndex: row.correct_index,
				expected: row.expected ?? "",
			}));
	}

	private connectedParticipants(): WsAttachment[] {
		const seen = new Map<string, WsAttachment>();
		for (const socket of this.ctx.getWebSockets()) {
			const attachment = socket.deserializeAttachment() as WsAttachment | null;
			if (attachment) seen.set(attachment.userId, attachment);
		}
		return [...seen.values()];
	}

	private broadcast(payload: unknown) {
		const message = JSON.stringify(payload);
		for (const socket of this.ctx.getWebSockets()) {
			try {
				socket.send(message);
			} catch {
				// disconnected
			}
		}
	}

	private broadcastQuestion(state: QuizMachineState) {
		const question = this.questions()[state.questionIndex];
		const row = this.stateRow();
		if (!question) return;
		this.broadcast({
			type: "question",
			questionIndex: state.questionIndex,
			kind: question.kind,
			prompt: question.prompt,
			choices: question.choices,
			deadlineAt: row?.deadline_at ?? null,
		});
	}

	private displayName(userId: string): string {
		for (const person of this.connectedParticipants()) {
			if (person.userId === userId) return person.displayName;
		}
		return userId;
	}

	private resultsFor(state: QuizMachineState) {
		const question = this.questions()[state.questionIndex];
		if (!question) return null;
		const answers = this.ctx.storage.sql
			.exec<{ user_id: string; choice: number; typed: string | null }>(
				`SELECT user_id, choice, typed FROM quiz_answers WHERE question_idx = ?`,
				state.questionIndex,
			)
			.toArray()
			.map((row) => ({
				userId: row.user_id,
				displayName: this.displayName(row.user_id),
				choice: row.choice,
				typed: row.typed,
				correct:
					question.kind === "type"
						? typedMatches(row.typed ?? "", question.expected)
						: row.choice === question.correctIndex,
			}));
		return {
			questionIndex: state.questionIndex,
			correctIndex: question.correctIndex,
			expected: question.kind === "type" ? question.expected : undefined,
			answers,
		};
	}

	private broadcastResults(state: QuizMachineState) {
		const results = this.resultsFor(state);
		if (results) this.broadcast({ type: "results", ...results });
	}

	private broadcastToTeachers(payload: unknown) {
		const message = JSON.stringify(payload);
		for (const socket of this.ctx.getWebSockets()) {
			const attachment = socket.deserializeAttachment() as WsAttachment | null;
			if (attachment?.role !== "teacher") continue;
			try {
				socket.send(message);
			} catch {
				// disconnected
			}
		}
	}

	private broadcastProgress(state: QuizMachineState) {
		const results = this.resultsFor(state);
		this.broadcastToTeachers({
			type: "progress",
			questionIndex: state.questionIndex,
			participants: this.connectedParticipants(),
			results,
		});
	}

	private async hostNext(ws: WebSocket) {
		const machine = this.readMachine();
		if (!machine) {
			ws.send(JSON.stringify({ type: "error", error: "Quiz not initialized" }));
			return;
		}
		if (machine.phase === "LOBBY") {
			await this.apply({ type: "start_quiz" }, ws);
			await this.apply({ type: "start_question" }, ws);
			return;
		}
		if (machine.phase === "QUIZ_READY") {
			await this.apply({ type: "start_question" }, ws);
			return;
		}
		if (machine.phase === "QUESTION_OPEN") {
			await this.apply({ type: "close_question" }, ws);
			await this.apply({ type: "show_results" }, ws);
			return;
		}
		if (machine.phase === "QUESTION_CLOSED") {
			await this.apply({ type: "show_results" }, ws);
			return;
		}
		if (machine.phase === "RESULTS_SHOWN") {
			if (machine.questionIndex + 1 >= machine.questionCount) await this.apply({ type: "end_quiz" }, ws);
			else await this.apply({ type: "start_question" }, ws);
		}
	}

	private snapshot(viewer?: { userId: string; role: string }): QuizSnapshot | null {
		const row = this.stateRow();
		const machine = this.readMachine();
		if (!row || !machine) return null;
		const isTeacher = viewer?.role === "teacher";
		const question = machine.questionIndex >= 0 ? (this.questions()[machine.questionIndex] ?? null) : null;
		const revealKey = isTeacher || studentMayReveal(machine.phase);
		const showResults = isTeacher || studentMayReveal(machine.phase);
		return {
			sessionId: row.session_id,
			phase: machine.phase,
			questionIndex: machine.questionIndex,
			questionCount: machine.questionCount,
			question: question
				? {
						prompt: question.prompt,
						kind: question.kind,
						choices: question.choices,
						deadlineAt: row.deadline_at,
						...(revealKey
							? {
									correctIndex: question.correctIndex,
									expected: question.kind === "type" ? question.expected : undefined,
								}
							: {}),
					}
				: null,
			participants: this.connectedParticipants(),
			results: showResults ? this.resultsFor(machine) : null,
			scores: this.leaderboard(),
		};
	}

	private leaderboard() {
		return this.ctx.storage.sql
			.exec<{ user_id: string; points: number }>(`SELECT user_id, points FROM quiz_scores ORDER BY points DESC`)
			.toArray()
			.map((row) => ({
				userId: row.user_id,
				displayName: this.displayName(row.user_id),
				points: row.points,
			}));
	}

	private async persistStatus(phase: Phase) {
		const row = this.stateRow();
		if (!row) return;
		await this.env.DB.prepare(`UPDATE quiz_sessions SET status = ? WHERE id = ?`).bind(phase, row.session_id).run();
	}
}
