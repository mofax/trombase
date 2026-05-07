import { entity } from "../../../src/schema";
import { field } from "../../../src/db/fields";

/** Notes entity with camelCase fields that map differently under snake casing. */
export function noteEntities() {
	return {
		notes: entity("notes", {
			fields: {
				title: field.string(),
				userId: field.dbId().immutable(),
				sortOrder: field.number(),
			},
		}),
	};
}

/** Entity key is camelCase so table name casing is exercised too. */
export function userNoteEntities() {
	return {
		userNotes: entity("userNotes", {
			fields: {
				title: field.string(),
				userId: field.dbId().immutable(),
			},
		}),
	};
}
