import { and, count, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db";
import { cards, classBans, classMaterials, classMembers, classes, quizSessions, setEditors, sets, users } from "../db/schema";
import { nowIso, randomId } from "../lib/crypto";
import { jsonError, readJson } from "../lib/http";
import { randomJoinCode } from "../lib/join-code";
import { createSetWithCards } from "../lib/sets";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

// isTeacher is a self-declared UX gate, not a security boundary.
// Real authorization is class_members.role and resource ownership.

type CreateClassBody = { name?: unknown };
type JoinBody = { joinCode?: unknown };
type PatchClassBody = { allowStudentSets?: unknown; name?: unknown };
type PatchMemberBody = { role?: unknown };
type MaterialBody = { title?: unknown; url?: unknown; note?: unknown };
type EditorBody = { email?: unknown };
type CardInput = { front?: unknown; back?: unknown; hint?: unknown; example?: unknown };
type CreateSetBody = { name?: unknown; subject?: unknown; cards?: unknown };
type StartQuizBody = { setId?: unknown; pace?: unknown; seconds?: unknown; questionMode?: unknown };

const PACES = ["teacher", "timed", "auto"] as const;
const QUESTION_MODES = ["choice", "type", "random"] as const;
type Pace = (typeof PACES)[number];
type QuestionMode = (typeof QUESTION_MODES)[number];

function asPace(value: unknown): Pace {
	return PACES.includes(value as Pace) ? (value as Pace) : "teacher";
}

function asQuestionMode(value: unknown): QuestionMode {
	return QUESTION_MODES.includes(value as QuestionMode) ? (value as QuestionMode) : "choice";
}

async function activeQuizForClass(db: ReturnType<typeof createDb>, classId: string) {
	return db
		.select()
		.from(quizSessions)
		.where(and(eq(quizSessions.classId, classId), notInArray(quizSessions.status, ["FINISHED"])))
		.orderBy(desc(quizSessions.createdAt))
		.get();
}

export const classRoutes = new Hono<AppEnv>();

classRoutes.use("*", requireAuth);

async function membership(db: ReturnType<typeof createDb>, classId: string, userId: string) {
	return db
		.select()
		.from(classMembers)
		.where(and(eq(classMembers.classId, classId), eq(classMembers.userId, userId)))
		.get();
}

async function banRow(db: ReturnType<typeof createDb>, classId: string, userId: string) {
	return db
		.select()
		.from(classBans)
		.where(and(eq(classBans.classId, classId), eq(classBans.userId, userId)))
		.get();
}

function asHttpUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const raw = value.trim();
	if (!raw) return null;
	try {
		const parsed = new URL(raw);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
		return parsed.toString();
	} catch {
		return null;
	}
}

classRoutes.post("/", async (c) => {
	const body = await readJson<CreateClassBody>(c);
	if (!body || typeof body.name !== "string" || body.name.trim().length < 1) {
		return jsonError(c, 400, "Name is required");
	}
	const user = c.get("user");
	if (!user.isTeacher) return jsonError(c, 403, "Teacher only");
	const db = createDb(c.env.DB);
	const createdAt = nowIso();
	let joinCode = randomJoinCode();
	for (let attempt = 0; attempt < 8; attempt++) {
		const clash = await db.select({ id: classes.id }).from(classes).where(eq(classes.joinCode, joinCode)).get();
		if (!clash) break;
		joinCode = randomJoinCode();
	}
	const row = {
		id: randomId(),
		name: body.name.trim(),
		joinCode,
		ownerId: user.id,
		allowStudentSets: 0,
		createdAt,
	};
	await db.insert(classes).values(row);
	await db.insert(classMembers).values({
		classId: row.id,
		userId: user.id,
		role: "teacher",
		joinedAt: createdAt,
	});
	return c.json({ class: { ...row, allowStudentSets: false, role: "teacher" as const } }, 201);
});

