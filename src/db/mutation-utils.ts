import { TromError } from "../errors";
import type { SchemaWithDefaultPermissions, TromSchema } from "../schema";
import { hasOwn } from "../utilities/records";
import { isRecord, type JsonRecord } from "../utilities/type-guards";
import { DbId } from "./dbid";

export type DbActionPayload = JsonRecord;

export type DbOperationBase = {
	index: number;
	table: string;
};

export function assertPayload(value: unknown, message: string): DbActionPayload {
	if (!isRecord(value)) {
		throw new TromError(message);
	}
	return value;
}

export function assertNoCallerTimestamp(payload: DbActionPayload): void {
	if (hasOwn(payload, "createdAt") || hasOwn(payload, "updatedAt")) {
		throw new TromError("createdAt and updatedAt are handled internally");
	}
}

export function assertActionTable<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	table: unknown,
): string {
	if (typeof table !== "string" || !table) {
		throw new TromError("DB action table is required");
	}
	if (!schema.entities[table]) {
		throw new TromError(`Unknown table: ${table}`);
	}
	return table;
}

export function assertActionId(value: unknown, name: string): DbId {
	if (value instanceof DbId) {
		return value;
	}
	if (typeof value === "string") {
		return DbId.fromString(value);
	}
	throw new TromError(`${name} must be a DbId`);
}

export function assertDeleteIds(value: unknown): DbId[] {
	if (Array.isArray(value)) {
		if (value.length === 0) {
			throw new TromError("delete id array must not be empty");
		}
		return value.map((id) => assertActionId(id, "delete id"));
	}
	return [assertActionId(value, "delete id")];
}

export function assertPayloadHasKeys(payload: DbActionPayload, message: string): void {
	if (Object.keys(payload).length === 0) {
		throw new TromError(message);
	}
}
