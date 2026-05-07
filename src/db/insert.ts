import { TromError } from "../errors";
import type { SchemaWithDefaultPermissions, TromSchema } from "../schema";
import { copyRecord, hasOwn } from "../utilities/records";
import { isRecord, type JsonRecord } from "../utilities/type-guards";
import { DbId } from "./dbid";
import {
	assertActionId,
	assertActionTable,
	assertNoCallerTimestamp,
	assertPayload,
	type DbActionPayload,
	type DbOperationBase,
} from "./mutation-utils";
import { quoteDbColumn, quoteDbTable } from "./quote-ident";
import { createSqlParams } from "./sql-params";

export type DbInsertAction = {
	table: string;
	action: "insert";
	payload: DbActionPayload;
};

export type DbInsertOperationContext = DbOperationBase & {
	action: "insert";
	id: DbId;
	payload: DbActionPayload;
	writePayload?: DbActionPayload;
};

export function normalizeInsertAction<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	action: unknown,
	index: number,
): DbInsertOperationContext {
	if (!isRecord(action)) {
		throw new TromError("DB action must be an object");
	}
	if (action.action !== "insert") {
		throw new TromError("DB action must be insert, update, or delete");
	}

	const table = assertActionTable(schema, action.table);
	const payload = assertPayload(action.payload, "insert payload must be an object");
	assertNoCallerTimestamp(payload);
	if (!hasOwn(payload, "id")) {
		throw new TromError("insert payload must include id");
	}
	const id = assertActionId(payload.id, "insert payload id");
	const copiedPayload = copyRecord(payload);
	return {
		index,
		table,
		action: "insert",
		id,
		payload: copiedPayload,
	};
}

export function buildInsertSql<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	input: { table: string; payload: JsonRecord },
): { text: string; params: unknown[] } {
	assertActionTable(schema, input.table);
	const columns = Object.keys(input.payload).sort();
	if (columns.length === 0) {
		throw new TromError("insert payload must not be empty");
	}
	const binder = createSqlParams();
	const quotedColumns = columns.map((col) => quoteDbColumn(schema, col)).join(", ");
	const placeholders = columns.map((col) => binder.add(input.payload[col])).join(", ");
	const text = `insert into ${quoteDbTable(schema, input.table)} (${quotedColumns}) values (${placeholders})`;
	return { text, params: binder.params };
}
