import { describe, expect, it } from "vitest";
import { initialMachineState, reduce, scoreAnswer, studentMayReveal, type QuizMachineState } from "../src/quiz/machine";

describe("QuizSession state machine", () => {
	it("start → question → answer → close → results", () => {
		let state = initialMachineState(2);

		const started = reduce(state, { type: "start_quiz" });
		expect(started.ok).toBe(true);
		if (!started.ok) return;
		state = started.state;
		expect(state.phase).toBe("QUIZ_READY");

		const opened = reduce(state, { type: "start_question" });
		expect(opened.ok).toBe(true);
		if (!opened.ok) return;
		state = opened.state;
		expect(state.phase).toBe("QUESTION_OPEN");
		expect(state.questionIndex).toBe(0);
		expect(opened.effects.some((effect) => effect.type === "schedule_deadline")).toBe(true);
		expect(opened.effects.some((effect) => effect.type === "broadcast_question")).toBe(true);

		const answered = reduce(state, {
			type: "answer",
			userId: "student-1",
			questionIndex: 0,
			choice: 2,
		});
		expect(answered.ok).toBe(true);
		if (!answered.ok) return;
		state = answered.state;
		expect(state.answers["student-1"]).toBe(2);
		expect(answered.effects.some((effect) => effect.type === "broadcast_progress")).toBe(true);

		const duplicate = reduce(state, {
			type: "answer",
			userId: "student-1",
			questionIndex: 0,
			choice: 1,
		});
		expect(duplicate.ok).toBe(false);

		const closed = reduce(state, { type: "close_question" });
		expect(closed.ok).toBe(true);
		if (!closed.ok) return;
		state = closed.state;
		expect(state.phase).toBe("QUESTION_CLOSED");

		const results = reduce(state, { type: "show_results" });
		expect(results.ok).toBe(true);
		if (!results.ok) return;
		state = results.state;
		expect(state.phase).toBe("RESULTS_SHOWN");
		expect(results.effects.some((effect) => effect.type === "broadcast_results")).toBe(true);

		const next = reduce(state, { type: "start_question" });
		expect(next.ok).toBe(true);
		if (!next.ok) return;
		expect(next.state.phase).toBe("QUESTION_OPEN");
		expect(next.state.questionIndex).toBe(1);
		expect(next.state.answers).toEqual({});

		const afterNext = reduce(next.state, { type: "close_question" });
		expect(afterNext.ok).toBe(true);
		if (!afterNext.ok) return;
		const shown = reduce(afterNext.state, { type: "show_results" });
		expect(shown.ok).toBe(true);
		if (!shown.ok) return;
		const finished = reduce(shown.state, { type: "end_quiz" });
		expect(finished.ok).toBe(true);
		if (!finished.ok) return;
		expect(finished.state.phase).toBe("FINISHED");
	});

	it("pauses and resumes the same question", () => {
		let state: QuizMachineState = {
			...initialMachineState(1),
			phase: "QUESTION_OPEN",
			questionIndex: 0,
		};
		const closed = reduce(state, { type: "close_question" });
		expect(closed.ok).toBe(true);
		if (!closed.ok) return;
		state = closed.state;
		expect(state.phase).toBe("QUESTION_CLOSED");
		const resumed = reduce(state, { type: "resume_question" });
		expect(resumed.ok).toBe(true);
		if (!resumed.ok) return;
		expect(resumed.state.phase).toBe("QUESTION_OPEN");
		expect(resumed.state.questionIndex).toBe(0);
	});

	it("rejects ending a quiz from the lobby", () => {
		const result = reduce(initialMachineState(2), { type: "end_quiz" });
		expect(result.ok).toBe(false);
	});

	it("reveals answers only after results are shown", () => {
		expect(studentMayReveal("QUESTION_CLOSED")).toBe(false);
		expect(studentMayReveal("RESULTS_SHOWN")).toBe(true);
		expect(studentMayReveal("FINISHED")).toBe(true);
	});

	it("scores correct answers with remaining time", () => {
		expect(scoreAnswer(false, 10_000, 30_000)).toBe(0);
		expect(scoreAnswer(true, 30_000, 30_000)).toBe(1000);
		expect(scoreAnswer(true, 0, 30_000)).toBe(500);
	});

	it("rejects student-style answers when the question is closed", () => {
		const state = {
			...initialMachineState(1),
			phase: "QUESTION_CLOSED" as const,
			questionIndex: 0,
		};
		const result = reduce(state, { type: "answer", userId: "s", questionIndex: 0, choice: 0 });
		expect(result.ok).toBe(false);
	});
});
