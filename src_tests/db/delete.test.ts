import { describe, expect, it } from "bun:test";
import { createSchema } from "../../src/schema";
import { DbId } from "../../src/db/dbid";
import { buildDeleteSql, normalizeDeleteAction } from "../../src/db/delete";
import { userNoteEntities } from "./fixtures/test-entities";

const camelSchema = createSchema({
	casing: "camel",
	entities: userNoteEntities(),
});

const snakeSchema = createSchema({
	casing: "snake",
	entities: userNoteEntities(),
});

describe("buildDeleteSql with camel casing", () => {
	it("maps camelCase table name to camelCase physical table", () => {
		const id = DbId.init();
		const { text, params } = buildDeleteSql(camelSchema, { table: "userNotes", ids: [id] });
		expect(text).toBe('delete from "userNotes" where "id" = $1');
		expect(params).toEqual([id.toString()]);
	});

	it("builds multi-id delete with in clause", () => {
		const id1 = DbId.init();
		const id2 = DbId.init();
		const { text, params } = buildDeleteSql(camelSchema, { table: "userNotes", ids: [id1, id2] });
		expect(text).toBe('delete from "userNotes" where "id" in ($1, $2)');
		expect(params).toEqual([id1.toString(), id2.toString()]);
	});

	it("throws for empty ids", () => {
		expect(() => buildDeleteSql(camelSchema, { table: "userNotes", ids: [] })).toThrow(
			/delete ids are required/,
		);
	});

	it("throws for unknown table", () => {
		expect(() => buildDeleteSql(camelSchema, { table: "ghost", ids: [DbId.init()] })).toThrow(
			/Unknown table/,
		);
	});
});

describe("buildDeleteSql with snake casing", () => {
	it("maps camelCase table name to snake_case physical table", () => {
		const id = DbId.init();
		const { text, params } = buildDeleteSql(snakeSchema, { table: "userNotes", ids: [id] });
		expect(text).toBe('delete from "user_notes" where "id" = $1');
		expect(params).toEqual([id.toString()]);
	});
});

describe("normalizeDeleteAction", () => {
	it("normalizes single delete id", () => {
		const id = DbId.init();
		const op = normalizeDeleteAction(camelSchema, { table: "userNotes", action: "delete", id }, 0);
		expect(op.action).toBe("delete");
		expect(op.ids).toEqual([id]);
		expect(op.id).toEqual(id);
		expect(op.table).toBe("userNotes");
	});

	it("normalizes delete id array", () => {
		const id1 = DbId.init();
		const id2 = DbId.init();
		const op = normalizeDeleteAction(
			camelSchema,
			{ table: "userNotes", action: "delete", id: [id1, id2] },
			0,
		);
		expect(op.ids).toEqual([id1, id2]);
		expect(op.id).toBeUndefined();
	});

	it("rejects empty delete id array", () => {
		expect(() =>
			normalizeDeleteAction(camelSchema, { table: "userNotes", action: "delete", id: [] }, 0),
		).toThrow(/delete id array must not be empty/);
	});
});
