import { TromError } from "../errors";
import type { SchemaWithDefaultPermissions, TromSchema } from "../schema";
import { isRecord } from "../utilities/type-guards";
import { DbId } from "./dbid";
import { assertActionTable, assertDeleteIds } from "./mutation-utils";
import type { DbOperationBase } from "./mutation-utils";
import { quoteDbColumn, quoteDbTable } from "./quote-ident";
import { createSqlParams } from "./sql-params";

export type DbDeleteAction = {
	table: string;
	action: "delete";
	id: DbId | DbId[];
};

export type DbDeleteOperationContext = DbOperationBase & {
	action: "delete";
	id?: DbId;
	ids: DbId[];
};

export function normalizeDeleteAction<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	action: unknown,
	index: number,
): DbDeleteOperationContext {
	if (!isRecord(action)) {
		throw new TromError("DB action must be an object");
	}
	if (action.action !== "delete") {
		throw new TromError("DB action must be insert, update, or delete");
	}

	const table = assertActionTable(schema, action.table);
	const ids = assertDeleteIds(action.id);
	const normalized: DbDeleteOperationContext = {
		index,
		table,
		action: "delete",
		ids,
	};
	if (ids.length === 1) {
		normalized.id = ids[0];
	}
	return normalized;
}

export function buildDeleteSql<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	input: { table: string; ids: DbId[] },
): { text: string; params: unknown[] } {
	assertActionTable(schema, input.table);
	if (input.ids.length === 0) {
		throw new TromError("delete ids are required");
	}
	const binder = createSqlParams();
	const tableRef = quoteDbTable(schema, input.table);
	const idCol = quoteDbColumn(schema, "id");

	if (input.ids.length === 1) {
		const id = input.ids[0];
		if (id === undefined) {
			throw new TromError("delete id is required");
		}
		const placeholder = binder.add(id);
		const text = `delete from ${tableRef} where ${idCol} = ${placeholder}`;
		return { text, params: binder.params };
	}

	const placeholders = input.ids.map((id) => binder.add(id)).join(", ");
	const text = `delete from ${tableRef} where ${idCol} in (${placeholders})`;
	return { text, params: binder.params };
}
