import { AsyncLocalStorage } from "node:async_hooks";

import type { AuthSession } from "../auth/types.auth";
import { AuthError, PermissionError, TromError } from "../errors";
import type {
	DbReadOperationContext,
	PermissionAction,
	SchemaWithDefaultPermissions,
	TromSchema,
} from "../main";
import { assignRecord } from "../utilities/records";
import { isRecord } from "../utilities/type-guards";
import { buildDeleteSql, normalizeDeleteAction, type DbDeleteAction } from "./delete";
import type { DbDeleteOperationContext } from "./delete";
import { buildInsertSql, normalizeInsertAction, type DbInsertAction } from "./insert";
import type { DbInsertOperationContext } from "./insert";
import { getSql, withTransaction } from "./dbutils";
import { buildAndCollect, type DbSelectAction } from "./select";
import type { InferSelect } from "./select.types";
import { buildUpdateSql, normalizeUpdateAction, type DbUpdateAction } from "./update";
import type { DbUpdateOperationContext } from "./update";

export type { DbActionPayload } from "./mutation-utils";
export type { DbInsertAction, DbInsertOperationContext } from "./insert";
export type { DbUpdateAction, DbUpdateOperationContext } from "./update";
export type { DbDeleteAction, DbDeleteOperationContext } from "./delete";

export type DbExecAction = DbInsertAction | DbUpdateAction | DbDeleteAction;
export type DbWriteAction = DbExecAction;

export type DbOperationAction = DbExecAction["action"];

export type DbOperationContext =
	| DbInsertOperationContext
	| DbUpdateOperationContext
	| DbDeleteOperationContext;

export type DbService<Schema extends TromSchema = TromSchema> = {
	withSession<T>(session: AuthSession, callback: () => Promise<T>): Promise<T>;
	doMutations(actions: DbExecAction[]): Promise<void>;
	select<A extends DbSelectAction>(action: A): Promise<InferSelect<Schema, A>[]>;
};

function normalizeAction<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	action: unknown,
	index: number,
): DbOperationContext {
	if (!isRecord(action)) {
		throw new TromError("DB action must be an object");
	}
	if (action.action === "insert") {
		return normalizeInsertAction(schema, action, index);
	}
	if (action.action === "update") {
		return normalizeUpdateAction(schema, action, index);
	}
	if (action.action === "delete") {
		return normalizeDeleteAction(schema, action, index);
	}
	throw new TromError("DB action must be insert, update, or delete");
}

function normalizeActions<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	actions: DbExecAction[],
): DbOperationContext[] {
	if (!Array.isArray(actions)) {
		throw new TromError("db.doMutations actions must be an array");
	}
	return actions.map((action, index) => normalizeAction(schema, action, index));
}

function isImmutableField(field: unknown): boolean {
	return isRecord(field) && field.immutable === true;
}

function assertMutableUpdate<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	operation: DbOperationContext,
): void {
	if (operation.action !== "update") {
		return;
	}

	for (const field of Object.keys(operation.payload)) {
		if (field === "id" || field === "createdAt" || field === "updatedAt") {
			throw new TromError(`${field} is immutable`);
		}

		const fieldSchema = schema.entities[operation.table]?.fields[field];
		if (isImmutableField(fieldSchema)) {
			throw new TromError(`${field} is immutable`);
		}
	}
}

function permissionForAction(action: DbOperationAction): PermissionAction {
	if (action === "insert") {
		return "create";
	}
	return action;
}

async function assertPermission<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	session: AuthSession,
	operation: DbOperationContext,
): Promise<void> {
	const permissionAction = permissionForAction(operation.action);
	const entity = schema.entities[operation.table];
	if (!entity) {
		throw new TromError(`Unknown table: ${operation.table}`);
	}
	const permitter = entity.permissions[permissionAction];
	const sql = getSql();
	const result = await permitter(session, sql, operation);
	if (!result) {
		return;
	}
	if (result instanceof PermissionError) {
		throw result;
	}
	throw new TromError("permission filter is not supported for mutations");
}

