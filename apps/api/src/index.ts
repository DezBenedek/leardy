import { Hono } from "hono";
import { cors } from "hono/cors";
import { rateLimit } from "./middleware/rate-limit";
import { QuizSession } from "./quiz/QuizSession";
import { authRoutes } from "./routes/auth";
import { classRoutes } from "./routes/classes";
import { quizRoutes } from "./routes/quiz";
import { syncRoutes } from "./routes/sync";

export { QuizSession };

const app = new Hono<{ Bindings: Env }>();

app.use(
	"*",
	cors({
		origin: (origin) => origin || "*",
		allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
		allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
		exposeHeaders: ["Authorization"],
	}),
);
app.use("*", rateLimit);

app.get("/", (c) => c.json({ name: "leardy-api", ok: true }));
app.get("/health", (c) => c.json({ ok: true }));

app.route("/auth", authRoutes);
app.route("/classes", classRoutes);
app.route("/v1/sync", syncRoutes);
app.route("/quiz", quizRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
	console.error(JSON.stringify({ level: "error", message: err.message, stack: err.stack }));
	if (err.message.includes("Failed query") && err.message.includes("insert into \"cards\"")) {
		return c.json({ error: "Could not save the cards" }, 500);
	}
	return c.json({ error: "Internal Server Error" }, 500);
});

export default app;
