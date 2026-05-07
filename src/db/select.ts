import { TromError } from "../errors";
import { hasOwn } from "../utilities/records";
import { isArray, isRecord, isString } from "../utilities/type-guards";
import type { SchemaWithDefaultPermissions, TromSchema } from "../schema";
import type { EntityRelation, RelationInput } from "./relations";
import { finalizeRelationInput } from "./relations";
import { quoteDbColumn, quoteDbTable, quoteLogicalColumn } from "./quote-ident";
import { serializeValue } from "./serialize";

export type WhereOperator =
	| { eq: unknown }
	| { ne: unknown }
	| { gt: unknown }
	| { gte: unknown }
	| { lt: unknown }
	| { lte: unknown }
	| { in: unknown[] }
	| { like: string }
	| { ilike: string }
	| { isNull: true }
	| { notNull: true };

export type WhereClause = Record<string, unknown | WhereOperator>;

export type OrderBy = { field: string; direction?: "asc" | "desc" };

export type AggregateSpec =
	| { fn: "count"; field?: string; distinct?: boolean }
	| { fn: "sum" | "avg"; field: string }
	| { fn: "min" | "max"; field: string };

export type WithClause = Record<string, true | DbSelectAction>;

export type DbSelectAction = {
	table: string;
	columns?: string[];
	where?: WhereClause;
	with?: WithClause;
	aggregates?: Record<string, AggregateSpec>;
	groupBy?: string[];
	orderBy?: OrderBy[];
	limit?: number;
	offset?: number;
};

export const AUTO_COLUMNS: readonly string[] = ["id", "createdAt", "updatedAt"];

function jsonKeyLiteral(name: string): string {
	if (name.includes("'") || name.includes("\\")) {
		throw new TromError(`invalid json key: ${name}`);
	}
	return `'${name}'`;
}

function isPlainOperatorObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object") {
		return false;
	}
	if (Array.isArray(value)) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

type NormalizedAggregate = {
	alias: string;
	fn: "count" | "sum" | "avg" | "min" | "max";
	field?: string;
	distinct: boolean;
};

type NormalizedChild = {
	alias: string;
	relation: EntityRelation;
	node: NormalizedNode;
};

type NormalizedNode = {
	table: string;
	columns: string[];
	allFields: string[];
	where?: WhereClause;
	children: NormalizedChild[];
	aggregates: NormalizedAggregate[];
	groupBy: string[];
	orderBy: OrderBy[];
	limit?: number;
	offset?: number;
};

function entityFields<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	table: string,
): string[] {
	const entity = schema.entities[table];
	if (!entity) {
		throw new TromError(`unknown table: ${table}`);
	}
	const declared = Object.keys(entity.fields);
	const all: string[] = [];
	for (const col of AUTO_COLUMNS) {
		all.push(col);
	}
	for (const col of declared) {
		if (col === "id" || col === "createdAt" || col === "updatedAt") {
			continue;
		}
		all.push(col);
	}
	return all;
}

function relationFor<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	table: string,
	relationName: string,
): EntityRelation {
	const entity = schema.entities[table];
	if (!entity) {
		throw new TromError(`unknown table: ${table}`);
	}
	const relations = entity.relations;
	if (!relations || !hasOwn(relations, relationName)) {
		throw new TromError(`unknown relation '${relationName}' on ${table}`);
	}
	const relation = relations[relationName];
	if (!relation) {
		throw new TromError(`unknown relation '${relationName}' on ${table}`);
	}
	return finalizeRelationInput(relation as RelationInput);
}

function assertColumnsKnown(table: string, columns: string[], known: string[]): void {
	for (const col of columns) {
		if (!known.includes(col)) {
			throw new TromError(`unknown column '${col}' on ${table}`);
		}
	}
}

