import type { JsonRecord } from "../utilities/type-guards";
import { DbId } from "./dbid";

export function serializeValue(value: unknown): unknown {
	if (value instanceof DbId) {
		return value.toString();
	}
	return value;
}

export function serializePayload(payload: JsonRecord): JsonRecord {
	return Object.fromEntries(
		Object.entries(payload).map(([key, value]) => [key, serializeValue(value)]),
	);
}
