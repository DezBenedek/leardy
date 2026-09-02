export const PHASES = [
	"LOBBY",
	"QUIZ_READY",
	"QUESTION_OPEN",
	"QUESTION_CLOSED",
	"RESULTS_SHOWN",
	"FINISHED",
] as const;

export type Phase = (typeof PHASES)[number];

export type QuizEvent =
	| { type: "start_quiz" }
	| { type: "start_question" }
	| { type: "close_question" }
	| { type: "resume_question" }
	| { type: "show_results" }
	| { type: "end_quiz" }
	| { type: "answer"; userId: string; questionIndex: number; choice?: number; typed?: string };

export type Effect =
	| { type: "schedule_deadline" }
	| { type: "cancel_deadline" }
	| { type: "broadcast_phase" }
	| { type: "broadcast_question" }
	| { type: "broadcast_results" }
	| { type: "broadcast_progress" }
	| { type: "broadcast_finished" };

export type QuizMachineState = {
	phase: Phase;
	questionIndex: number;
	questionCount: number;
	answers: Record<string, number>;
};

export type TransitionOk = { ok: true; state: QuizMachineState; effects: Effect[] };
export type TransitionErr = { ok: false; error: string };
export type TransitionResult = TransitionOk | TransitionErr;

export const QUESTION_DURATION_MS = 30_000;

export function initialMachineState(questionCount: number): QuizMachineState {
	return {
		phase: "LOBBY",
		questionIndex: -1,
		questionCount,
		answers: {},
	};
}

function fail(error: string): TransitionErr {
	return { ok: false, error };
}

function ok(state: QuizMachineState, effects: Effect[]): TransitionOk {
	return { ok: true, state, effects };
}

export function reduce(state: QuizMachineState, event: QuizEvent): TransitionResult {
	if (state.phase === "FINISHED" && event.type !== "end_quiz") {
		return fail("Quiz already finished");
	}

	switch (event.type) {
		case "start_quiz":
			if (state.phase !== "LOBBY") return fail("Quiz already started");
			if (state.questionCount < 1) return fail("No questions");
			return ok({ ...state, phase: "QUIZ_READY" }, [{ type: "broadcast_phase" }]);

		case "start_question": {
			if (state.phase === "QUIZ_READY") {
				return ok({ ...state, phase: "QUESTION_OPEN", questionIndex: 0, answers: {} }, [
					{ type: "schedule_deadline" },
					{ type: "broadcast_question" },
				]);
			}
			if (state.phase === "RESULTS_SHOWN") {
				const next = state.questionIndex + 1;
				if (next >= state.questionCount) return fail("No more questions");
				return ok({ ...state, phase: "QUESTION_OPEN", questionIndex: next, answers: {} }, [
					{ type: "schedule_deadline" },
					{ type: "broadcast_question" },
				]);
			}
			return fail("Cannot start question in this phase");
		}

		case "answer": {
			if (state.phase !== "QUESTION_OPEN") return fail("Question is not open");
			if (event.questionIndex !== state.questionIndex) return fail("Stale question");
			const hasTyped = typeof event.typed === "string" && event.typed.trim().length > 0;
			const hasChoice = Number.isInteger(event.choice) && (event.choice as number) >= 0;
			if (!hasTyped && !hasChoice) return fail("Invalid choice");
			if (state.answers[event.userId] !== undefined) return fail("Already answered");
			return ok(
				{
					...state,
					answers: { ...state.answers, [event.userId]: hasChoice ? (event.choice as number) : -1 },
				},
				[{ type: "broadcast_progress" }],
			);
		}

		case "close_question":
			if (state.phase !== "QUESTION_OPEN") return fail("Question is not open");
			return ok({ ...state, phase: "QUESTION_CLOSED" }, [{ type: "cancel_deadline" }, { type: "broadcast_phase" }]);

		case "resume_question":
			if (state.phase !== "QUESTION_CLOSED") return fail("Question is not paused");
			return ok({ ...state, phase: "QUESTION_OPEN" }, [{ type: "schedule_deadline" }, { type: "broadcast_phase" }]);

		case "show_results":
			if (state.phase !== "QUESTION_CLOSED") return fail("Question is not closed");
			return ok({ ...state, phase: "RESULTS_SHOWN" }, [{ type: "broadcast_results" }]);

		case "end_quiz":
			if (state.phase === "FINISHED") return ok(state, []);
			return ok({ ...state, phase: "FINISHED" }, [{ type: "cancel_deadline" }, { type: "broadcast_finished" }]);
	}
}
