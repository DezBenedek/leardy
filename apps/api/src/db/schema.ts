import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	username: text("username").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	email: text("email"),
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
	(table) => [primaryKey({ columns: [table.classId, table.userId] })],
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

export const subjects = sqliteTable("subjects", {
	id: text("id").primaryKey(),
	ownerId: text("owner_id").notNull(),
	clientId: text("client_id").notNull(),
	name: text("name").notNull(),
	revision: integer("revision").notNull().default(0),
	payload: text("payload"),
	updatedAt: text("updated_at").notNull(),
	deletedAt: text("deleted_at"),
});

export const decks = sqliteTable("decks", {
	id: text("id").primaryKey(),
	ownerId: text("owner_id").notNull(),
	subjectId: text("subject_id"),
	clientId: text("client_id").notNull(),
	name: text("name").notNull(),
	revision: integer("revision").notNull().default(0),
	payload: text("payload"),
	updatedAt: text("updated_at").notNull(),
	deletedAt: text("deleted_at"),
});

export const cardsLocal = sqliteTable("cards_local", {
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
});

export const idempotencyKeys = sqliteTable("idempotency_keys", {
	key: text("key").primaryKey(),
	userId: text("user_id").notNull(),
	responseJson: text("response_json").notNull(),
	createdAt: text("created_at").notNull(),
});
