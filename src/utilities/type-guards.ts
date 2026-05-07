export type JsonRecord = Record<string, unknown>;

function expectedMessage(name: string, expectation: string): string {
	return `${name} must be ${expectation}`;
}

export function isString(value: unknown): value is string {
	return typeof value === "string";
}

export function isNumber(value: unknown): value is number {
	return typeof value === "number";
}

export function isBoolean(value: unknown): value is boolean {
	return typeof value === "boolean";
}

export function isBigInt(value: unknown): value is bigint {
	return typeof value === "bigint";
}

export function isSymbol(value: unknown): value is symbol {
	return typeof value === "symbol";
}

export function isFunction(value: unknown): value is Function {
	return typeof value === "function";
}

export function isObject(value: unknown): value is object {
	return typeof value === "object" && value !== null;
}

export function isRecord(value: unknown): value is JsonRecord {
	return isObject(value) && !Array.isArray(value);
}

export function isDate(value: unknown): value is Date {
	return value instanceof Date;
}

export function isNull(value: unknown): value is null {
	return value === null;
}

export function isUndefined(value: unknown): value is undefined {
	return value === undefined;
}

export function guardString(value: unknown, name = "value"): string {
	if (!isString(value)) {
		throw new TypeError(expectedMessage(name, "a string"));
	}
	return value;
}

export function guardNumber(value: unknown, name = "value"): number {
	if (!isNumber(value)) {
		throw new TypeError(expectedMessage(name, "a number"));
	}
	return value;
}

export function guardBoolean(value: unknown, name = "value"): boolean {
	if (!isBoolean(value)) {
		throw new TypeError(expectedMessage(name, "a boolean"));
	}
	return value;
}

export function guardBigInt(value: unknown, name = "value"): bigint {
	if (!isBigInt(value)) {
		throw new TypeError(expectedMessage(name, "a bigint"));
	}
	return value;
}

export function guardSymbol(value: unknown, name = "value"): symbol {
	if (!isSymbol(value)) {
		throw new TypeError(expectedMessage(name, "a symbol"));
	}
	return value;
}

export function guardFunction(value: unknown, name = "value"): Function {
	if (!isFunction(value)) {
		throw new TypeError(expectedMessage(name, "a function"));
	}
	return value;
}

export function guardObject(value: unknown, name = "value"): object {
	if (!isObject(value)) {
		throw new TypeError(expectedMessage(name, "an object"));
	}
	return value;
}

export function guardRecord(value: unknown, name = "value"): JsonRecord {
	if (!isRecord(value)) {
		throw new TypeError(expectedMessage(name, "an object"));
	}
	return value;
}

export function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

export function guardArray(value: unknown, name = "value"): unknown[] {
	if (!isArray(value)) {
		throw new TypeError(expectedMessage(name, "an array"));
	}
	return value;
}

export function guardDate(value: unknown, name = "value"): Date {
	if (!isDate(value)) {
		throw new TypeError(expectedMessage(name, "a Date"));
	}
	return value;
}

export function guardNull(value: unknown, name = "value"): null {
	if (!isNull(value)) {
		throw new TypeError(expectedMessage(name, "null"));
	}
	return value;
}

export function guardUndefined(value: unknown, name = "value"): undefined {
	if (!isUndefined(value)) {
		throw new TypeError(expectedMessage(name, "undefined"));
	}
	return value;
}
