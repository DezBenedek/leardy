import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	username: text("username").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	email: text("email"),
	isTeacher: integer("is_teacher").notNull().default(0),
	createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	tokenHash: text("token_hash").notNull().unique(),
	createdAt: text("created_at").notNull(),
	expiresAt: text("expires_at").notNull(),
});

export const classes = sqliteTable("classes", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	joinCode: text("join_code").notNull().unique(),
	ownerId: text("owner_id").notNull(),
	allowStudentSets: integer("allow_student_sets").notNull().default(0),
	createdAt: text("created_at").notNull(),
});

export const classMembers = sqliteTable(
	"class_members",
	{
		classId: text("class_id").notNull(),
		userId: text("user_id").notNull(),
		role: text("role", { enum: ["teacher", "student"] }).notNull(),
		joinedAt: text("joined_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.classId, table.userId] }), index("idx_class_members_user_id").on(table.userId)],
);

export const classBans = sqliteTable(
	"class_bans",
	{
		classId: text("class_id").notNull(),
		userId: text("user_id").notNull(),
		bannedBy: text("banned_by").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.classId, table.userId] })],
);

export const setEditors = sqliteTable(
	"set_editors",
	{
		setId: text("set_id").notNull(),
		userId: text("user_id").notNull(),
		addedBy: text("added_by").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.setId, table.userId] })],
);

export const classMaterials = sqliteTable("class_materials", {
	id: text("id").primaryKey(),
	classId: text("class_id").notNull(),
	title: text("title").notNull(),
	url: text("url"),
	note: text("note"),
	createdBy: text("created_by").notNull(),
	createdAt: text("created_at").notNull(),
});

export const sets = sqliteTable("sets", {
	id: text("id").primaryKey(),
	ownerId: text("owner_id").notNull(),
	classId: text("class_id"),
	name: text("name").notNull(),
	subject: text("subject").notNull(),
	visibility: text("visibility", { enum: ["private", "classroom"] }).notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
	deletedAt: text("deleted_at"),
	revision: integer("revision").notNull().default(1),
	clientId: text("client_id").notNull(),
});

export const cards = sqliteTable("cards", {
	id: text("id").primaryKey(),
	setId: text("set_id").notNull(),
	front: text("front").notNull(),
	back: text("back").notNull(),
	hint: text("hint"),
	example: text("example"),
	sortOrder: integer("sort_order").notNull().default(0),
	updatedAt: text("updated_at").notNull(),
	deletedAt: text("deleted_at"),
	revision: integer("revision").notNull().default(1),
	clientId: text("client_id").notNull(),
});

