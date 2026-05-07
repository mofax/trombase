import type { AuthSession } from "./auth/types.auth";
import type { AuthService } from "./auth/auth";
import type { DbOperationContext, DbService } from "./db/db";
import type { DbSql } from "./db/dbutils";
import type { FieldSpec } from "./db/fields";
import type { EntityRelations, RelationInput } from "./db/relations";
import { finalizeRelationMap } from "./db/relations";
import { PermissionError } from "./errors.ts";
import type { EmailSender } from "./email";
import {
	assertValidRelations,
	type ValidateResolvesToManyWhere,
} from "./schema/validate-relations";

export { entity } from "./schema/entity";

export type DbReadOperationContext = {
	action: "read";
	table: string;
	columns: string[];
};

export type PermissionFilter = { filter: unknown };

export type Permitter = (
	session: AuthSession,
	sql: DbSql,
	operation?: DbOperationContext | DbReadOperationContext,
) => Promise<null | PermissionError | PermissionFilter>;

export type PermissionAction = "read" | "update" | "delete" | "create";

export type PermissionMap = Partial<Record<PermissionAction, Permitter>>;

export type RequiredPermissionMap = Record<PermissionAction, Permitter>;

export type SchemaCasing = "camel" | "snake";

export type EntitySchema = {
	fields: Record<string, FieldSpec>;
	relations?: EntityRelations;
	permissions?: PermissionMap;
};

export type TromSchema = {
	casing?: SchemaCasing;
	entities: Record<string, EntitySchema>;
};

export type SchemaWithDefaultPermissions<Schema extends TromSchema> = Omit<Schema, "entities"> & {
	entities: {
		[EntityName in keyof Schema["entities"]]: Schema["entities"][EntityName] & {
			permissions: RequiredPermissionMap;
		};
	};
};

export const defaultPermitter: Permitter = async () => {
	return new PermissionError("Permission denied");
};

function withDefaultPermissions<Schema extends TromSchema>(
	schema: Schema,
): SchemaWithDefaultPermissions<Schema> {
	const entities = Object.fromEntries(
		Object.entries(schema.entities).map(([name, entity]) => [
			name,
			Object.assign({}, entity, {
				permissions: Object.assign(
					{
						read: defaultPermitter,
						update: defaultPermitter,
						delete: defaultPermitter,
						create: defaultPermitter,
					},
					entity.permissions,
				),
			}),
		]),
	) as SchemaWithDefaultPermissions<Schema>["entities"];

	return Object.assign({}, schema, {
		entities,
	});
}

function normalizeSchemaCasing<Schema extends TromSchema>(
	schema: Schema,
): Schema & { casing: SchemaCasing } {
	const casing = schema.casing ?? "camel";
	return Object.assign({}, schema, { casing });
}

export function createSchema<const Schema extends TromSchema>(
	schema: Schema & ValidateResolvesToManyWhere<Schema>,
): SchemaWithDefaultPermissions<Schema & { casing: SchemaCasing }> {
	const withCasing = normalizeSchemaCasing(schema);
	const normalized = normalizeSchemaRelations(withCasing);
	assertValidRelations(normalized);
	return withDefaultPermissions(normalized);
}

function normalizeSchemaRelations<Schema extends TromSchema>(schema: Schema): Schema {
	const entities = Object.fromEntries(
		Object.entries(schema.entities).map(([name, entity]) => {
			const relations = finalizeRelationMap(
				entity.relations as Record<string, RelationInput> | undefined,
			);
			if (!relations) {
				return [name, entity];
			}
			return [name, Object.assign({}, entity, { relations })];
		}),
	) as Schema["entities"];
	return Object.assign({}, schema, { entities });
}

export type TromBaseOptions<Schema extends TromSchema> = {
	schema: Schema;
	databaseUrl: string;
	emailSender?: EmailSender;
};

export type TromBaseInstance<Schema extends TromSchema> = {
	schema: SchemaWithDefaultPermissions<Schema>;
	auth: AuthService;
	db: DbService;
	emailSender: EmailSender;
};