function normalizeAggregates<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	table: string,
	allFields: string[],
	raw: Record<string, AggregateSpec> | undefined,
): NormalizedAggregate[] {
	if (!raw) {
		return [];
	}
	const out: NormalizedAggregate[] = [];
	for (const [alias, specRaw] of Object.entries(raw)) {
		if (!isRecord(specRaw)) {
			throw new TromError(`aggregate '${alias}' must be an object`);
		}
		const spec = specRaw as Record<string, unknown>;
		const fn = spec.fn;
		if (fn !== "count" && fn !== "sum" && fn !== "avg" && fn !== "min" && fn !== "max") {
			throw new TromError(`aggregate '${alias}' has invalid fn`);
		}
		const fieldRaw = spec.field;
		const distinct = spec.distinct === true;
		if (fn === "count") {
			if (fieldRaw !== undefined) {
				if (!isString(fieldRaw)) {
					throw new TromError(`aggregate '${alias}' field must be a string`);
				}
				if (!allFields.includes(fieldRaw)) {
					throw new TromError(`aggregate '${alias}': unknown column '${fieldRaw}' on ${table}`);
				}
			}
			out.push({ alias, fn, field: fieldRaw, distinct });
			continue;
		}
		if (!isString(fieldRaw)) {
			throw new TromError(`aggregate '${alias}' field is required`);
		}
		if (!allFields.includes(fieldRaw)) {
			throw new TromError(`aggregate '${alias}': unknown column '${fieldRaw}' on ${table}`);
		}
		out.push({ alias, fn, field: fieldRaw, distinct: false });
	}
	return out;
}

function normalizeOrderBy(
	table: string,
	known: string[],
	aggregateAliases: string[],
	raw: OrderBy[] | undefined,
): OrderBy[] {
	if (!raw) {
		return [];
	}
	const out: OrderBy[] = [];
	for (const entry of raw) {
		if (!isRecord(entry) || !isString(entry.field)) {
			throw new TromError("orderBy entries require a field name");
		}
		if (!known.includes(entry.field) && !aggregateAliases.includes(entry.field)) {
			throw new TromError(`unknown orderBy column '${entry.field}' on ${table}`);
		}
		const direction = entry.direction;
		if (direction !== undefined && direction !== "asc" && direction !== "desc") {
			throw new TromError(`orderBy direction must be 'asc' or 'desc'`);
		}
		out.push({ field: entry.field, direction: direction ?? "asc" });
	}
	return out;
}

