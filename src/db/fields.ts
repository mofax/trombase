export type FieldKind = "string" | "number" | "boolean" | "date" | "dbId" | "json";

export type FieldSpec<T = unknown> = {
	readonly kind: FieldKind;
	readonly nullable: boolean;
	readonly immutable: boolean;
	readonly __t?: T;
};

export type FieldBuilder<T> = FieldSpec<T> & {
	nullable(): FieldBuilder<T | null>;
	immutable(): FieldBuilder<T>;
};

function build<T>(kind: FieldKind, nullable: boolean, immutable: boolean): FieldBuilder<T> {
	const spec: FieldSpec<T> = { kind, nullable, immutable };
	const builder = Object.assign({}, spec, {
		nullable(): FieldBuilder<T | null> {
			return build<T | null>(kind, true, immutable);
		},
		immutable(): FieldBuilder<T> {
			return build<T>(kind, nullable, true);
		},
	});
	return builder;
}

export const field = {
	string: () => build<string>("string", false, false),
	number: () => build<number>("number", false, false),
	boolean: () => build<boolean>("boolean", false, false),
	date: () => build<Date>("date", false, false),
	dbId: () => build<string>("dbId", false, false),
	json: <T = unknown>() => build<T>("json", false, false),
};

export function isFieldSpec(value: unknown): value is FieldSpec {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.kind === "string" &&
		typeof candidate.nullable === "boolean" &&
		typeof candidate.immutable === "boolean"
	);
}
