import { TromError } from "../errors";
import type { TromSchema } from "../schema";
import { dbColumn, dbTable } from "./casing";

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function quoteIdent(name: string): string {
	if (!IDENT_RE.test(name)) {
		throw new TromError(`invalid identifier: ${name}`);
	}
	return `"${name}"`;
}

export function quoteDbTable<Schema extends TromSchema>(
	schema: Schema,
	logicalTable: string,
): string {
	return quoteIdent(dbTable(schema, logicalTable));
}

export function quoteDbColumn<Schema extends TromSchema>(
	schema: Schema,
	logicalColumn: string,
): string {
	return quoteIdent(dbColumn(schema, logicalColumn));
}

export function quoteLogicalColumn(logicalColumn: string): string {
	return quoteIdent(logicalColumn);
}
