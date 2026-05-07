import { describe, expect, it } from "bun:test";
import { createDb } from "../../src/db/db";
import { createSchema } from "../../src/schema";
import { AuthError } from "../../src/errors";

const schema = createSchema({ entities: {} });

describe("doMutations", () => {
	it("throws TromError when called outside withSession", async () => {
		const db = createDb(schema);
		await expect(db.doMutations([])).rejects.toBeInstanceOf(AuthError);
	});
});

describe("select", () => {
	it("throws AuthError when called outside withSession", async () => {
		const db = createDb(schema);
		await expect(db.select({ table: "anything" })).rejects.toBeInstanceOf(AuthError);
	});
});
