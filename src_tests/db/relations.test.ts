import { describe, expect, it } from "bun:test";
import { finalizeRelationInput, pointsTo, resolvesToMany } from "../../src/db/relations";

describe("relation builders", () => {
	it("pointsTo throws when finalized without .references()", () => {
		expect(() => finalizeRelationInput(pointsTo("users").where("userId"))).toThrow(
			/relation requires .references/,
		);
	});

	it("pointsTo accepts custom references", () => {
		expect(pointsTo("users").where("userId").references("legacyKey")).toEqual({
			kind: "pointsTo",
			table: "users",
			field: "userId",
			references: "legacyKey",
		});
	});

	it("resolvesToMany throws when finalized without .references()", () => {
		expect(() => finalizeRelationInput(resolvesToMany("notes").where("userId"))).toThrow(
			/relation requires .references/,
		);
	});

	it("resolvesToMany accepts custom references", () => {
		expect(resolvesToMany("notes").where("userId").references("legacyKey")).toEqual({
			kind: "resolvesToMany",
			table: "notes",
			field: "userId",
			references: "legacyKey",
		});
	});
});