classRoutes.get("/", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const rows = await db
		.select({
			id: classes.id,
			name: classes.name,
			joinCode: classes.joinCode,
			ownerId: classes.ownerId,
			allowStudentSets: classes.allowStudentSets,
			createdAt: classes.createdAt,
			role: classMembers.role,
		})
		.from(classMembers)
		.innerJoin(classes, eq(classMembers.classId, classes.id))
		.where(eq(classMembers.userId, user.id))
		.all();

	const classIds = rows.map((row) => row.id);
	const countRows = classIds.length
		? await db
				.select({ classId: classMembers.classId, value: count() })
				.from(classMembers)
				.where(inArray(classMembers.classId, classIds))
				.groupBy(classMembers.classId)
		: [];
	const countByClass = new Map(countRows.map((row) => [row.classId, row.value]));
	const quizRows = classIds.length
		? await db
				.select()
				.from(quizSessions)
				.where(and(inArray(quizSessions.classId, classIds), notInArray(quizSessions.status, ["FINISHED"])))
				.orderBy(desc(quizSessions.createdAt))
				.all()
		: [];
	const quizByClass = new Map<string, (typeof quizRows)[number]>();
	for (const quiz of quizRows) {
		if (!quizByClass.has(quiz.classId)) quizByClass.set(quiz.classId, quiz);
	}

	const result = rows.map((row) => {
		const active = quizByClass.get(row.id);
		return {
			id: row.id,
			name: row.name,
			ownerId: row.ownerId,
			allowStudentSets: row.allowStudentSets === 1,
			createdAt: row.createdAt,
			role: row.role,
			joinCode: row.role === "teacher" ? row.joinCode : undefined,
			memberCount: countByClass.get(row.id) ?? 0,
			activeQuizId: active?.id,
			activeQuizStatus: active?.status,
		};
	});
	return c.json({ classes: result });
});

classRoutes.post("/join", async (c) => {
	const body = await readJson<JoinBody>(c);
	const raw = typeof body?.joinCode === "string" ? body.joinCode.trim().toUpperCase() : "";
	if (!/^[A-Z0-9]{6}$/.test(raw)) return jsonError(c, 400, "Invalid join code");
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classroom = await db.select().from(classes).where(eq(classes.joinCode, raw)).get();
	if (!classroom) return jsonError(c, 404, "Class not found");
	if (await banRow(db, classroom.id, user.id)) {
		return jsonError(c, 403, "You are banned from this class");
	}
	await db
		.insert(classMembers)
		.values({
			classId: classroom.id,
			userId: user.id,
			role: "student",
			joinedAt: nowIso(),
		})
		.onConflictDoNothing();
	const existing = await membership(db, classroom.id, user.id);
	if (!existing) return jsonError(c, 500, "Could not join class");
	return c.json({
		class: {
			id: classroom.id,
			name: classroom.name,
			role: existing.role,
			allowStudentSets: classroom.allowStudentSets === 1,
		},
	});
});

classRoutes.get("/:id", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const classroom = await db.select().from(classes).where(eq(classes.id, classId)).get();
	if (!classroom) return jsonError(c, 404, "Class not found");
	const member = await membership(db, classId, user.id);
	if (!member) return jsonError(c, 403, "Not a member of this class");

	const members = await db
		.select({
			userId: classMembers.userId,
			username: users.username,
			role: classMembers.role,
			joinedAt: classMembers.joinedAt,
		})
		.from(classMembers)
		.innerJoin(users, eq(classMembers.userId, users.id))
		.where(eq(classMembers.classId, classId))
		.all();

	let banned: { userId: string; username: string; createdAt: string }[] = [];
	if (member.role === "teacher") {
		banned = await db
			.select({
				userId: classBans.userId,
				username: users.username,
				createdAt: classBans.createdAt,
			})
			.from(classBans)
			.innerJoin(users, eq(classBans.userId, users.id))
			.where(eq(classBans.classId, classId))
			.all();
	}

	return c.json({
		class: {
			id: classroom.id,
			name: classroom.name,
			ownerId: classroom.ownerId,
			allowStudentSets: classroom.allowStudentSets === 1,
			createdAt: classroom.createdAt,
			role: member.role,
			joinCode: member.role === "teacher" ? classroom.joinCode : undefined,
			memberCount: members.length,
			members,
			banned,
		},
	});
});