function normalizeNode<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	action: DbSelectAction,
): NormalizedNode {
	if (!isRecord(action)) {
		throw new TromError("select action must be an object");
	}
	if (!isString(action.table)) {
		throw new TromError("select action.table must be a string");
	}
	const allFields = entityFields(schema, action.table);

	let columns: string[];
	if (action.columns !== undefined) {
		if (!isArray(action.columns)) {
			throw new TromError("select action.columns must be an array");
		}
		const provided = action.columns.map((c) => {
			if (!isString(c)) {
				throw new TromError("columns entries must be strings");
			}
			return c;
		});
		assertColumnsKnown(action.table, provided, allFields);
		columns = provided;
	} else {
		columns = allFields.slice();
	}

	const aggregates = normalizeAggregates(schema, action.table, allFields, action.aggregates);

	if (aggregates.length > 0 && action.with !== undefined) {
		throw new TromError("aggregates and with cannot be combined on the same node");
	}

	const groupBy: string[] = [];
	if (action.groupBy !== undefined) {
		if (!isArray(action.groupBy)) {
			throw new TromError("groupBy must be an array");
		}
		for (const col of action.groupBy) {
			if (!isString(col)) {
				throw new TromError("groupBy entries must be strings");
			}
			if (!columns.includes(col)) {
				throw new TromError(`groupBy column '${col}' must also appear in columns`);
			}
			groupBy.push(col);
		}
	}

	const aggregateAliases = aggregates.map((a) => a.alias);
	const orderBy = normalizeOrderBy(action.table, allFields, aggregateAliases, action.orderBy);

	const children: NormalizedChild[] = [];
	if (action.with !== undefined) {
		if (!isRecord(action.with)) {
			throw new TromError("with must be an object");
		}
		for (const [name, value] of Object.entries(action.with)) {
			const relation = relationFor(schema, action.table, name);
			let childAction: DbSelectAction;
			if (value === true) {
				childAction = { table: relation.table };
			} else if (isRecord(value)) {
				if (value.table !== undefined && value.table !== relation.table) {
					throw new TromError(
						`with '${name}' table mismatch: relation targets '${relation.table}'`,
					);
				}
				childAction = Object.assign({}, value as DbSelectAction, { table: relation.table });
			} else {
				throw new TromError(`with '${name}' must be true or an action object`);
			}
			const childNode = normalizeNode(schema, childAction);
			if (childNode.aggregates.length > 0) {
				throw new TromError(`aggregates inside 'with' are not supported (relation '${name}')`);
			}
			children.push({ alias: name, relation, node: childNode });
		}
	}

	if (action.where !== undefined && !isRecord(action.where)) {
		throw new TromError("where must be an object");
	}
	if (action.where) {
		for (const key of Object.keys(action.where)) {
			if (!allFields.includes(key)) {
				throw new TromError(`unknown where column '${key}' on ${action.table}`);
			}
		}
	}

	const limit = action.limit;
	if (limit !== undefined && (typeof limit !== "number" || !Number.isFinite(limit) || limit < 0)) {
		throw new TromError("limit must be a non-negative number");
	}
	const offset = action.offset;
	if (
		offset !== undefined &&
		(typeof offset !== "number" || !Number.isFinite(offset) || offset < 0)
	) {
		throw new TromError("offset must be a non-negative number");
	}

	return {
		table: action.table,
		columns,
		allFields,
		where: action.where,
		children,
		aggregates,
		groupBy,
		orderBy,
		limit,
		offset,
	};
}

class SelectBuilder<Schema extends TromSchema> {
	params: unknown[] = [];
	private aliasIdx = 0;

	constructor(private schema: SchemaWithDefaultPermissions<Schema>) {}

	private colRef(alias: string, logical: string): string {
		return `${alias}.${quoteDbColumn(this.schema, logical)}`;
	}

	private colAlias(logical: string): string {
		return quoteLogicalColumn(logical);
	}

	param(value: unknown): string {
		this.params.push(serializeValue(value));
		return `$${this.params.length}`;
	}

	alias(): string {
		const a = `t${this.aliasIdx}`;
		this.aliasIdx += 1;
		return a;
	}

	private renderWhere(alias: string, where: WhereClause | undefined, extra: string[]): string {
		const parts: string[] = [];
		for (const clause of extra) {
			parts.push(clause);
		}
		if (where) {
			for (const [col, raw] of Object.entries(where)) {
				parts.push(this.renderWhereClause(alias, col, raw));
			}
		}
		if (parts.length === 0) {
			return "";
		}
		return `where ${parts.join(" and ")}`;
	}

	private renderWhereClause(alias: string, col: string, raw: unknown): string {
		const lhs = this.colRef(alias, col);
		if (raw === null) {
			return `${lhs} is null`;
		}
		if (!isPlainOperatorObject(raw)) {
			return `${lhs} = ${this.param(raw)}`;
		}
		if (hasOwn(raw, "eq")) return `${lhs} = ${this.param(raw.eq)}`;
		if (hasOwn(raw, "ne")) return `${lhs} <> ${this.param(raw.ne)}`;
		if (hasOwn(raw, "gt")) return `${lhs} > ${this.param(raw.gt)}`;
		if (hasOwn(raw, "gte")) return `${lhs} >= ${this.param(raw.gte)}`;
		if (hasOwn(raw, "lt")) return `${lhs} < ${this.param(raw.lt)}`;
		if (hasOwn(raw, "lte")) return `${lhs} <= ${this.param(raw.lte)}`;
		if (hasOwn(raw, "like")) return `${lhs} like ${this.param(raw.like)}`;
		if (hasOwn(raw, "ilike")) return `${lhs} ilike ${this.param(raw.ilike)}`;
		if (hasOwn(raw, "isNull")) return `${lhs} is null`;
		if (hasOwn(raw, "notNull")) return `${lhs} is not null`;
		if (hasOwn(raw, "in")) {
			const arr = raw.in;
			if (!isArray(arr)) {
				throw new TromError(`'in' operator requires an array (column ${col})`);
			}
			if (arr.length === 0) {
				return "false";
			}
			const placeholders = arr.map((v) => this.param(v)).join(", ");
			return `${lhs} in (${placeholders})`;
		}
		throw new TromError(`unsupported operator on column '${col}'`);
	}

