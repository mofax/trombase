import { describe, expect, it } from "bun:test";
import { createSchema } from "../../src/schema";
import { dbColumn, dbTable, toDbIdent } from "../../src/db/casing";

describe("toDbIdent", () => {
	it("returns logical name unchanged for camel", () => {
		expect(toDbIdent("userId", "camel")).toBe("userId");
		expect(toDbIdent("createdAt", "camel")).toBe("createdAt");
		expect(toDbIdent("id", "camel")).toBe("id");
	});

	it("converts camelCase to snake_case", () => {
		expect(toDbIdent("userId", "snake")).toBe("user_id");
		expect(toDbIdent("createdAt", "snake")).toBe("created_at");
		expect(toDbIdent("id", "snake")).toBe("id");
		expect(toDbIdent("notes", "snake")).toBe("notes");
		expect(toDbIdent("userNotes", "snake")).toBe("user_notes");
	});
});

describe("schema helpers", () => {
	const snakeSchema = createSchema({
		casing: "snake",
		entities: {},
	});

	it("dbTable and dbColumn use schema casing", () => {
		expect(dbTable(snakeSchema, "userNotes")).toBe("user_notes");
		expect(dbColumn(snakeSchema, "userId")).toBe("user_id");
	});

	it("defaults to camel when casing is omitted", () => {
		const schema = createSchema({ entities: {} });
		expect(dbColumn(schema, "userId")).toBe("userId");
	});
});