classRoutes.patch("/:id", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const classroom = await db.select().from(classes).where(eq(classes.id, classId)).get();
	if (!classroom) return jsonError(c, 404, "Class not found");
	const member = await membership(db, classId, user.id);
	if (!member || member.role !== "teacher") return jsonError(c, 403, "Teacher only");

	const body = await readJson<PatchClassBody>(c);
	if (!body || (body.allowStudentSets !== undefined && typeof body.allowStudentSets !== "boolean")) {
		return jsonError(c, 400, "allowStudentSets must be a boolean");
	}
	const nextName = typeof body.name === "string" ? body.name.trim() : undefined;
	if (nextName !== undefined && nextName.length < 1) return jsonError(c, 400, "Name is required");
	if (body.allowStudentSets === undefined && nextName === undefined) {
		return jsonError(c, 400, "Nothing to update");
	}

	const allowStudentSets = typeof body.allowStudentSets === "boolean" ? body.allowStudentSets : classroom.allowStudentSets === 1;
	await db
		.update(classes)
		.set({
			allowStudentSets: allowStudentSets ? 1 : 0,
			...(nextName ? { name: nextName } : {}),
		})
		.where(eq(classes.id, classId));
	return c.json({
		class: {
			id: classroom.id,
			name: nextName ?? classroom.name,
			allowStudentSets,
			role: "teacher" as const,
			ownerId: classroom.ownerId,
		},
	});
});

classRoutes.delete("/:id/members/:userId", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const targetId = c.req.param("userId");
	const classroom = await db.select().from(classes).where(eq(classes.id, classId)).get();
	if (!classroom) return jsonError(c, 404, "Class not found");
	const actor = await membership(db, classId, user.id);
	if (!actor || actor.role !== "teacher") return jsonError(c, 403, "Teacher only");
	if (targetId === classroom.ownerId) return jsonError(c, 403, "Cannot remove the class owner");
	if (targetId === user.id) return jsonError(c, 400, "You cannot remove yourself");
	const target = await membership(db, classId, targetId);
	if (!target) return jsonError(c, 404, "Member not found");
	if (target.role === "teacher" && classroom.ownerId !== user.id) {
		return jsonError(c, 403, "Only the owner can remove a teacher");
	}
	await db.delete(classMembers).where(and(eq(classMembers.classId, classId), eq(classMembers.userId, targetId)));
	return c.json({ ok: true });
});

classRoutes.post("/:id/members/:userId/ban", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const targetId = c.req.param("userId");
	const classroom = await db.select().from(classes).where(eq(classes.id, classId)).get();
	if (!classroom) return jsonError(c, 404, "Class not found");
	const actor = await membership(db, classId, user.id);
	if (!actor || actor.role !== "teacher") return jsonError(c, 403, "Teacher only");
	if (targetId === classroom.ownerId) return jsonError(c, 403, "Cannot ban the class owner");
	if (targetId === user.id) return jsonError(c, 400, "You cannot ban yourself");
	const target = await membership(db, classId, targetId);
	if (target?.role === "teacher" && classroom.ownerId !== user.id) {
		return jsonError(c, 403, "Only the owner can ban a teacher");
	}
	await db.delete(classMembers).where(and(eq(classMembers.classId, classId), eq(classMembers.userId, targetId)));
	const existingBan = await banRow(db, classId, targetId);
	if (!existingBan) {
		await db.insert(classBans).values({
			classId,
			userId: targetId,
			bannedBy: user.id,
			createdAt: nowIso(),
		});
	}
	return c.json({ ok: true });
});

classRoutes.delete("/:id/bans/:userId", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const targetId = c.req.param("userId");
	const actor = await membership(db, classId, user.id);
	if (!actor || actor.role !== "teacher") return jsonError(c, 403, "Teacher only");
	await db.delete(classBans).where(and(eq(classBans.classId, classId), eq(classBans.userId, targetId)));
	return c.json({ ok: true });
});

classRoutes.patch("/:id/members/:userId", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const targetId = c.req.param("userId");
	const classroom = await db.select().from(classes).where(eq(classes.id, classId)).get();
	if (!classroom) return jsonError(c, 404, "Class not found");
	if (classroom.ownerId !== user.id) return jsonError(c, 403, "Only the owner can change roles");
	if (targetId === classroom.ownerId) return jsonError(c, 403, "Cannot change the class owner");
	const body = await readJson<PatchMemberBody>(c);
	const role = body?.role === "teacher" || body?.role === "student" ? body.role : null;
	if (!role) return jsonError(c, 400, "role must be teacher or student");
	const target = await membership(db, classId, targetId);
	if (!target) return jsonError(c, 404, "Member not found");
	await db
		.update(classMembers)
		.set({ role })
		.where(and(eq(classMembers.classId, classId), eq(classMembers.userId, targetId)));
	return c.json({ ok: true, role });
});

