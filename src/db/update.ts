import { TromError } from "../errors";
import type { SchemaWithDefaultPermissions, TromSchema } from "../schema";
import { copyRecord } from "../utilities/records";
import { isRecord, type JsonRecord } from "../utilities/type-guards";
import { DbId } from "./dbid";
import {
	assertActionId,
	assertActionTable,
	assertNoCallerTimestamp,
	assertPayload,
	assertPayloadHasKeys,
	type DbActionPayload,
	type DbOperationBase,
} from "./mutation-utils";
import { quoteDbColumn, quoteDbTable } from "./quote-ident";
import { createSqlParams } from "./sql-params";

const IMMUTABLE_UPDATE_FIELDS = ["id", "createdAt"];

export type DbUpdateAction = {
	table: string;
	action: "update";
	id: DbId;
	payload: DbActionPayload;
};

export type DbUpdateOperationContext = DbOperationBase & {
	action: "update";
	id: DbId;
	payload: DbActionPayload;
	writePayload?: DbActionPayload;
};

export function normalizeUpdateAction<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	action: unknown,
	index: number,
): DbUpdateOperationContext {
	if (!isRecord(action)) {
		throw new TromError("DB action must be an object");
	}
	if (action.action !== "update") {
		throw new TromError("DB action must be insert, update, or delete");
	}

	const table = assertActionTable(schema, action.table);
	const id = assertActionId(action.id, "update id");
	const payload = assertPayload(action.payload, "update payload must be an object");
	assertNoCallerTimestamp(payload);
	assertPayloadHasKeys(payload, "update payload must not be empty");
	const copiedPayload = copyRecord(payload);
	return {
		index,
		table,
		action: "update",
		id,
		payload: copiedPayload,
	};
}

export function buildUpdateSql<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	input: { table: string; id: DbId; payload: JsonRecord },
): { text: string; params: unknown[] } {
	assertActionTable(schema, input.table);
	const columns = Object.keys(input.payload)
		.filter((col) => !IMMUTABLE_UPDATE_FIELDS.includes(col))
		.sort();
	if (columns.length === 0) {
		throw new TromError("update payload must not be empty");
	}
	const binder = createSqlParams();
	const setParts = columns.map(
		(col) => `${quoteDbColumn(schema, col)} = ${binder.add(input.payload[col])}`,
	);
	const idPlaceholder = binder.add(input.id);
	const text = `update ${quoteDbTable(schema, input.table)} set ${setParts.join(", ")} where ${quoteDbColumn(schema, "id")} = ${idPlaceholder}`;
	return { text, params: binder.params };
}
