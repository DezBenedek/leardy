export type AuthUser = {
	id: string;
	username: string;
	email: string | null;
	createdAt: string;
};

export type AppEnv = {
	Bindings: Env;
	Variables: {
		user: AuthUser;
	};
};

export type MemberRole = "teacher" | "student";