classRoutes.get("/:id/materials", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const member = await membership(db, classId, user.id);
	if (!member) return jsonError(c, 403, "Not a member of this class");
	const rows = await db.select().from(classMaterials).where(eq(classMaterials.classId, classId)).all();
	return c.json({ materials: rows });
});

classRoutes.post("/:id/materials", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const classroom = await db.select().from(classes).where(eq(classes.id, classId)).get();
	if (!classroom) return jsonError(c, 404, "Class not found");
	const member = await membership(db, classId, user.id);
	if (!member) return jsonError(c, 403, "Not a member of this class");
	if (member.role !== "teacher" && classroom.allowStudentSets !== 1) {
		return jsonError(c, 403, "Students cannot share materials in this class");
	}
	const body = await readJson<MaterialBody>(c);
	const title = typeof body?.title === "string" ? body.title.trim() : "";
	if (title.length < 1) return jsonError(c, 400, "Title is required");
	const note = typeof body?.note === "string" ? body.note.trim() : "";
	const url = body?.url === undefined || body?.url === null || body?.url === "" ? null : asHttpUrl(body.url);
	if (body?.url && !url) return jsonError(c, 400, "Invalid URL");
	if (!url && !note) return jsonError(c, 400, "Add a link or a note");
	const row = {
		id: randomId(),
		classId,
		title,
		url,
		note: note || null,
		createdBy: user.id,
		createdAt: nowIso(),
	};
	await db.insert(classMaterials).values(row);
	return c.json({ material: row }, 201);
});

classRoutes.delete("/:id/materials/:materialId", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const materialId = c.req.param("materialId");
	const member = await membership(db, classId, user.id);
	if (!member) return jsonError(c, 403, "Not a member of this class");
	const row = await db
		.select()
		.from(classMaterials)
		.where(and(eq(classMaterials.id, materialId), eq(classMaterials.classId, classId)))
		.get();
	if (!row) return jsonError(c, 404, "Material not found");
	if (member.role !== "teacher" && row.createdBy !== user.id) {
		return jsonError(c, 403, "Teacher only");
	}
	await db.delete(classMaterials).where(eq(classMaterials.id, materialId));
	return c.json({ ok: true });
});

classRoutes.patch("/:id/materials/:materialId", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const materialId = c.req.param("materialId");
	const member = await membership(db, classId, user.id);
	if (!member) return jsonError(c, 403, "Not a member of this class");
	const row = await db
		.select()
		.from(classMaterials)
		.where(and(eq(classMaterials.id, materialId), eq(classMaterials.classId, classId)))
		.get();
	if (!row) return jsonError(c, 404, "Material not found");
	if (row.createdBy !== user.id) return jsonError(c, 403, "Not the author");
	const body = await readJson<MaterialBody>(c);
	const title = typeof body?.title === "string" ? body.title.trim() : row.title;
	if (title.length < 1) return jsonError(c, 400, "Title is required");
	const note = typeof body?.note === "string" ? body.note.trim() : (row.note ?? "");
	const url =
		body?.url === undefined
			? row.url
			: body.url === null || body.url === ""
				? null
				: asHttpUrl(body.url);
	if (body?.url && body.url !== "" && !url) return jsonError(c, 400, "Invalid URL");
	if (!url && !note) return jsonError(c, 400, "Add a link or a note");
	await db
		.update(classMaterials)
		.set({ title, url, note: note || null })
		.where(eq(classMaterials.id, materialId));
	return c.json({ material: { ...row, title, url, note: note || null } });
});

classRoutes.post("/:id/sets", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const classroom = await db.select().from(classes).where(eq(classes.id, classId)).get();
	if (!classroom) return jsonError(c, 404, "Class not found");
	const member = await membership(db, classId, user.id);
	if (!member) return jsonError(c, 403, "Not a member of this class");
	if (member.role !== "teacher" && classroom.allowStudentSets !== 1) {
		return jsonError(c, 403, "Students cannot create sets in this class");
	}

	const body = await readJson<CreateSetBody>(c);
	if (!body || typeof body.name !== "string" || body.name.trim().length < 1) {
		return jsonError(c, 400, "Name is required");
	}
	if (typeof body.subject !== "string" || body.subject.trim().length < 1) {
		return jsonError(c, 400, "Subject is required");
	}
	if (!Array.isArray(body.cards) || body.cards.length < 1) {
		return jsonError(c, 400, "At least one card is required");
	}

	const cardInputs: { front: string; back: string; hint: string | null; example: string | null }[] = [];
	for (const raw of body.cards as CardInput[]) {
		if (typeof raw?.front !== "string" || typeof raw?.back !== "string") {
			return jsonError(c, 400, "Each card needs front and back");
		}
		cardInputs.push({
			front: raw.front,
			back: raw.back,
			hint: typeof raw.hint === "string" ? raw.hint : null,
			example: typeof raw.example === "string" ? raw.example : null,
		});
	}

	const created = await createSetWithCards(db, {
		ownerId: user.id,
		classId,
		name: body.name.trim(),
		subject: body.subject.trim(),
		cards: cardInputs,
	});
	const setRow = await db.select().from(sets).where(eq(sets.id, created.setId)).get();
	return c.json({ set: { ...setRow, cards: created.cards } }, 201);
});