export const syncCursors = sqliteTable("sync_cursors", {
	userId: text("user_id").primaryKey(),
	cursor: text("cursor").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const quizSessions = sqliteTable("quiz_sessions", {
	id: text("id").primaryKey(),
	classId: text("class_id").notNull(),
	setId: text("set_id").notNull(),
	teacherId: text("teacher_id").notNull(),
	status: text("status").notNull(),
	createdAt: text("created_at").notNull(),
	pace: text("pace").notNull().default("teacher"),
	seconds: integer("seconds").notNull().default(30),
	questionMode: text("question_mode").notNull().default("choice"),
});

export const subjects = sqliteTable(
	"subjects",
	{
		id: text("id").primaryKey(),
		ownerId: text("owner_id").notNull(),
		clientId: text("client_id").notNull(),
		name: text("name").notNull(),
		revision: integer("revision").notNull().default(0),
		payload: text("payload"),
		updatedAt: text("updated_at").notNull(),
		deletedAt: text("deleted_at"),
	},
	(table) => [index("idx_subjects_owner_updated").on(table.ownerId, table.updatedAt)],
);

export const decks = sqliteTable(
	"decks",
	{
		id: text("id").primaryKey(),
		ownerId: text("owner_id").notNull(),
		subjectId: text("subject_id"),
		clientId: text("client_id").notNull(),
		name: text("name").notNull(),
		revision: integer("revision").notNull().default(0),
		payload: text("payload"),
		updatedAt: text("updated_at").notNull(),
		deletedAt: text("deleted_at"),
	},
	(table) => [index("idx_decks_owner_updated").on(table.ownerId, table.updatedAt)],
);

export const cardsLocal = sqliteTable(
	"cards_local",
	{
		id: text("id").primaryKey(),
		ownerId: text("owner_id").notNull(),
		deckId: text("deck_id"),
		clientId: text("client_id").notNull(),
		front: text("front").notNull().default(""),
		back: text("back").notNull().default(""),
		hint: text("hint"),
		example: text("example"),
		revision: integer("revision").notNull().default(0),
		payload: text("payload"),
		updatedAt: text("updated_at").notNull(),
		deletedAt: text("deleted_at"),
	},
	(table) => [index("idx_cards_local_owner_updated").on(table.ownerId, table.updatedAt)],
);

export const bundles = sqliteTable("bundles", {
	id: text("id").primaryKey(),
	kind: text("kind", { enum: ["topic", "skill"] }).notNull(),
	subject: text("subject").notNull(),
	title: text("title").notNull(),
	ownerId: text("owner_id").notNull(),
	status: text("status", { enum: ["draft", "public"] }).notNull().default("draft"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const lessons = sqliteTable("lessons", {
	id: text("id").primaryKey(),
	bundleId: text("bundle_id").notNull(),
	title: text("title").notNull(),
	sortOrder: integer("sort_order").notNull().default(0),
});

export const lessonPages = sqliteTable(
	"lesson_pages",
	{
		id: text("id").primaryKey(),
		lessonId: text("lesson_id").notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
		body: text("body").notNull(),
		type: text("type").notNull().default("text"),
		payloadJson: text("payload_json").notNull().default("{}"),
	},
	(table) => [index("idx_lesson_pages_lesson_id").on(table.lessonId)],
);

export const lessonExercises = sqliteTable("lesson_exercises", {
	id: text("id").primaryKey(),
	lessonId: text("lesson_id").notNull(),
	type: text("type").notNull(),
	prompt: text("prompt").notNull(),
	answer: text("answer").notNull().default(""),
	payloadJson: text("payload_json").notNull().default("{}"),
	sortOrder: integer("sort_order").notNull().default(0),
});

export const activities = sqliteTable("activities", {
	id: text("id").primaryKey(),
	bundleId: text("bundle_id").notNull(),
	type: text("type", { enum: ["cards", "map", "quiz"] }).notNull(),
	title: text("title").notNull(),
	setId: text("set_id"),
	sortOrder: integer("sort_order").notNull().default(0),
});

export const mapItems = sqliteTable(
	"map_items",
	{
		id: text("id").primaryKey(),
		activityId: text("activity_id").notNull(),
		hotspotsJson: text("hotspots_json").notNull(),
	},
	(table) => [index("idx_map_items_activity_id").on(table.activityId)],
);

export const librarySaves = sqliteTable(
	"library_saves",
	{
		bundleId: text("bundle_id").notNull(),
		userId: text("user_id").notNull(),
		createdAt: text("created_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.bundleId, table.userId] })],
);

export const classBundles = sqliteTable(
	"class_bundles",
	{
		classId: text("class_id").notNull(),
		bundleId: text("bundle_id").notNull(),
		quizSetId: text("quiz_set_id"),
		assignedAt: text("assigned_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.classId, table.bundleId] })],
);

export const lessonProgress = sqliteTable(
	"lesson_progress",
	{
		userId: text("user_id").notNull(),
		lessonId: text("lesson_id").notNull(),
		completedAt: text("completed_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.lessonId] })],
);

export const idempotencyKeys = sqliteTable("idempotency_keys", {
	key: text("key").primaryKey(),
	userId: text("user_id").notNull(),
	responseJson: text("response_json").notNull(),
	createdAt: text("created_at").notNull(),
});

export const cardSchedulesRemote = sqliteTable(
	"card_schedules",
	{
		id: text("id").primaryKey(),
		ownerId: text("owner_id").notNull(),
		clientId: text("client_id").notNull(),
		cardId: text("card_id").notNull(),
		dueAt: text("due_at").notNull(),
		payload: text("payload"),
		revision: integer("revision").notNull().default(0),
		updatedAt: text("updated_at").notNull(),
		deletedAt: text("deleted_at"),
	},
	(table) => [index("idx_card_schedules_owner_updated").on(table.ownerId, table.updatedAt)],
);

export const reviewLogs = sqliteTable(
	"review_logs",
	{
		id: text("id").primaryKey(),
		ownerId: text("owner_id").notNull(),
		clientId: text("client_id").notNull(),
		cardId: text("card_id").notNull(),
		payload: text("payload"),
		revision: integer("revision").notNull().default(0),
		updatedAt: text("updated_at").notNull(),
		deletedAt: text("deleted_at"),
	},
	(table) => [index("idx_review_logs_owner_updated").on(table.ownerId, table.updatedAt)],
);

export const dailyActivitiesRemote = sqliteTable(
	"daily_activities",
	{
		id: text("id").primaryKey(),
		ownerId: text("owner_id").notNull(),
		clientId: text("client_id").notNull(),
		date: text("date").notNull(),
		cardsReviewed: integer("cards_reviewed").notNull().default(0),
		payload: text("payload"),
		revision: integer("revision").notNull().default(0),
		updatedAt: text("updated_at").notNull(),
		deletedAt: text("deleted_at"),
	},
	(table) => [index("idx_daily_activities_owner_updated").on(table.ownerId, table.updatedAt)],
);
