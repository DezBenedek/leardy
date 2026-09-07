import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { createDb } from "../db";
import {
	activities,
	bundles,
	cards,
	classBundles,
	classMembers,
	classes,
	lessonExercises,
	lessonPages,
	lessons,
	librarySaves,
	mapItems,
	sets,
} from "../db/schema";
import { nowIso, randomId } from "../lib/crypto";
import { jsonError, readJson, safeJsonParse } from "../lib/http";
import { createSetWithCards, replaceSetCards, type CardDraft } from "../lib/sets";
import { userFromToken } from "../lib/session";
import { extractToken, requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

type SnapshotBody = {
	id?: unknown;
	kind?: unknown;
	subject?: unknown;
	title?: unknown;
	status?: unknown;
	lessons?: unknown;
	activities?: unknown;
};

type Db = ReturnType<typeof createDb>;
type UpsertOk = { id: string };
type UpsertErr = { error: string; status: 400 | 403 };
type UpsertResult = UpsertOk | UpsertErr;

// isTeacher is a self-declared UX gate, not a security boundary.
// Real authorization is class_members.role and resource ownership.

async function optionalUser(c: Context<AppEnv>) {
	const token = extractToken(c);
	if (!token) return null;
	return userFromToken(createDb(c.env.DB), token);
}

async function isTeacherAnywhere(db: Db, userId: string) {
	return db.select().from(classMembers).where(and(eq(classMembers.userId, userId), eq(classMembers.role, "teacher"))).get();
}

function pageType(value: unknown) {
	return value === "fact" || value === "prompt" || value === "source" || value === "text" ? value : "text";
}

function exerciseType(value: unknown) {
	return value === "flip" || value === "choice" || value === "type" || value === "match" || value === "order" ? value : "flip";
}

function asCardDrafts(raw: unknown): CardDraft[] {
	if (!Array.isArray(raw)) return [];
	const drafts: CardDraft[] = [];
	for (const cardRaw of raw) {
		if (typeof cardRaw !== "object" || cardRaw === null) continue;
		const card = cardRaw as { front?: unknown; back?: unknown; hint?: unknown; example?: unknown };
		if (typeof card.front !== "string" || typeof card.back !== "string") continue;
		drafts.push({
			front: card.front,
			back: card.back,
			hint: typeof card.hint === "string" ? card.hint : null,
			example: typeof card.example === "string" ? card.example : null,
		});
	}
	return drafts;
}

function groupBy<T>(rows: T[], key: (row: T) => string | null | undefined) {
	const map = new Map<string, T[]>();
	for (const row of rows) {
		const id = key(row);
		if (!id) continue;
		const list = map.get(id);
		if (list) list.push(row);
		else map.set(id, [row]);
	}
	return map;
}

async function loadBundleSnapshots(db: Db, bundleIds: string[], userId?: string) {
	if (bundleIds.length === 0) return [] as Record<string, unknown>[];
	const bundleRows = await db.select().from(bundles).where(inArray(bundles.id, bundleIds));
	const lessonRows = await db.select().from(lessons).where(inArray(lessons.bundleId, bundleIds));
	const activityRows = await db.select().from(activities).where(inArray(activities.bundleId, bundleIds));
	const lessonIds = lessonRows.map((row) => row.id);
	const pageRows = lessonIds.length ? await db.select().from(lessonPages).where(inArray(lessonPages.lessonId, lessonIds)) : [];
	const exerciseRows = lessonIds.length
		? await db.select().from(lessonExercises).where(inArray(lessonExercises.lessonId, lessonIds))
		: [];
	const setIds = activityRows.map((row) => row.setId).filter((id): id is string => Boolean(id));
	const cardRows = setIds.length
		? await db.select().from(cards).where(and(inArray(cards.setId, setIds), isNull(cards.deletedAt)))
		: [];
	const activityIds = activityRows.map((row) => row.id);
	const mapRows = activityIds.length ? await db.select().from(mapItems).where(inArray(mapItems.activityId, activityIds)) : [];
	const saves = userId
		? await db
				.select()
				.from(librarySaves)
				.where(and(inArray(librarySaves.bundleId, bundleIds), eq(librarySaves.userId, userId)))
		: [];

	const lessonsByBundle = groupBy(lessonRows, (row) => row.bundleId);
	const activitiesByBundle = groupBy(activityRows, (row) => row.bundleId);
	const pagesByLesson = groupBy(pageRows, (row) => row.lessonId);
	const exercisesByLesson = groupBy(exerciseRows, (row) => row.lessonId);
	const cardsBySet = groupBy(cardRows, (row) => row.setId);
	const mapByActivity = new Map(mapRows.map((row) => [row.activityId, row]));
	const savedIds = new Set(saves.map((row) => row.bundleId));

	return bundleRows.map((bundle) => {
		const lessonPayload = (lessonsByBundle.get(bundle.id) ?? [])
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((lesson) => ({
				id: lesson.id,
				title: lesson.title,
				sortOrder: lesson.sortOrder,
				pages: (pagesByLesson.get(lesson.id) ?? [])
					.sort((a, b) => a.sortOrder - b.sortOrder)
					.map((page) => ({
						id: page.id,
						sortOrder: page.sortOrder,
						body: page.body,
						type: page.type,
						payload: safeJsonParse(page.payloadJson, {}),
					})),
				exercises: (exercisesByLesson.get(lesson.id) ?? [])
					.sort((a, b) => a.sortOrder - b.sortOrder)
					.map((item) => ({
						id: item.id,
						type: item.type,
						prompt: item.prompt,
						answer: item.answer,
						payload: safeJsonParse(item.payloadJson, {}),
						sortOrder: item.sortOrder,
					})),
			}));
		const activityPayload = (activitiesByBundle.get(bundle.id) ?? [])
			.sort((a, b) => a.sortOrder - b.sortOrder)
			.map((activity) => {
				const map = mapByActivity.get(activity.id);
				const hotspots = map ? safeJsonParse(map.hotspotsJson, []) : [];
				return {
					id: activity.id,
					type: activity.type,
					title: activity.title,
					setId: activity.setId,
					serverSetId: activity.setId,
					sortOrder: activity.sortOrder,
					cards: activity.setId
						? (cardsBySet.get(activity.setId) ?? []).map((card) => ({
								front: card.front,
								back: card.back,
								hint: card.hint,
								example: card.example,
							}))
						: undefined,
					hotspots: Array.isArray(hotspots) ? hotspots : [],
					mapItemId: map?.id,
				};
			});
		return {
			id: bundle.id,
			kind: bundle.kind,
			subject: bundle.subject,
			title: bundle.title,
			ownerId: bundle.ownerId,
			status: bundle.status,
			createdAt: bundle.createdAt,
			updatedAt: bundle.updatedAt,
			saved: savedIds.has(bundle.id),
			lessons: lessonPayload,
			activities: activityPayload,
		};
	});
}

async function bundleSnapshot(db: Db, bundleId: string, userId?: string) {
	const [snap] = await loadBundleSnapshots(db, [bundleId], userId);
	return snap ?? null;
}

async function upsertBundleFromSnapshot(db: Db, ownerId: string, body: SnapshotBody): Promise<UpsertResult> {
	const kind: "topic" | "skill" | null = body.kind === "topic" || body.kind === "skill" ? body.kind : null;
	if (!kind) return { error: "kind must be topic or skill", status: 400 };
	if (typeof body.subject !== "string" || body.subject.trim().length < 1) return { error: "Subject is required", status: 400 };
	if (typeof body.title !== "string" || body.title.trim().length < 1) return { error: "Title is required", status: 400 };
	const status = body.status === "public" ? "public" : "draft";
	const now = nowIso();
	const id = typeof body.id === "string" && body.id ? body.id : randomId();
	const existing = await db.select().from(bundles).where(eq(bundles.id, id)).get();
	if (existing && existing.ownerId !== ownerId) return { error: "Not the owner", status: 403 };
	const row = {
		id,
		kind,
		subject: body.subject.trim(),
		title: body.title.trim(),
		ownerId,
		status: status as "draft" | "public",
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
	};
	if (existing) {
		await db.update(bundles).set({ kind: row.kind, subject: row.subject, title: row.title, status: row.status, updatedAt: now }).where(eq(bundles.id, id));
	} else {
		await db.insert(bundles).values(row);
	}

	const existingLessons = await db.select().from(lessons).where(eq(lessons.bundleId, id));
	const ownedLessonIds = new Set(existingLessons.map((lesson) => lesson.id));
	const existingPages = ownedLessonIds.size
		? await db.select().from(lessonPages).where(inArray(lessonPages.lessonId, [...ownedLessonIds]))
		: [];
	const existingExercises = ownedLessonIds.size
		? await db.select().from(lessonExercises).where(inArray(lessonExercises.lessonId, [...ownedLessonIds]))
		: [];
	const existingActivities = await db.select().from(activities).where(eq(activities.bundleId, id));
	const keepLessons = new Set<string>();
	const keepPages = new Set<string>();
	const keepExercises = new Set<string>();
	const keepActivities = new Set<string>();

	const lessonInputs = Array.isArray(body.lessons) ? body.lessons : [];
	for (const [index, raw] of lessonInputs.entries()) {
		if (typeof raw !== "object" || raw === null) continue;
		const lesson = raw as { id?: unknown; title?: unknown; pages?: unknown; exercises?: unknown };
		const lessonId = typeof lesson.id === "string" && lesson.id ? lesson.id : randomId();
		const title = typeof lesson.title === "string" ? lesson.title : "Lecke";
		const current = await db.select().from(lessons).where(eq(lessons.id, lessonId)).get();
		if (current && current.bundleId !== id) return { error: "Lesson belongs to another bundle", status: 403 };
		if (current) {
			await db.update(lessons).set({ title, sortOrder: index, bundleId: id }).where(eq(lessons.id, lessonId));
		} else {
			await db.insert(lessons).values({ id: lessonId, bundleId: id, title, sortOrder: index });
		}
		ownedLessonIds.add(lessonId);
		keepLessons.add(lessonId);

		const pages = Array.isArray(lesson.pages) ? lesson.pages : [];
		for (const [pageIndex, pageRaw] of pages.entries()) {
			if (typeof pageRaw !== "object" || pageRaw === null) continue;
			const page = pageRaw as { id?: unknown; body?: unknown; type?: unknown; payload?: unknown };
			const pageId = typeof page.id === "string" && page.id ? page.id : randomId();
			const pageBody = typeof page.body === "string" ? page.body : "";
			const type = pageType(page.type);
			const payloadJson = JSON.stringify(page.payload ?? {});
			const pageRow = await db.select().from(lessonPages).where(eq(lessonPages.id, pageId)).get();
			if (pageRow && !ownedLessonIds.has(pageRow.lessonId)) {
				return { error: "Page belongs to another bundle", status: 403 };
			}
			if (pageRow) {
				await db.update(lessonPages).set({ body: pageBody, type, payloadJson, sortOrder: pageIndex, lessonId }).where(eq(lessonPages.id, pageId));
			} else {
				await db.insert(lessonPages).values({ id: pageId, lessonId, sortOrder: pageIndex, body: pageBody, type, payloadJson });
			}
			keepPages.add(pageId);
		}

		const exercises = Array.isArray(lesson.exercises) ? lesson.exercises : [];
		for (const [exerciseIndex, exerciseRaw] of exercises.entries()) {
			if (typeof exerciseRaw !== "object" || exerciseRaw === null) continue;
			const exercise = exerciseRaw as { id?: unknown; type?: unknown; prompt?: unknown; answer?: unknown; payload?: unknown };
			const exerciseId = typeof exercise.id === "string" && exercise.id ? exercise.id : randomId();
			const exerciseRow = {
				id: exerciseId,
				lessonId,
				type: exerciseType(exercise.type),
				prompt: typeof exercise.prompt === "string" ? exercise.prompt : "",
				answer: typeof exercise.answer === "string" ? exercise.answer : "",
				payloadJson: JSON.stringify(exercise.payload ?? {}),
				sortOrder: exerciseIndex,
			};
			const currentExercise = await db.select().from(lessonExercises).where(eq(lessonExercises.id, exerciseId)).get();
			if (currentExercise && !ownedLessonIds.has(currentExercise.lessonId)) {
				return { error: "Exercise belongs to another bundle", status: 403 };
			}
			if (currentExercise) {
				await db.update(lessonExercises).set(exerciseRow).where(eq(lessonExercises.id, exerciseId));
			} else {
				await db.insert(lessonExercises).values(exerciseRow);
			}
			keepExercises.add(exerciseId);
		}
	}

	const activityInputs = Array.isArray(body.activities) ? body.activities : [];
	for (const [index, raw] of activityInputs.entries()) {
		if (typeof raw !== "object" || raw === null) continue;
		const activity = raw as { id?: unknown; type?: unknown; title?: unknown; setId?: unknown; cards?: unknown; hotspots?: unknown };
		const type: "cards" | "map" | "quiz" =
			activity.type === "map" || activity.type === "quiz" || activity.type === "cards" ? activity.type : "cards";
		const activityId = typeof activity.id === "string" && activity.id ? activity.id : randomId();
		const current = await db.select().from(activities).where(eq(activities.id, activityId)).get();
		if (current && current.bundleId !== id) return { error: "Activity belongs to another bundle", status: 403 };

		let setId = typeof activity.setId === "string" && activity.setId ? activity.setId : null;
		if (setId) {
			const owned = await db.select().from(sets).where(and(eq(sets.id, setId), eq(sets.ownerId, ownerId))).get();
			if (!owned) setId = null;
		}
		const drafts = asCardDrafts(activity.cards);
		if (type === "cards" && drafts.length > 0) {
			if (setId) {
				await replaceSetCards(db, setId, drafts);
			} else {
				const created = await createSetWithCards(db, {
					ownerId,
					classId: null,
					name: row.title,
					subject: row.subject,
					cards: drafts,
				});
				setId = created.setId;
			}
		}

		const activityRow = {
			id: activityId,
			bundleId: id,
			type,
			title: typeof activity.title === "string" ? activity.title : type,
			setId,
			sortOrder: index,
		};
		if (current) {
			await db.update(activities).set(activityRow).where(eq(activities.id, activityId));
		} else {
			await db.insert(activities).values(activityRow);
		}
		keepActivities.add(activityId);

		if (type === "map" && Array.isArray(activity.hotspots)) {
			const map = await db.select().from(mapItems).where(eq(mapItems.activityId, activityId)).get();
			const hotspotsJson = JSON.stringify(activity.hotspots);
			if (map) {
				await db.update(mapItems).set({ hotspotsJson }).where(eq(mapItems.id, map.id));
			} else {
				await db.insert(mapItems).values({ id: randomId(), activityId, hotspotsJson });
			}
		}
	}

	for (const page of existingPages) {
		if (!keepPages.has(page.id)) await db.delete(lessonPages).where(eq(lessonPages.id, page.id));
	}
	for (const exercise of existingExercises) {
		if (!keepExercises.has(exercise.id)) await db.delete(lessonExercises).where(eq(lessonExercises.id, exercise.id));
	}
	for (const lesson of existingLessons) {
		if (!keepLessons.has(lesson.id)) {
			await db.delete(lessonPages).where(eq(lessonPages.lessonId, lesson.id));
			await db.delete(lessonExercises).where(eq(lessonExercises.lessonId, lesson.id));
			await db.delete(lessons).where(eq(lessons.id, lesson.id));
		}
	}
	for (const activity of existingActivities) {
		if (!keepActivities.has(activity.id)) {
			await db.delete(mapItems).where(eq(mapItems.activityId, activity.id));
			await db.delete(activities).where(eq(activities.id, activity.id));
		}
	}

	return { id };
}

export const bundleRoutes = new Hono<AppEnv>();

bundleRoutes.get("/public", async (c) => {
	const db = createDb(c.env.DB);
	const user = await optionalUser(c);
	const rows = await db.select({ id: bundles.id }).from(bundles).where(eq(bundles.status, "public"));
	const items = await loadBundleSnapshots(
		db,
		rows.map((row) => row.id),
		user?.id,
	);
	return c.json({ bundles: items });
});

bundleRoutes.get("/:id", async (c) => {
	const db = createDb(c.env.DB);
	const user = await optionalUser(c);
	const snap = await bundleSnapshot(db, c.req.param("id"), user?.id);
	if (!snap) return jsonError(c, 404, "Bundle not found");
	if (snap.status !== "public" && snap.ownerId !== user?.id) return jsonError(c, 404, "Bundle not found");
	return c.json({ bundle: snap });
});

bundleRoutes.use("*", requireAuth);

bundleRoutes.post("/", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	if (!user.isTeacher) return jsonError(c, 403, "Teacher only");
	const body = await readJson<SnapshotBody>(c);
	if (!body) return jsonError(c, 400, "Invalid body");
	const result = await upsertBundleFromSnapshot(db, user.id, body);
	if ("error" in result) return jsonError(c, result.status, result.error);
	const snap = await bundleSnapshot(db, result.id, user.id);
	return c.json({ bundle: snap }, 201);
});

