import { createAuth, type AuthService } from "./auth/auth";
import { createDb, type DbService } from "./db/db";
import { initDb } from "./db/dbutils";
import { stdoutEmailSender, type EmailSender } from "./email";
import { createSchema, type SchemaWithDefaultPermissions, type TromSchema } from "./schema";

export type { EmailSender } from "./email";
export type {
	DbExecAction,
	DbInsertOperationContext,
	DbOperationContext,
	DbUpdateOperationContext,
	DbDeleteOperationContext,
} from "./db/db";
export { DbId } from "./db/dbid";
export { field } from "./db/fields";
export type { FieldBuilder, FieldKind, FieldSpec } from "./db/fields";
export { pointsTo, resolvesToMany } from "./db/relations";
export type {
	EntityRelation,
	EntityRelations,
	PointsToRelation,
	ResolvesToManyRelation,
} from "./db/relations";
export type {
	AggregateSpec,
	DbSelectAction,
	OrderBy,
	WhereClause,
	WhereOperator,
	WithClause,
} from "./db/select";
export type { InferSelect } from "./db/select.types";
export type { AuthErrorCode } from "./auth/types.auth";
export * from "./errors.ts";
export { createSchema, defaultPermitter, entity } from "./schema";
export type {
	DbReadOperationContext,
	EntitySchema,
	PermissionAction,
	PermissionFilter,
	PermissionMap,
	Permitter,
	RequiredPermissionMap,
	SchemaCasing,
	SchemaWithDefaultPermissions,
	TromSchema,
} from "./schema";

export type TromBaseOptions<Schema extends SchemaWithDefaultPermissions<TromSchema>> = {
	schema: Schema;
	databaseUrl: string;
	emailSender?: EmailSender;
};

export type TromBaseInstance<Schema extends SchemaWithDefaultPermissions<TromSchema>> = {
	schema: Schema;
	auth: AuthService;
	db: DbService;
	emailSender: EmailSender;
};

export function TromBase<Schema extends SchemaWithDefaultPermissions<TromSchema>>(
	options: TromBaseOptions<Schema>,
): TromBaseInstance<Schema> {
	initDb(options.databaseUrl);
	const emailSender = options.emailSender ?? stdoutEmailSender;
	return {
		schema: options.schema,
		auth: createAuth({ emailSender }),
		db: createDb(options.schema),
		emailSender,
	};
}
