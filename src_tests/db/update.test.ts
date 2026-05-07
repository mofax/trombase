import { describe, expect, it } from "bun:test";
import { createSchema } from "../../src/schema";
import { DbId } from "../../src/db/dbid";
import { buildUpdateSql, normalizeUpdateAction } from "../../src/db/update";
import { noteEntities } from "./fixtures/test-entities";

const camelSchema = createSchema({
	casing: "camel",
	entities: noteEntities(),
});

const snakeSchema = createSchema({
	casing: "snake",
	entities: noteEntities(),
});

describe("buildUpdateSql with camel casing", () => {
	it("maps camelCase field names in set clause", () => {
		const id = DbId.init();
		const updatedAt = new Date("2026-01-02T00:00:00.000Z");
		const { text, params } = buildUpdateSql(camelSchema, {
			table: "notes",
			id,
			payload: { title: "new", sortOrder: 2, updatedAt },
		});
		expect(text).toBe(
			'update "notes" set "sortOrder" = $1, "title" = $2, "updatedAt" = $3 where "id" = $4',
		);
		expect(params).toEqual([2, "new", updatedAt, id.toString()]);
	});

	it("skips id and createdAt in set clause", () => {
		const id = DbId.init();
		const { text } = buildUpdateSql(camelSchema, {
			table: "notes",
			id,
			payload: {
				id: DbId.init(),
				createdAt: new Date(),
				title: "x",
				sortOrder: 0,
				updatedAt: new Date(),
			},
		});
		expect(text).toBe(
			'update "notes" set "sortOrder" = $1, "title" = $2, "updatedAt" = $3 where "id" = $4',
		);
	});

	it("throws for unknown table", () => {
		expect(() =>
			buildUpdateSql(camelSchema, {
				table: "ghost",
				id: DbId.init(),
				payload: { title: "x" },
			}),
		).toThrow(/Unknown table/);
	});
});

describe("buildUpdateSql with snake casing", () => {
	it("maps camelCase field names to snake_case in set clause", () => {
		const id = DbId.init();
		const updatedAt = new Date("2026-01-02T00:00:00.000Z");
		const { text, params } = buildUpdateSql(snakeSchema, {
			table: "notes",
			id,
			payload: { title: "new", sortOrder: 2, updatedAt },
		});
		expect(text).toBe(
			'update "notes" set "sort_order" = $1, "title" = $2, "updated_at" = $3 where "id" = $4',
		);
		expect(params).toEqual([2, "new", updatedAt, id.toString()]);
	});
});

describe("normalizeUpdateAction", () => {
	it("normalizes update action", () => {
		const id = DbId.init();
		const op = normalizeUpdateAction(
			camelSchema,
			{ table: "notes", action: "update", id, payload: { title: "b", sortOrder: 1 } },
			0,
		);
		expect(op.action).toBe("update");
		expect(op.id).toEqual(id);
		expect(op.payload.title).toBe("b");
		expect(op.payload.sortOrder).toBe(1);
	});

	it("rejects empty payload", () => {
		expect(() =>
			normalizeUpdateAction(
				camelSchema,
				{ table: "notes", action: "update", id: DbId.init(), payload: {} },
				0,
			),
		).toThrow(/update payload must not be empty/);
	});
});
