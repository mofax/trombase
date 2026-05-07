import { TromError } from "../errors";

export type PointsToRelation = {
	readonly kind: "pointsTo";
	readonly table: string;
	readonly field: string;
	readonly references: string;
};

export type ResolvesToManyRelation = {
	readonly kind: "resolvesToMany";
	readonly table: string;
	readonly field: string;
	readonly references: string;
};

export type EntityRelation = PointsToRelation | ResolvesToManyRelation;

export type EntityRelations = Record<string, EntityRelation>;

export type RelationPending = {
	readonly __pending: true;
	readonly __kind: "pointsTo" | "resolvesToMany";
	readonly __table: string;
	readonly __field: string;
	references(column: string): EntityRelation;
};

export type RelationInput = EntityRelation | RelationPending;

function finalizePointsTo(table: string, field: string, references: string): PointsToRelation {
	return { kind: "pointsTo", table, field, references };
}

function finalizeResolvesToMany(
	table: string,
	field: string,
	references: string,
): ResolvesToManyRelation {
	return { kind: "resolvesToMany", table, field, references };
}

function pendingRelation(
	kind: RelationPending["__kind"],
	table: string,
	field: string,
	build: (references: string) => EntityRelation,
): RelationPending {
	return {
		__pending: true,
		__kind: kind,
		__table: table,
		__field: field,
		references(column: string): EntityRelation {
			return build(column);
		},
	};
}

type PointsToPending = {
	where<const F extends string>(column: F): RelationPending;
};

type ResolvesToManyPending = {
	where<const F extends string>(column: F): RelationPending;
};

function isRelationPending(value: RelationInput): value is RelationPending {
	return (
		typeof value === "object" &&
		value !== null &&
		"__pending" in value &&
		(value as RelationPending).__pending === true
	);
}

export function finalizeRelationInput(value: RelationInput): EntityRelation {
	if (isRelationPending(value)) {
		throw new TromError("relation requires .references(...)");
	}
	return value;
}

export { isRelationPending };

export function finalizeRelationMap(
	relations: Record<string, RelationInput> | undefined,
): EntityRelations | undefined {
	if (!relations) {
		return undefined;
	}
	const out: EntityRelations = {};
	for (const [name, value] of Object.entries(relations)) {
		out[name] = finalizeRelationInput(value);
	}
	return out;
}

export function pointsTo<const T extends string>(table: T): PointsToPending {
	return {
		where<const F extends string>(column: F): RelationPending {
			return pendingRelation("pointsTo", table, column, (references) =>
				finalizePointsTo(table, column, references),
			);
		},
	};
}

export function resolvesToMany<const T extends string>(table: T): ResolvesToManyPending {
	return {
		where<const F extends string>(column: F): RelationPending {
			return pendingRelation("resolvesToMany", table, column, (references) =>
				finalizeResolvesToMany(table, column, references),
			);
		},
	};
}
