import type { FieldSpec } from "../db/fields";
import type { EntityRelation, PointsToRelation, ResolvesToManyRelation } from "../db/relations";
import type { PermissionMap } from "../schema.ts";

type InvalidPointsToWhere<Column extends string> = {
	readonly __error: `where column '${Column}' is not declared on this entity`;
};

type ValidateEntityRelations<
	Fields extends Record<string, FieldSpec>,
	Relations extends Record<string, EntityRelation>,
> = {
	[K in keyof Relations]: Relations[K] extends PointsToRelation
		? Relations[K]["field"] extends keyof Fields
			? Relations[K]
			: InvalidPointsToWhere<Relations[K]["field"] & string>
		: Relations[K] extends ResolvesToManyRelation
			? Relations[K]
			: Relations[K];
};

export function entity<
	const E extends string,
	const Fields extends Record<string, FieldSpec>,
	const Relations extends Record<string, EntityRelation>,
>(
	_name: E,
	spec: {
		fields: Fields;
		relations?: ValidateEntityRelations<Fields, Relations>;
		permissions?: PermissionMap;
	},
): {
	fields: Fields;
	relations?: ValidateEntityRelations<Fields, Relations>;
	permissions?: PermissionMap;
} {
	return {
		fields: spec.fields,
		relations: spec.relations,
		permissions: spec.permissions,
	};
}