bundleRoutes.patch("/:id", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const row = await db.select().from(bundles).where(eq(bundles.id, c.req.param("id"))).get();
	if (!row) return jsonError(c, 404, "Bundle not found");
	if (row.ownerId !== user.id) return jsonError(c, 403, "Not the owner");
	const body = await readJson<SnapshotBody>(c);
	if (!body) return jsonError(c, 400, "Invalid body");
	if (body.status === "public" && !user.isTeacher) return jsonError(c, 403, "Teacher only");
	const isStatusOnly =
		typeof body.status === "string" &&
		body.kind === undefined &&
		body.title === undefined &&
		body.subject === undefined &&
		body.lessons === undefined &&
		body.activities === undefined;
	if (isStatusOnly) {
		const status = body.status === "public" ? "public" : "draft";
		await db.update(bundles).set({ status, updatedAt: nowIso() }).where(eq(bundles.id, row.id));
		const snap = await bundleSnapshot(db, row.id, user.id);
		return c.json({ bundle: snap });
	}
	const result = await upsertBundleFromSnapshot(db, user.id, { ...body, id: row.id });
	if ("error" in result) return jsonError(c, result.status, result.error);
	const snap = await bundleSnapshot(db, row.id, user.id);
	return c.json({ bundle: snap });
});

