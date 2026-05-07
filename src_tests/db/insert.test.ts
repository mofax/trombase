import { describe, expect, it } from "bun:test";
import { createSchema } from "../../src/schema";
import { DbId } from "../../src/db/dbid";
import { buildInsertSql, normalizeInsertAction } from "../../src/db/insert";
import { noteEntities } from "./fixtures/test-entities";

const camelSchema = createSchema({
	casing: "camel",
	entities: noteEntities(),
});

const snakeSchema = createSchema({
	casing: "snake",
	entities: noteEntities(),
});

describe("buildInsertSql with camel casing", () => {
	it("maps camelCase field names to camelCase physical columns", () => {
		const id = DbId.init();
		const userId = DbId.init();
		const createdAt = new Date("2026-01-01T00:00:00.000Z");
		const updatedAt = new Date("2026-01-02T00:00:00.000Z");
		const { text, params } = buildInsertSql(camelSchema, {
			table: "notes",
			payload: {
				id,
				title: "hello",
				userId,
				sortOrder: 1,
				createdAt,
				updatedAt,
			},
		});
		expect(text).toBe(
			'insert into "notes" ("createdAt", "id", "sortOrder", "title", "updatedAt", "userId") values ($1, $2, $3, $4, $5, $6)',
		);
		expect(params).toEqual([createdAt, id.toString(), 1, "hello", updatedAt, userId.toString()]);
	});

	it("serializes DbId in params", () => {
		const id = DbId.init();
		const userId = DbId.init();
		const { params } = buildInsertSql(camelSchema, {
			table: "notes",
			payload: {
				id,
				title: "x",
				userId,
				sortOrder: 0,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		expect(params[1]).toBe(id.toString());
		expect(params[5]).toBe(userId.toString());
	});

	it("throws for unknown table", () => {
		expect(() =>
			buildInsertSql(camelSchema, { table: "ghost", payload: { id: DbId.init().toString() } }),
		).toThrow(/Unknown table/);
	});
});

describe("buildInsertSql with snake casing", () => {
	it("maps camelCase field names to snake_case physical columns", () => {
		const id = DbId.init();
		const userId = DbId.init();
		const createdAt = new Date("2026-01-01T00:00:00.000Z");
		const updatedAt = new Date("2026-01-02T00:00:00.000Z");
		const { text, params } = buildInsertSql(snakeSchema, {
			table: "notes",
			payload: {
				id,
				title: "hello",
				userId,
				sortOrder: 1,
				createdAt,
				updatedAt,
			},
		});
		expect(text).toBe(
			'insert into "notes" ("created_at", "id", "sort_order", "title", "updated_at", "user_id") values ($1, $2, $3, $4, $5, $6)',
		);
		expect(params).toEqual([createdAt, id.toString(), 1, "hello", updatedAt, userId.toString()]);
	});
});

describe("normalizeInsertAction", () => {
	it("normalizes insert action", () => {
		const id = DbId.init();
		const userId = DbId.init();
		const op = normalizeInsertAction(
			camelSchema,
			{ table: "notes", action: "insert", payload: { id, title: "a", userId, sortOrder: 2 } },
			0,
		);
		expect(op.action).toBe("insert");
		expect(op.table).toBe("notes");
		expect(op.id).toEqual(id);
		expect(op.payload.title).toBe("a");
		expect(op.payload.userId).toEqual(userId);
	});

	it("requires id in payload", () => {
		expect(() =>
			normalizeInsertAction(
				camelSchema,
				{ table: "notes", action: "insert", payload: { title: "a" } },
				0,
			),
		).toThrow(/insert payload must include id/);
	});

	it("rejects caller timestamps", () => {
		expect(() =>
			normalizeInsertAction(
				camelSchema,
				{
					table: "notes",
					action: "insert",
					payload: { id: DbId.init(), createdAt: new Date() },
				},
				0,
			),
		).toThrow(/createdAt and updatedAt are handled internally/);
	});
});
