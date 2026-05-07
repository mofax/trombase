import qs from "qs";
import { TromBase, type DbExecAction, type DbSelectAction } from "../../src/main";
import index from "./index.html";
import { schema } from "./schema";

const trom = TromBase({
	databaseUrl: process.env.DATABASE_URL ?? "postgres://localhost:5432/trombase_harness",
	schema,
});

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function readJson(req: Request): Promise<unknown> {
	return await req.json();
}

function guardString(value: unknown, name: string): string {
	if (typeof value !== "string") {
		throw new Error(`${name} must be a string`);
	}
	return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function coerceSelectAction(action: Record<string, unknown>): DbSelectAction {
	const coerced: Record<string, unknown> = Object.assign({}, action);

	if (typeof coerced.limit === "string" && coerced.limit !== "") {
		const limit = Number(coerced.limit);
		if (!Number.isFinite(limit)) {
			throw new Error("action.limit must be a number");
		}
		coerced.limit = limit;
	}
	if (typeof coerced.offset === "string" && coerced.offset !== "") {
		const offset = Number(coerced.offset);
		if (!Number.isFinite(offset)) {
			throw new Error("action.offset must be a number");
		}
		coerced.offset = offset;
	}

	if (coerced.with !== undefined && isPlainObject(coerced.with)) {
		const withClause: Record<string, unknown> = Object.assign({}, coerced.with);
		for (const key of Object.keys(withClause)) {
			if (withClause[key] === "true") {
				withClause[key] = true;
			}
		}
		coerced.with = withClause;
	}

	return coerced as DbSelectAction;
}

Bun.serve({
	routes: {
		"/": index,

		"/api/auth/register": {
			POST: async (req) => {
				try {
					const body = await readJson(req);
					if (!body || typeof body !== "object") {
						return Response.json({ message: "Request body must be an object" }, { status: 400 });
					}
					const result = await trom.auth.registerWithUsernamePassword({
						password: guardString((body as Record<string, unknown>).password, "Password"),
						email: guardString((body as Record<string, unknown>).email, "Email"),
					});
					return jsonResponse(result.toJSON());
				} catch (error) {
					console.error(error);
					if (error instanceof Error) {
						return Response.json({ message: error.message }, { status: 400 });
					}
					return Response.json({ message: "Registration failed" }, { status: 400 });
				}
			},
		},

		"/api/auth/login": {
			POST: async (req) => {
				try {
					const body = await readJson(req);
					if (!body || typeof body !== "object") {
						return Response.json({ message: "Request body must be an object" }, { status: 400 });
					}
					const result = await trom.auth.loginWithUsernamePassword({
						password: guardString((body as Record<string, unknown>).password, "Password"),
						email: guardString((body as Record<string, unknown>).email, "Email"),
					});
					return jsonResponse(result.toJSON());
				} catch (error) {
					console.error(error);
					if (error instanceof Error) {
						return Response.json({ message: error.message }, { status: 400 });
					}
					return Response.json({ message: "Login failed" }, { status: 400 });
				}
			},
		},

		"/api/auth/logout": {
			POST: async (req) => {
				try {
					const body = (await req.json()) as any;
					const result = await trom.auth.invalidateSessionToken({
						token: guardString(body?.token, "body.token"),
					});
					return jsonResponse(result.toJSON());
				} catch (error) {
					console.error(error);
					if (error instanceof Error) {
						return Response.json({ message: error.message }, { status: 400 });
					}
					return Response.json({ message: "Logout failed" }, { status: 400 });
				}
			},
		},

		"/api/db/mutations": {
			POST: async (req) => {
				try {
					const sessionToken = guardString(req.headers.get("x-session-token"), "x-session-token");
					const session = await trom.auth.getSessionByToken(sessionToken);
					if (!session) {
						return Response.json({ message: "Authentication required" }, { status: 401 });
					}
					const body = await req.json();
					await trom.db.withSession(session, async () => {
						await trom.db.doMutations(body as DbExecAction[]);
					});
					return jsonResponse({});
				} catch (error) {
					console.error(error);
					if (error instanceof Error) {
						return Response.json(
							{
								message: error.message,
								name: error.name,
							},
							{ status: 400 },
						);
					}
					console.error(error);
					return Response.json(
						{
							message: "An unknown error occurred",
						},
						{ status: 500 },
					);
				}
			},
		},

		"/api/db/select": {
			GET: async (req) => {
				try {
					const sessionToken = guardString(req.headers.get("x-session-token"), "x-session-token");
					const session = await trom.auth.getSessionByToken(sessionToken);
					if (!session) {
						return Response.json({ message: "Authentication required" }, { status: 401 });
					}
					const search = new URL(req.url).search;
					const query = search.startsWith("?") ? search.slice(1) : search;
					const parsed = qs.parse(query) as { action?: unknown };
					if (!parsed.action || !isPlainObject(parsed.action)) {
						return Response.json({ message: "query action is required" }, { status: 400 });
					}
					const action = coerceSelectAction(parsed.action);
					const rows = await trom.db.withSession(session, async () => {
						return await trom.db.select(action);
					});
					return Response.json(rows);
				} catch (error) {
					console.error(error);
					if (error instanceof Error) {
						return Response.json(
							{
								message: error.message,
								name: error.name,
							},
							{ status: 400 },
						);
					}
					console.error(error);
					return Response.json(
						{
							message: "An unknown error occurred",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
	development: {
		hmr: true,
		console: true,
	},
});

console.log("Server running. Open http://localhost:3000");