bundleRoutes.post("/:id/save", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const row = await db.select().from(bundles).where(eq(bundles.id, c.req.param("id"))).get();
	if (!row || row.status !== "public") return jsonError(c, 404, "Bundle not found");
	const existing = await db
		.select()
		.from(librarySaves)
		.where(and(eq(librarySaves.bundleId, row.id), eq(librarySaves.userId, user.id)))
		.get();
	if (!existing) {
		await db.insert(librarySaves).values({ bundleId: row.id, userId: user.id, createdAt: nowIso() });
	}
	return c.json({ ok: true });
});

bundleRoutes.delete("/:id/save", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	await db
		.delete(librarySaves)
		.where(and(eq(librarySaves.bundleId, c.req.param("id")), eq(librarySaves.userId, user.id)));
	return c.json({ ok: true });
});

export async function assignBundleToClass(db: Db, args: { classId: string; bundleId: string; teacherId: string }) {
	const classroom = await db.select().from(classes).where(eq(classes.id, args.classId)).get();
	if (!classroom) return { error: "Class not found", status: 404 as const };
	const member = await db
		.select()
		.from(classMembers)
		.where(and(eq(classMembers.classId, args.classId), eq(classMembers.userId, args.teacherId)))
		.get();
	if (!member || member.role !== "teacher") return { error: "Teacher only", status: 403 as const };
	const bundle = await db.select().from(bundles).where(eq(bundles.id, args.bundleId)).get();
	if (!bundle || bundle.status !== "public") return { error: "Bundle not found", status: 404 as const };

	const existing = await db
		.select()
		.from(classBundles)
		.where(and(eq(classBundles.classId, args.classId), eq(classBundles.bundleId, args.bundleId)))
		.get();

	const cardActivity = await db
		.select()
		.from(activities)
		.where(and(eq(activities.bundleId, args.bundleId), eq(activities.type, "cards")))
		.get();
	let quizSetId = existing?.quizSetId ?? null;
	if (cardActivity?.setId) {
		const sourceCards = await db.select().from(cards).where(and(eq(cards.setId, cardActivity.setId), isNull(cards.deletedAt)));
		const drafts = sourceCards.map((card) => ({
			front: card.front,
			back: card.back,
			hint: card.hint,
			example: card.example,
		}));
		if (drafts.length > 0) {
			if (quizSetId) {
				await replaceSetCards(db, quizSetId, drafts);
			} else {
				const created = await createSetWithCards(db, {
					ownerId: args.teacherId,
					classId: args.classId,
					name: bundle.title,
					subject: bundle.subject,
					cards: drafts,
				});
				quizSetId = created.setId;
			}
		}
	}

	if (existing) {
		await db
			.update(classBundles)
			.set({ quizSetId: quizSetId ?? existing.quizSetId })
			.where(and(eq(classBundles.classId, args.classId), eq(classBundles.bundleId, args.bundleId)));
	} else {
		await db.insert(classBundles).values({
			classId: args.classId,
			bundleId: args.bundleId,
			quizSetId,
			assignedAt: nowIso(),
		});
	}
	return { quizSetId };
}

