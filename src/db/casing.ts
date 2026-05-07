import type { SchemaCasing, TromSchema } from "../schema";

export function toDbIdent(logical: string, casing: SchemaCasing): string {
	if (casing === "camel") {
		return logical;
	}
	return logical
		.replace(/([A-Z])/g, "_$1")
		.replace(/^_/, "")
		.toLowerCase();
}

export function schemaCasing(schema: TromSchema): SchemaCasing {
	return schema.casing ?? "camel";
}

export function dbTable(schema: TromSchema, logicalTable: string): string {
	return toDbIdent(logicalTable, schemaCasing(schema));
}

export function dbColumn(schema: TromSchema, logicalColumn: string): string {
	return toDbIdent(logicalColumn, schemaCasing(schema));
}
