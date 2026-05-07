import { toDbIdent } from "../../src/db/casing";
import {
	createSchema,
	entity,
	field,
	pointsTo,
	PermissionError,
	resolvesToMany,
} from "../../src/main";

export const schema = createSchema({
	casing: "snake",
	entities: {
		users: entity("users", {
			fields: {
				email: field.string(),
			},
			relations: {
				notes: resolvesToMany("notes").where("userId").references("id"),
			},
			permissions: {
				read: async () => null,
			},
		}),
		notes: entity("notes", {
			fields: {
				title: field.string(),
				content: field.string(),
				userId: field.dbId().immutable(),
			},
			relations: {
				author: pointsTo("users").where("userId").references("id"),
			},
			permissions: {
				read: async () => null,
				create: async (session, sql, operation) => {
					if (operation?.action !== "insert") {
						return new PermissionError("Invalid operation");
					}
					if (operation.payload.userId === session.userId) {
						return null;
					}
					return new PermissionError("Cannot create note for another user");
				},
				update: async (session, sql, operation) => {
					if (operation?.action !== "update") {
						return new PermissionError("Invalid operation");
					}
					const rows = await sql`
						SELECT ${sql(toDbIdent("userId", "snake"))} AS "userId"
						FROM notes
						WHERE id = ${operation.id.toString()}
					`;
					if (rows[0]?.userId === session.userId) {
						return null;
					}
					return new PermissionError("Cannot update another user's note");
				},
				delete: async (session, sql, operation) => {
					if (operation?.action !== "delete") {
						return new PermissionError("Invalid operation");
					}
					for (const id of operation.ids) {
						const rows = await sql`
							SELECT ${sql(toDbIdent("userId", "snake"))} AS "userId"
							FROM notes
							WHERE id = ${id.toString()}
						`;
						if (rows[0]?.userId !== session.userId) {
							return new PermissionError("Cannot delete another user's note");
						}
					}
					return null;
				},
			},
		}),
	},
});