export const classBundleRoutes = new Hono<AppEnv>();
classBundleRoutes.use("*", requireAuth);

classBundleRoutes.get("/:id/bundles", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const member = await db
		.select()
		.from(classMembers)
		.where(and(eq(classMembers.classId, classId), eq(classMembers.userId, user.id)))
		.get();
	if (!member) return jsonError(c, 403, "Not a member of this class");
	const rows = await db.select().from(classBundles).where(eq(classBundles.classId, classId));
	const items = await loadBundleSnapshots(
		db,
		rows.map((row) => row.bundleId),
		user.id,
	);
	const extra = new Map(rows.map((row) => [row.bundleId, row]));
	return c.json({
		bundles: items.map((snap) => {
			const row = extra.get(snap.id as string);
			return { ...snap, quizSetId: row?.quizSetId, assignedAt: row?.assignedAt };
		}),
	});
});

classBundleRoutes.delete("/:id/bundles/:bundleId", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const classId = c.req.param("id");
	const bundleId = c.req.param("bundleId");
	const member = await db
		.select()
		.from(classMembers)
		.where(and(eq(classMembers.classId, classId), eq(classMembers.userId, user.id)))
		.get();
	if (!member) return jsonError(c, 403, "Not a member of this class");
	const row = await db
		.select()
		.from(classBundles)
		.where(and(eq(classBundles.classId, classId), eq(classBundles.bundleId, bundleId)))
		.get();
	if (!row) return jsonError(c, 404, "Bundle not found");
	const bundle = await db.select().from(bundles).where(eq(bundles.id, bundleId)).get();
	if (bundle?.ownerId !== user.id && member.role !== "teacher") {
		return jsonError(c, 403, "Not allowed");
	}
	await db.delete(classBundles).where(and(eq(classBundles.classId, classId), eq(classBundles.bundleId, bundleId)));
	return c.json({ ok: true });
});

classBundleRoutes.post("/:id/bundles", async (c) => {
	const user = c.get("user");
	const db = createDb(c.env.DB);
	const body = await readJson<{ bundleId?: unknown } & SnapshotBody>(c);
	if (!body) return jsonError(c, 400, "Invalid body");
	let bundleId = typeof body.bundleId === "string" ? body.bundleId : "";
	if (!bundleId) {
		if (!(await isTeacherAnywhere(db, user.id))) return jsonError(c, 403, "Teacher only");
		const created = await upsertBundleFromSnapshot(db, user.id, { ...body, status: "public" });
		if ("error" in created) return jsonError(c, created.status, created.error);
		bundleId = created.id;
	}
	const assigned = await assignBundleToClass(db, { classId: c.req.param("id"), bundleId, teacherId: user.id });
	if ("error" in assigned && assigned.error) return jsonError(c, assigned.status, assigned.error);
	const snap = await bundleSnapshot(db, bundleId, user.id);
	return c.json({ bundle: snap, quizSetId: assigned.quizSetId }, 201);
});
