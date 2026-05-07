import { describe, expect, it } from "bun:test";
import { createSchema, entity } from "../../src/schema";
import { field } from "../../src/db/fields";
import { pointsTo, resolvesToMany } from "../../src/db/relations";
import { buildSelectSql } from "../../src/db/select";
import { DbId } from "../../src/db/dbid";
import { noteEntities } from "./fixtures/test-entities";

function notesUsersEntities() {
	const notes = noteEntities().notes;
	return {
		users: entity("users", {
			fields: {
				email: field.string(),
			},
			relations: {
				notes: resolvesToMany("notes").where("userId").references("id"),
			},
		}),
		notes: Object.assign({}, notes, {
			fields: Object.assign({}, notes.fields, {
				content: field.string(),
			}),
			relations: {
				author: pointsTo("users").where("userId").references("id"),
			},
		}),
	};
}

const camelSchema = createSchema({
	casing: "camel",
	entities: notesUsersEntities(),
});

const snakeSchema = createSchema({
	casing: "snake",
	entities: notesUsersEntities(),
});

describe("buildSelectSql with camel casing", () => {
	it("builds a scalar select with default columns", () => {
		const { text, params } = buildSelectSql(camelSchema, { table: "notes" });
		expect(text).toBe(
			'select t0."id" as "id", t0."createdAt" as "createdAt", t0."updatedAt" as "updatedAt", ' +
				't0."title" as "title", t0."userId" as "userId", t0."sortOrder" as "sortOrder", t0."content" as "content" ' +
				'from "notes" t0',
		);
		expect(params).toEqual([]);
	});

	it("filters with a bare value (eq) and serializes DbId", () => {
		const id = DbId.init();
		const { text, params } = buildSelectSql(camelSchema, {
			table: "notes",
			columns: ["id", "title"],
			where: { userId: id },
		});
		expect(text).toBe(
			'select t0."id" as "id", t0."title" as "title" from "notes" t0 where t0."userId" = $1',
		);
		expect(params).toEqual([id.toString()]);
	});

	it("supports each where operator", () => {
		const { text, params } = buildSelectSql(camelSchema, {
			table: "notes",
			columns: ["id"],
			where: {
				title: { like: "%hi%" },
				createdAt: { gte: "2026-01-01" },
				content: { in: ["a", "b"] },
				userId: { isNull: true },
			},
		});
		expect(text).toBe(
			'select t0."id" as "id" from "notes" t0 where t0."title" like $1 and t0."createdAt" >= $2 and t0."content" in ($3, $4) and t0."userId" is null',
		);
		expect(params).toEqual(["%hi%", "2026-01-01", "a", "b"]);
	});

	it("embeds pointsTo as a json_build_object subquery", () => {
		const { text } = buildSelectSql(camelSchema, {
			table: "notes",
			columns: ["id", "title"],
			with: { author: true },
		});
		expect(text).toBe(
			'select t0."id" as "id", t0."title" as "title", ' +
				'(select json_build_object(\'id\', t1."id", \'createdAt\', t1."createdAt", \'updatedAt\', t1."updatedAt", \'email\', t1."email") from "users" t1 where t1."id" = t0."userId" limit 1) as "author" ' +
				'from "notes" t0',
		);
	});

	it("embeds resolvesToMany as a json_agg subquery with inner limit/order", () => {
		const { text, params } = buildSelectSql(camelSchema, {
			table: "users",
			columns: ["id", "email"],
			with: {
				notes: {
					table: "notes",
					columns: ["id", "title"],
					orderBy: [{ field: "createdAt", direction: "desc" }],
					limit: 10,
				},
			},
		});
		expect(text).toBe(
			'select t0."id" as "id", t0."email" as "email", ' +
				'(select coalesce(json_agg(json_build_object(\'id\', t1."id", \'title\', t1."title") order by t1."createdAt" desc), \'[]\'::json) from (select * from "notes" t2 where t2."userId" = t0."id" order by t2."createdAt" desc limit $1) t1) as "notes" ' +
				'from "users" t0',
		);
		expect(params).toEqual([10]);
	});

	it("builds nested with two levels deep", () => {
		const { text } = buildSelectSql(camelSchema, {
			table: "users",
			columns: ["id"],
			with: {
				notes: {
					table: "notes",
					columns: ["id", "title"],
					with: { author: true },
				},
			},
		});
		expect(text).toBe(
			'select t0."id" as "id", ' +
				'(select coalesce(json_agg(json_build_object(\'id\', t1."id", \'title\', t1."title", \'author\', (select json_build_object(\'id\', t3."id", \'createdAt\', t3."createdAt", \'updatedAt\', t3."updatedAt", \'email\', t3."email") from "users" t3 where t3."id" = t1."userId" limit 1))), \'[]\'::json) from (select * from "notes" t2 where t2."userId" = t0."id") t1) as "notes" ' +
				'from "users" t0',
		);
	});

	it("renders count(*) aggregate", () => {
		const { text, params } = buildSelectSql(camelSchema, {
			table: "notes",
			columns: [],
			aggregates: { total: { fn: "count" } },
		});
		expect(text).toBe('select count(*)::bigint as "total" from "notes" t0');
		expect(params).toEqual([]);
	});

	it("renders count distinct on a column", () => {
		const { text } = buildSelectSql(camelSchema, {
			table: "notes",
			columns: [],
			aggregates: { authors: { fn: "count", field: "userId", distinct: true } },
		});
		expect(text).toBe('select count(distinct t0."userId")::bigint as "authors" from "notes" t0');
	});

	it("emits group by with quoted identifiers", () => {
		const { text, params } = buildSelectSql(camelSchema, {
			table: "notes",
			columns: ["userId"],
			groupBy: ["userId"],
			aggregates: { count: { fn: "count" } },
			orderBy: [{ field: "count", direction: "desc" }],
			limit: 10,
		});
		expect(text).toBe(
			'select t0."userId" as "userId", count(*)::bigint as "count" from "notes" t0 group by t0."userId" order by "count" desc limit $1',
		);
		expect(params).toEqual([10]);
	});

	it("filters with where and pointsTo together", () => {
		const id = DbId.init();
		const { text, params } = buildSelectSql(camelSchema, {
			table: "notes",
			columns: ["id"],
			where: { userId: id },
			with: { author: true },
		});
		expect(text).toBe(
			'select t0."id" as "id", ' +
				'(select json_build_object(\'id\', t1."id", \'createdAt\', t1."createdAt", \'updatedAt\', t1."updatedAt", \'email\', t1."email") from "users" t1 where t1."id" = t0."userId" limit 1) as "author" ' +
				'from "notes" t0 where t0."userId" = $1',
		);
		expect(params).toEqual([id.toString()]);
	});
});

