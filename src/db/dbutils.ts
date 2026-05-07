import { AsyncLocalStorage } from "node:async_hooks";
import postgres from "postgres";

export type DbSql = postgres.Sql | postgres.TransactionSql;

let sqlClient: postgres.Sql | null = null;
const transactionStorage = new AsyncLocalStorage<postgres.TransactionSql>();

export function initDb(databaseUrl: string): void {
	sqlClient = postgres(databaseUrl);
}

export function getSql(): DbSql {
	return transactionStorage.getStore() ?? (sqlClient as postgres.Sql);
}

export async function withTransaction<T>(callback: () => Promise<T>): Promise<T> {
	const activeTransaction = transactionStorage.getStore();
	if (activeTransaction) {
		return await callback();
	}
	const result = await (sqlClient as postgres.Sql).begin(async (transaction) => {
		return await transactionStorage.run(transaction, callback);
	});
	return result as T;
}