classRoutes.get("/:id/sets", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const classroom = await db.select().from(classes).where(eq(classes.id, classId)).get();
	if (!classroom) return jsonError(c, 404, "Class not found");
	const member = await membership(db, classId, user.id);
	if (!member) return jsonError(c, 403, "Not a member of this class");

	const rows = await db
		.select()
		.from(sets)
		.where(and(eq(sets.classId, classId), isNull(sets.deletedAt)))
		.all();
	const setIds = rows.map((row) => row.id);
	const editorRows = setIds.length
		? await db.select().from(setEditors).where(inArray(setEditors.setId, setIds)).all()
		: [];
	const editorIds = new Set(editorRows.map((row) => `${row.setId}:${row.userId}`));
	return c.json({
		sets: rows.map((row) => ({
			...row,
			myRole:
				row.ownerId === user.id ? "owner" : editorIds.has(`${row.id}:${user.id}`) ? "editor" : "reader",
		})),
	});
});

classRoutes.get("/:id/sets/:setId/editors", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const setId = c.req.param("setId");
	const member = await membership(db, classId, user.id);
	if (!member) return jsonError(c, 403, "Not a member of this class");
	const setRow = await db
		.select()
		.from(sets)
		.where(and(eq(sets.id, setId), eq(sets.classId, classId), isNull(sets.deletedAt)))
		.get();
	if (!setRow) return jsonError(c, 404, "Set not found");
	if (setRow.ownerId !== user.id && member.role !== "teacher") {
		return jsonError(c, 403, "Owner or teacher only");
	}
	const rows = await db
		.select({
			userId: setEditors.userId,
			username: users.username,
			email: users.email,
		})
		.from(setEditors)
		.innerJoin(users, eq(setEditors.userId, users.id))
		.where(eq(setEditors.setId, setId))
		.all();
	return c.json({ editors: rows, ownerId: setRow.ownerId });
});

classRoutes.post("/:id/sets/:setId/editors", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const setId = c.req.param("setId");
	const member = await membership(db, classId, user.id);
	if (!member) return jsonError(c, 403, "Not a member of this class");
	const setRow = await db
		.select()
		.from(sets)
		.where(and(eq(sets.id, setId), eq(sets.classId, classId), isNull(sets.deletedAt)))
		.get();
	if (!setRow) return jsonError(c, 404, "Set not found");
	if (setRow.ownerId !== user.id) return jsonError(c, 403, "Only the owner can add editors");
	const body = await readJson<EditorBody>(c);
	const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
	if (!email) return jsonError(c, 400, "Invalid email");
	const target = await db.select().from(users).where(eq(users.email, email)).get();
	if (!target) return jsonError(c, 404, "User not found");
	if (target.id === setRow.ownerId) return jsonError(c, 400, "The owner is already the owner");
	const inClass = await membership(db, classId, target.id);
	if (!inClass) return jsonError(c, 400, "Editor must be in the class");
	const already = await db
		.select()
		.from(setEditors)
		.where(and(eq(setEditors.setId, setId), eq(setEditors.userId, target.id)))
		.get();
	if (!already) {
		await db.insert(setEditors).values({
			setId,
			userId: target.id,
			addedBy: user.id,
			createdAt: nowIso(),
		});
	}
	return c.json({ ok: true, userId: target.id, username: target.username });
});