describe("buildSelectSql with snake casing", () => {
	it("builds a scalar select with default columns", () => {
		const { text, params } = buildSelectSql(snakeSchema, { table: "notes" });
		expect(text).toBe(
			'select t0."id" as "id", t0."created_at" as "createdAt", t0."updated_at" as "updatedAt", ' +
				't0."title" as "title", t0."user_id" as "userId", t0."sort_order" as "sortOrder", t0."content" as "content" ' +
				'from "notes" t0',
		);
		expect(params).toEqual([]);
	});

	it("filters with a bare value (eq) and serializes DbId", () => {
		const id = DbId.init();
		const { text, params } = buildSelectSql(snakeSchema, {
			table: "notes",
			columns: ["id", "title"],
			where: { userId: id },
		});
		expect(text).toBe(
			'select t0."id" as "id", t0."title" as "title" from "notes" t0 where t0."user_id" = $1',
		);
		expect(params).toEqual([id.toString()]);
	});

	it("supports each where operator", () => {
		const { text, params } = buildSelectSql(snakeSchema, {
			table: "notes",
			columns: ["id"],
			where: {
				title: { like: "%hi%" },
				createdAt: { gte: "2026-01-01" },
				content: { in: ["a", "b"] },
				userId: { isNull: true },
			},
		});
		expect(text).toBe(
			'select t0."id" as "id" from "notes" t0 where t0."title" like $1 and t0."created_at" >= $2 and t0."content" in ($3, $4) and t0."user_id" is null',
		);
		expect(params).toEqual(["%hi%", "2026-01-01", "a", "b"]);
	});

	it("embeds pointsTo as a json_build_object subquery", () => {
		const { text } = buildSelectSql(snakeSchema, {
			table: "notes",
			columns: ["id", "title"],
			with: { author: true },
		});
		expect(text).toBe(
			'select t0."id" as "id", t0."title" as "title", ' +
				'(select json_build_object(\'id\', t1."id", \'createdAt\', t1."created_at", \'updatedAt\', t1."updated_at", \'email\', t1."email") from "users" t1 where t1."id" = t0."user_id" limit 1) as "author" ' +
				'from "notes" t0',
		);
	});

	it("embeds resolvesToMany as a json_agg subquery with inner limit/order", () => {
		const { text, params } = buildSelectSql(snakeSchema, {
			table: "users",
			columns: ["id", "email"],
			with: {
				notes: {
					table: "notes",
					columns: ["id", "title"],
					orderBy: [{ field: "createdAt", direction: "desc" }],
					limit: 10,
				},
			},
		});
		expect(text).toBe(
			'select t0."id" as "id", t0."email" as "email", ' +
				'(select coalesce(json_agg(json_build_object(\'id\', t1."id", \'title\', t1."title") order by t1."created_at" desc), \'[]\'::json) from (select * from "notes" t2 where t2."user_id" = t0."id" order by t2."created_at" desc limit $1) t1) as "notes" ' +
				'from "users" t0',
		);
		expect(params).toEqual([10]);
	});

	it("filters with where and pointsTo together", () => {
		const id = DbId.init();
		const { text, params } = buildSelectSql(snakeSchema, {
			table: "notes",
			columns: ["id"],
			where: { userId: id },
			with: { author: true },
		});
		expect(text).toBe(
			'select t0."id" as "id", ' +
				'(select json_build_object(\'id\', t1."id", \'createdAt\', t1."created_at", \'updatedAt\', t1."updated_at", \'email\', t1."email") from "users" t1 where t1."id" = t0."user_id" limit 1) as "author" ' +
				'from "notes" t0 where t0."user_id" = $1',
		);
		expect(params).toEqual([id.toString()]);
	});
});

