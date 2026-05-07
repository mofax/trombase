import { describe, expect, it } from "bun:test";
import { field } from "../../src/db/fields";
import { pointsTo, resolvesToMany } from "../../src/db/relations";
import { createSchema, entity, type TromSchema } from "../../src/schema";
import { assertValidRelations } from "../../src/schema/validate-relations";

describe("assertValidRelations", () => {
	it("accepts a valid schema", () => {
		const schema = {
			entities: {
				users: entity("users", {
					fields: { email: field.string() },
					relations: {
						notes: resolvesToMany("notes").where("userId").references("id"),
					},
				}),
				notes: entity("notes", {
					fields: {
						title: field.string(),
						userId: field.dbId(),
					},
					relations: {
						author: pointsTo("users").where("userId").references("id"),
					},
				}),
			},
		};
		expect(() => assertValidRelations(schema)).not.toThrow();
	});

	it("rejects pointsTo without .references()", () => {
		const schema = {
			entities: {
				notes: {
					fields: { userId: field.dbId() },
					relations: {
						author: pointsTo("ghost").where("userId"),
					},
				},
			},
		};
		expect(() => assertValidRelations(schema as unknown as TromSchema)).toThrow(
			/missing .references/,
		);
	});

	it("rejects resolvesToMany without .references()", () => {
		const schema = {
			entities: {
				users: {
					fields: { email: field.string() },
					relations: {
						notes: resolvesToMany("notes").where("userId"),
					},
				},
			},
		};
		expect(() => assertValidRelations(schema as unknown as TromSchema)).toThrow(
			/missing .references/,
		);
	});

	it("rejects unknown target table", () => {
		const schema = {
			entities: {
				notes: entity("notes", {
					fields: { userId: field.dbId() },
					relations: {
						author: pointsTo("ghost").where("userId").references("id"),
					},
				}),
			},
		};
		expect(() => assertValidRelations(schema)).toThrow(/unknown target table 'ghost'/);
	});

	it("rejects pointsTo where column missing on this entity", () => {
		const schema = {
			entities: {
				notes: entity("notes", {
					fields: { title: field.string() },
					relations: {
						author: pointsTo("users").where("userId").references("id"),
					},
				}),
				users: entity("users", {
					fields: { email: field.string() },
				}),
			},
		};
		expect(() => assertValidRelations(schema)).toThrow(/unknown where column 'userId'/);
	});

	it("rejects resolvesToMany where column missing on target entity", () => {
		const schema = {
			entities: {
				users: entity("users", {
					fields: { email: field.string() },
					relations: {
						notes: resolvesToMany("notes").where("userId").references("id"),
					},
				}),
				notes: entity("notes", {
					fields: { title: field.string() },
				}),
			},
		};
		expect(() => assertValidRelations(schema)).toThrow(/unknown where column 'userId'/);
	});

	it("rejects pointsTo references column missing on target entity", () => {
		const schema = {
			entities: {
				notes: entity("notes", {
					fields: { userId: field.dbId() },
					relations: {
						author: pointsTo("users").where("userId").references("legacyKey"),
					},
				}),
				users: entity("users", {
					fields: { email: field.string() },
				}),
			},
		};
		expect(() => assertValidRelations(schema)).toThrow(/unknown references column 'legacyKey'/);
	});

	it("rejects resolvesToMany references column missing on this entity", () => {
		const schema = {
			entities: {
				users: entity("users", {
					fields: { email: field.string() },
					relations: {
						notes: resolvesToMany("notes").where("title").references("legacyKey"),
					},
				}),
				notes: entity("notes", {
					fields: { title: field.string() },
				}),
			},
		};
		expect(() => assertValidRelations(schema)).toThrow(/unknown references column 'legacyKey'/);
	});
});

describe("createSchema runtime validation", () => {
	it("throws when relations are invalid", () => {
		expect(() =>
			createSchema({
				entities: {
					notes: entity("notes", {
						fields: { title: field.string() },
						relations: {
							author: pointsTo("users").where("userId").references("id"),
						},
					}),
				},
			}),
		).toThrow(/unknown target table 'users'/);
	});
});
