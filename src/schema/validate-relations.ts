import type {
	EntityRelation,
	PointsToRelation,
	RelationInput,
	ResolvesToManyRelation,
} from "../db/relations";
import { isRelationPending } from "../db/relations";
import { TromError } from "../errors";
import type { TromSchema } from "../schema";

const AUTO_COLUMNS: readonly string[] = ["id", "createdAt", "updatedAt"];

type EntityFieldKeys<
	S extends TromSchema,
	E extends keyof S["entities"],
> = keyof S["entities"][E]["fields"];

type AutoColumn = "id" | "createdAt" | "updatedAt";

type KnownColumn<S extends TromSchema, E extends keyof S["entities"]> =
	| EntityFieldKeys<S, E>
	| AutoColumn;

type InvalidPointsToWhere<Column extends string, Entity extends string> = {
	readonly __error: `where column '${Column}' is not declared on entity '${Entity}'`;
};

type InvalidResolvesToManyWhere<Column extends string, Target extends string> = {
	readonly __error: `where column '${Column}' is not declared on entity '${Target}'`;
};

type InvalidPointsToReferences<Column extends string, Target extends string> = {
	readonly __error: `references column '${Column}' is not declared on entity '${Target}'`;
};

type InvalidResolvesToManyReferences<Column extends string, Entity extends string> = {
	readonly __error: `references column '${Column}' is not declared on entity '${Entity}'`;
};

type ValidateRelationInput<
	S extends TromSchema,
	Entity extends keyof S["entities"],
	Relation extends EntityRelation,
> = Relation extends PointsToRelation
	? Relation["table"] extends keyof S["entities"]
		? Relation["field"] extends EntityFieldKeys<S, Entity>
			? Relation["references"] extends KnownColumn<S, Relation["table"]>
				? Relation
				: InvalidPointsToReferences<Relation["references"] & string, Relation["table"] & string>
			: InvalidPointsToWhere<Relation["field"] & string, Entity & string>
		: Relation
	: Relation extends ResolvesToManyRelation
		? Relation["table"] extends keyof S["entities"]
			? Relation["field"] extends EntityFieldKeys<S, Relation["table"]>
				? Relation["references"] extends KnownColumn<S, Entity>
					? Relation
					: InvalidResolvesToManyReferences<Relation["references"] & string, Entity & string>
				: InvalidResolvesToManyWhere<Relation["field"] & string, Relation["table"] & string>
			: Relation
		: Relation;

type EntityRelationsOf<S extends TromSchema, Entity extends keyof S["entities"]> = NonNullable<
	S["entities"][Entity]["relations"]
>;

type ValidateEntityRelations<S extends TromSchema, Entity extends keyof S["entities"]> = {
	[K in keyof EntityRelationsOf<S, Entity>]: ValidateRelationInput<
		S,
		Entity,
		EntityRelationsOf<S, Entity>[K]
	>;
};

export type ValidateResolvesToManyWhere<S extends TromSchema> = {
	entities: {
		[E in keyof S["entities"]]: Omit<S["entities"][E], "relations"> & {
			relations?: ValidateEntityRelations<S, E>;
		};
	};
};

function entityColumnNames(entity: TromSchema["entities"][string]): string[] {
	const names: string[] = [];
	for (const col of AUTO_COLUMNS) {
		names.push(col);
	}
	for (const key of Object.keys(entity.fields)) {
		names.push(key);
	}
	return names;
}

function assertColumnExists(
	entityName: string,
	relationName: string,
	column: string,
	known: string[],
	role: "where" | "references",
	side: string,
): void {
	if (known.includes(column)) {
		return;
	}
	throw new TromError(
		`entity '${entityName}' relation '${relationName}': unknown ${role} column '${column}' on ${side}`,
	);
}

export function assertValidRelations(schema: TromSchema): void {
	for (const [entityName, entity] of Object.entries(schema.entities)) {
		const relations = entity.relations;
		if (!relations) {
			continue;
		}
		const definingColumns = entityColumnNames(entity);
		for (const [relationName, relationRaw] of Object.entries(relations)) {
			if (isRelationPending(relationRaw as RelationInput)) {
				throw new TromError(
					`entity '${entityName}' relation '${relationName}': missing .references(...)`,
				);
			}
			const relation = relationRaw as EntityRelation;
			if (relation.kind === "pointsTo") {
				const target = schema.entities[relation.table];
				if (!target) {
					throw new TromError(
						`entity '${entityName}' relation '${relationName}': unknown target table '${relation.table}'`,
					);
				}
				assertColumnExists(
					entityName,
					relationName,
					relation.field,
					definingColumns,
					"where",
					"this entity",
				);
				const targetColumns = entityColumnNames(target);
				assertColumnExists(
					entityName,
					relationName,
					relation.references,
					targetColumns,
					"references",
					`target entity '${relation.table}'`,
				);
				continue;
			}
			if (relation.kind === "resolvesToMany") {
				const target = schema.entities[relation.table];
				if (!target) {
					throw new TromError(
						`entity '${entityName}' relation '${relationName}': unknown target table '${relation.table}'`,
					);
				}
				const targetColumns = entityColumnNames(target);
				assertColumnExists(
					entityName,
					relationName,
					relation.field,
					targetColumns,
					"where",
					`target entity '${relation.table}'`,
				);
				assertColumnExists(
					entityName,
					relationName,
					relation.references,
					definingColumns,
					"references",
					"this entity",
				);
				continue;
			}
			throw new TromError(
				`entity '${entityName}' relation '${relationName}': unknown relation kind`,
			);
		}
	}
}