classRoutes.delete("/:id/sets/:setId/editors/:userId", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const setId = c.req.param("setId");
	const targetId = c.req.param("userId");
	const member = await membership(db, classId, user.id);
	if (!member) return jsonError(c, 403, "Not a member of this class");
	const setRow = await db
		.select()
		.from(sets)
		.where(and(eq(sets.id, setId), eq(sets.classId, classId), isNull(sets.deletedAt)))
		.get();
	if (!setRow) return jsonError(c, 404, "Set not found");
	if (setRow.ownerId !== user.id) return jsonError(c, 403, "Only the owner can remove editors");
	await db.delete(setEditors).where(and(eq(setEditors.setId, setId), eq(setEditors.userId, targetId)));
	return c.json({ ok: true });
});

classRoutes.delete("/:id/sets/:setId", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const setId = c.req.param("setId");
	const member = await membership(db, classId, user.id);
	if (!member) return jsonError(c, 403, "Not a member of this class");
	const setRow = await db
		.select()
		.from(sets)
		.where(and(eq(sets.id, setId), eq(sets.classId, classId), isNull(sets.deletedAt)))
		.get();
	if (!setRow) return jsonError(c, 404, "Set not found");
	if (setRow.ownerId !== user.id) return jsonError(c, 403, "Not the owner");
	await db.update(sets).set({ deletedAt: nowIso() }).where(eq(sets.id, setId));
	return c.json({ ok: true });
});

classRoutes.get("/:id/sets/:setId", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const setId = c.req.param("setId");
	const member = await membership(db, classId, user.id);
	if (!member) return jsonError(c, 403, "Not a member of this class");

	const setRow = await db
		.select()
		.from(sets)
		.where(and(eq(sets.id, setId), eq(sets.classId, classId), isNull(sets.deletedAt)))
		.get();
	if (!setRow) return jsonError(c, 404, "Set not found");

	const cardRows = await db
		.select()
		.from(cards)
		.where(and(eq(cards.setId, setId), isNull(cards.deletedAt)))
		.all();
	const editor = await db
		.select()
		.from(setEditors)
		.where(and(eq(setEditors.setId, setId), eq(setEditors.userId, user.id)))
		.get();
	const myRole = setRow.ownerId === user.id ? "owner" : editor ? "editor" : "reader";
	return c.json({ set: { ...setRow, cards: cardRows, myRole } });
});

classRoutes.get("/:id/quiz/active", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const member = await membership(db, classId, user.id);
	if (!member) return jsonError(c, 403, "Not a member of this class");
	const session = await activeQuizForClass(db, classId);
	return c.json({ session: session ?? null });
});

classRoutes.post("/:id/quiz/start", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const member = await membership(db, classId, user.id);
	if (!member || member.role !== "teacher") return jsonError(c, 403, "Teacher only");
	const running = await activeQuizForClass(db, classId);
	if (running) return jsonError(c, 409, "A quiz is already running");

	const body = await readJson<StartQuizBody>(c);
	if (!body || typeof body.setId !== "string") return jsonError(c, 400, "setId is required");
	const pace = asPace(body.pace);
	const questionMode = asQuestionMode(body.questionMode);
	const seconds = typeof body.seconds === "number" && body.seconds >= 5 && body.seconds <= 180 ? Math.round(body.seconds) : 30;

	const setRow = await db
		.select()
		.from(sets)
		.where(and(eq(sets.id, body.setId), eq(sets.classId, classId), isNull(sets.deletedAt)))
		.get();
	if (!setRow) return jsonError(c, 404, "Set not found");

	const cardCount = await db
		.select({ value: count() })
		.from(cards)
		.where(and(eq(cards.setId, body.setId), isNull(cards.deletedAt)));
	if ((cardCount[0]?.value ?? 0) < 1) return jsonError(c, 400, "Set has no cards");

	const createdAt = nowIso();
	const session = {
		id: randomId(),
		classId,
		setId: body.setId,
		teacherId: user.id,
		status: "LOBBY",
		createdAt,
		pace,
		seconds,
		questionMode,
	};
	await db.insert(quizSessions).values(session);

	const stub = c.env.QUIZ_SESSION.getByName(session.id);
	const started = await stub.startQuiz({
		sessionId: session.id,
		classId,
		setId: body.setId,
		teacherId: user.id,
		pace,
		seconds,
		questionMode,
	});
	if (!started.ok) {
		await db.delete(quizSessions).where(eq(quizSessions.id, session.id));
		return jsonError(c, 400, started.error);
	}

	return c.json({ session }, 201);
});
