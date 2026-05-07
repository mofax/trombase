import type { TromSchema } from "../schema";
import type { FieldSpec } from "./fields";
import type { EntityRelation } from "./relations";
import type { AggregateSpec, DbSelectAction } from "./select";

type InferField<F> = F extends FieldSpec<infer T> ? T : never;

type AutoColumns = {
	id: string;
	createdAt: Date;
	updatedAt: Date;
};

type DeclaredFieldsOf<S extends TromSchema, T extends keyof S["entities"]> = {
	[K in keyof S["entities"][T]["fields"]]: InferField<S["entities"][T]["fields"][K]>;
};

type RowOf<S extends TromSchema, T extends keyof S["entities"]> = AutoColumns &
	DeclaredFieldsOf<S, T>;

type PickColumns<Row, Cols> = Cols extends readonly (infer K)[]
	? [K] extends [keyof Row]
		? { [P in Extract<K, keyof Row>]: Row[P] }
		: Row
	: Row;

type InferAggregate<
	S extends TromSchema,
	T extends keyof S["entities"],
	A extends AggregateSpec,
> = A extends { fn: "count" }
	? number
	: A extends { fn: "sum" | "avg" }
		? number | null
		: A extends { fn: "min" | "max"; field: infer F }
			? F extends keyof DeclaredFieldsOf<S, T>
				? InferField<S["entities"][T]["fields"][F]> | null
				: never
			: never;

type InferAggregates<S extends TromSchema, T extends keyof S["entities"], As> = {
	-readonly [K in keyof As]: As[K] extends AggregateSpec ? InferAggregate<S, T, As[K]> : never;
};

type RelationOf<
	S extends TromSchema,
	T extends keyof S["entities"],
	R extends string,
> = S["entities"][T] extends { relations: infer Rel }
	? R extends keyof Rel
		? Rel[R] extends EntityRelation
			? Rel[R]
			: never
		: never
	: never;

type InferWith<S extends TromSchema, T extends keyof S["entities"], W> = {
	-readonly [K in keyof W]: K extends string
		? RelationOf<S, T, K> extends infer Rel
			? Rel extends EntityRelation
				? Rel["table"] extends keyof S["entities"]
					? Rel extends { kind: "resolvesToMany" }
						? InferSelectFor<S, Rel["table"], NormalizeWithChild<W[K], Rel["table"]>>[]
						: InferSelectFor<S, Rel["table"], NormalizeWithChild<W[K], Rel["table"]>> | null
					: never
				: never
			: never
		: never;
};

type NormalizeWithChild<V, T extends string> = V extends true
	? { table: T }
	: V extends DbSelectAction
		? V
		: never;

type InferSelectFor<S extends TromSchema, T extends keyof S["entities"], A> = A extends {
	aggregates: infer As;
}
	? PickColumns<RowOf<S, T>, A extends { columns: infer C } ? C : []> & InferAggregates<S, T, As>
	: A extends { with: infer W }
		? PickColumns<RowOf<S, T>, A extends { columns: infer C } ? C : undefined> & InferWith<S, T, W>
		: PickColumns<RowOf<S, T>, A extends { columns: infer C } ? C : undefined>;

export type InferSelect<S extends TromSchema, A extends DbSelectAction> = InferSelectFor<
	S,
	A["table"] extends keyof S["entities"] ? A["table"] : never,
	A
>;