async function executeInsert<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	operation: DbInsertOperationContext,
): Promise<void> {
	if (!operation.writePayload) {
		throw new TromError("insert write payload is required");
	}
	const sql = getSql();
	const built = buildInsertSql(schema, {
		table: operation.table,
		payload: operation.writePayload,
	});
	await sql.unsafe(built.text, built.params as never[]);
}

async function executeUpdate<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	operation: DbUpdateOperationContext,
): Promise<void> {
	if (!operation.writePayload) {
		throw new TromError("update write payload and id are required");
	}
	const sql = getSql();
	const built = buildUpdateSql(schema, {
		table: operation.table,
		id: operation.id,
		payload: operation.writePayload,
	});
	await sql.unsafe(built.text, built.params as never[]);
}

async function executeDelete<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	operation: DbDeleteOperationContext,
): Promise<void> {
	const sql = getSql();
	const built = buildDeleteSql(schema, {
		table: operation.table,
		ids: operation.ids,
	});
	await sql.unsafe(built.text, built.params as never[]);
}

async function executeOperation<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	operation: DbOperationContext,
): Promise<void> {
	if (operation.action === "insert") {
		await executeInsert(schema, operation);
		return;
	}
	if (operation.action === "update") {
		await executeUpdate(schema, operation);
		return;
	}
	await executeDelete(schema, operation);
}

function addWritePayload(operation: DbOperationContext): DbOperationContext {
	const now = new Date();
	if (operation.action === "insert") {
		return Object.assign({}, operation, {
			writePayload: assignRecord(operation.payload, {
				createdAt: now,
				updatedAt: now,
			}),
		});
	}
	if (operation.action === "update") {
		return Object.assign({}, operation, {
			writePayload: assignRecord(operation.payload, {
				updatedAt: now,
			}),
		});
	}
	return operation;
}

async function assertReadPermission<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	session: AuthSession,
	context: DbReadOperationContext,
): Promise<void> {
	const entity = schema.entities[context.table];
	if (!entity) {
		throw new TromError(`Unknown table: ${context.table}`);
	}
	const permitter = entity.permissions.read;
	const sql = getSql();
	const result = await permitter(session, sql, context);
	if (!result) {
		return;
	}
	if (result instanceof PermissionError) {
		throw result;
	}
	throw new TromError("row-level read filters are not yet supported");
}

export function createDb<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
): DbService<Schema> {
	const sessionStorage = new AsyncLocalStorage<AuthSession>();

	return {
		withSession<T>(session: AuthSession, callback: () => Promise<T>): Promise<T> {
			return sessionStorage.run(session, callback);
		},
		async doMutations(actions: DbExecAction[]): Promise<void> {
			const session = sessionStorage.getStore();
			if (!session) {
				throw new AuthError(
					"SESSION_NOT_FOUND",
					"doMutations must be called within db.withSession(...)",
				);
			}
			const operations = normalizeActions(schema, actions);

			await withTransaction(async () => {
				for (const operation of operations) {
					const writeOperation = addWritePayload(operation);
					assertMutableUpdate(schema, writeOperation);
					await assertPermission(schema, session, writeOperation);
					await executeOperation(schema, writeOperation);
				}
			});
		},
		async select<A extends DbSelectAction>(action: A): Promise<InferSelect<Schema, A>[]> {
			const session = sessionStorage.getStore();
			if (!session) {
				throw new AuthError(
					"SESSION_NOT_FOUND",
					"select must be called within db.withSession(...)",
				);
			}
			const built = buildAndCollect(schema, action);

			return (await withTransaction(async () => {
				for (const table of built.tables) {
					const cols = built.columnsByTable[table] ?? [];
					await assertReadPermission(schema, session, {
						action: "read",
						table,
						columns: cols,
					});
				}
				const sql = getSql();
				const rows = await sql.unsafe(built.text, built.params as never[]);
				return rows as unknown as InferSelect<Schema, A>[];
			})) as InferSelect<Schema, A>[];
		},
	};
}