	private renderOrderBy(alias: string | null, orderBy: OrderBy[]): string {
		if (orderBy.length === 0) {
			return "";
		}
		const parts = orderBy.map((o) => {
			const ref = alias ? this.colRef(alias, o.field) : quoteDbColumn(this.schema, o.field);
			return `${ref} ${o.direction === "desc" ? "desc" : "asc"}`;
		});
		return `order by ${parts.join(", ")}`;
	}

	private renderLimitOffset(node: NormalizedNode): string {
		const parts: string[] = [];
		if (node.limit !== undefined) {
			parts.push(`limit ${this.param(node.limit)}`);
		}
		if (node.offset !== undefined) {
			parts.push(`offset ${this.param(node.offset)}`);
		}
		return parts.join(" ");
	}

	private renderAggregateExpr(agg: NormalizedAggregate, alias: string): string {
		if (agg.fn === "count") {
			if (agg.field === undefined) {
				return `count(*)::bigint as ${this.colAlias(agg.alias)}`;
			}
			const distinct = agg.distinct ? "distinct " : "";
			return `count(${distinct}${this.colRef(alias, agg.field)})::bigint as ${this.colAlias(agg.alias)}`;
		}
		const field = agg.field;
		if (field === undefined) {
			throw new TromError(`aggregate ${agg.fn} requires a field`);
		}
		const expr = this.colRef(alias, field);
		const cast = agg.fn === "sum" || agg.fn === "avg" ? "::numeric" : "";
		return `${agg.fn}(${expr})${cast} as ${this.colAlias(agg.alias)}`;
	}

	private renderJsonObject(alias: string, node: NormalizedNode): string {
		const parts: string[] = [];
		for (const col of node.columns) {
			parts.push(`${jsonKeyLiteral(col)}, ${this.colRef(alias, col)}`);
		}
		for (const child of node.children) {
			parts.push(`${jsonKeyLiteral(child.alias)}, ${this.renderEmbedded(alias, child)}`);
		}
		return `json_build_object(${parts.join(", ")})`;
	}

	private renderEmbedded(parentAlias: string, child: NormalizedChild): string {
		const childAlias = this.alias();
		const relation = child.relation;
		const node = child.node;
		const fkMatch =
			relation.kind === "resolvesToMany"
				? `${this.colRef(childAlias, relation.field)} = ${this.colRef(parentAlias, relation.references)}`
				: `${this.colRef(childAlias, relation.references)} = ${this.colRef(parentAlias, relation.field)}`;

		if (relation.kind === "pointsTo") {
			const obj = this.renderJsonObject(childAlias, node);
			const where = this.renderWhere(childAlias, node.where, [fkMatch]);
			const orderBy = this.renderOrderBy(childAlias, node.orderBy);
			const lo = this.renderLimitOffset(node);
			const limitClause = node.limit === undefined ? "limit 1" : "";
			const tail = [where, orderBy, lo, limitClause].filter((p) => p.length > 0).join(" ");
			return `(select ${obj} from ${quoteDbTable(this.schema, node.table)} ${childAlias} ${tail})`;
		}

		const innerAlias = this.alias();
		const where = this.renderWhere(innerAlias, node.where, [
			`${this.colRef(innerAlias, relation.field)} = ${this.colRef(parentAlias, relation.references)}`,
		]);
		const inner = [
			`select * from ${quoteDbTable(this.schema, node.table)} ${innerAlias}`,
			where,
			this.renderOrderBy(innerAlias, node.orderBy),
			this.renderLimitOffset(node),
		]
			.filter((p) => p.length > 0)
			.join(" ");

		const obj = this.renderJsonObject(childAlias, node);
		const aggOrder = this.renderOrderBy(childAlias, node.orderBy);
		const aggCall = aggOrder.length > 0 ? `json_agg(${obj} ${aggOrder})` : `json_agg(${obj})`;
		return `(select coalesce(${aggCall}, '[]'::json) from (${inner}) ${childAlias})`;
	}

