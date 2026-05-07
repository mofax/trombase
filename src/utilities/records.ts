import type { JsonRecord } from "./type-guards";

export function hasOwn(record: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(record, key);
}

export function copyRecord(record: JsonRecord): JsonRecord {
	return Object.assign({}, record);
}

export function assignRecord(record: JsonRecord, values: JsonRecord): JsonRecord {
	return Object.assign({}, record, values);
}