describe("buildSelectSql validation", () => {
	it("rejects unknown table", () => {
		expect(() => buildSelectSql(camelSchema, { table: "does_not_exist" })).toThrow(/unknown table/);
	});

	it("rejects unknown relation in with", () => {
		expect(() => buildSelectSql(camelSchema, { table: "notes", with: { ghost: true } })).toThrow(
			/unknown relation/,
		);
	});

	it("rejects unknown column in where", () => {
		expect(() => buildSelectSql(camelSchema, { table: "notes", where: { ghost: 1 } })).toThrow(
			/unknown where column/,
		);
	});

	it("rejects unknown column in columns", () => {
		expect(() => buildSelectSql(camelSchema, { table: "notes", columns: ["ghost"] })).toThrow(
			/unknown column/,
		);
	});

	it("rejects aggregates combined with with on the same node", () => {
		expect(() =>
			buildSelectSql(camelSchema, {
				table: "notes",
				with: { author: true },
				aggregates: { total: { fn: "count" } },
			}),
		).toThrow(/aggregates and with/);
	});

	it("rejects groupBy entries not in columns", () => {
		expect(() =>
			buildSelectSql(camelSchema, {
				table: "notes",
				columns: ["title"],
				groupBy: ["userId"],
				aggregates: { total: { fn: "count" } },
			}),
		).toThrow(/groupBy column/);
	});

	it("rejects aggregates inside with", () => {
		expect(() =>
			buildSelectSql(camelSchema, {
				table: "users",
				with: {
					notes: {
						table: "notes",
						aggregates: { total: { fn: "count" } },
					},
				},
			}),
		).toThrow(/aggregates inside 'with'/);
	});
});