	buildRoot(node: NormalizedNode): string {
		const rootAlias = this.alias();
		const projection: string[] = [];

		if (node.aggregates.length > 0) {
			for (const col of node.columns) {
				projection.push(`${this.colRef(rootAlias, col)} as ${this.colAlias(col)}`);
			}
			for (const agg of node.aggregates) {
				projection.push(this.renderAggregateExpr(agg, rootAlias));
			}
		} else {
			for (const col of node.columns) {
				projection.push(`${this.colRef(rootAlias, col)} as ${this.colAlias(col)}`);
			}
			for (const child of node.children) {
				projection.push(
					`${this.renderEmbedded(rootAlias, child)} as ${this.colAlias(child.alias)}`,
				);
			}
		}

		const where = this.renderWhere(rootAlias, node.where, []);
		const groupBy =
			node.groupBy.length > 0
				? `group by ${node.groupBy.map((c) => this.colRef(rootAlias, c)).join(", ")}`
				: "";
		const orderBy = this.renderOrderByRoot(rootAlias, node);
		const lo = this.renderLimitOffset(node);

		const parts = [
			`select ${projection.join(", ")}`,
			`from ${quoteDbTable(this.schema, node.table)} ${rootAlias}`,
			where,
			groupBy,
			orderBy,
			lo,
		].filter((p) => p.length > 0);
		return parts.join(" ");
	}

	private renderOrderByRoot(rootAlias: string, node: NormalizedNode): string {
		if (node.orderBy.length === 0) {
			return "";
		}
		const aggregateAliases = node.aggregates.map((a) => a.alias);
		const parts = node.orderBy.map((o) => {
			const ref = aggregateAliases.includes(o.field)
				? this.colAlias(o.field)
				: this.colRef(rootAlias, o.field);
			return `${ref} ${o.direction === "desc" ? "desc" : "asc"}`;
		});
		return `order by ${parts.join(", ")}`;
	}
}

export function buildSelectSql<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	action: DbSelectAction,
): { text: string; params: unknown[] } {
	const node = normalizeNode(schema, action);
	const builder = new SelectBuilder(schema);
	const text = builder.buildRoot(node);
	return { text, params: builder.params };
}

export function collectTables<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	action: DbSelectAction,
): string[] {
	const node = normalizeNode(schema, action);
	const seen: string[] = [];
	walk(node);
	return seen;

	function walk(n: NormalizedNode): void {
		if (!seen.includes(n.table)) {
			seen.push(n.table);
		}
		for (const child of n.children) {
			walk(child.node);
		}
	}
}

export function buildAndCollect<Schema extends TromSchema>(
	schema: SchemaWithDefaultPermissions<Schema>,
	action: DbSelectAction,
): { text: string; params: unknown[]; tables: string[]; columnsByTable: Record<string, string[]> } {
	const node = normalizeNode(schema, action);
	const builder = new SelectBuilder(schema);
	const text = builder.buildRoot(node);
	const tables: string[] = [];
	const columnsByTable: Record<string, string[]> = {};
	walk(node);
	return { text, params: builder.params, tables, columnsByTable };

	function walk(n: NormalizedNode): void {
		if (!tables.includes(n.table)) {
			tables.push(n.table);
			columnsByTable[n.table] = n.columns.slice();
		}
		for (const child of n.children) {
			walk(child.node);
		}
	}
}
