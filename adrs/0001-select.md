# ADR 0001: Select API

Status: Proposed
Date: 2026-05-07

## Context

`DbService` in [src/db/db.ts](../src/db/db.ts) currently exposes only `doMutations`. Reads happen ad-hoc via raw `postgres` template literals (see [src/auth/auth.ts:218-275](../src/auth/auth.ts#L218-L275)). A first-class read path is needed that:

- mirrors the object-literal action shape used by `doMutations` — no chained query builder,
- supports joins (pointsTo / resolvesToMany) without N+1 and without row-fanout breaking `LIMIT`,
- runs through the existing permission system (the `read` permitter is declared in [src/schema.ts:14](../src/schema.ts#L14) but never invoked today),
- is as type-safe as the codebase can support — schema fields become typed declarations so result rows infer end-to-end, including nested join shapes.

Hard constraints from [AGENTS.md](../AGENTS.md): no `...` spread; use `Object.assign` and explicit arrays; reuse helpers from [src/utilities/](../src/utilities/).

Inspirations:

- **Drizzle relational queries** — `relations()` map per entity; JSON-aggregate subqueries for joins; `$inferSelect` style result typing.
- **Prisma `include`** — nested object syntax for join trees.
- **Supabase PostgREST embedding** — single round-trip JSON shaping.

## Decision

Add a single `db.select(action)` method. The action is a plain object describing what to read; relationships, partial columns, and aggregates are all expressed inside that object. Results are nested JSON, type-inferred from the schema and the action shape.

### 1. Schema: typed fields + relations

#### 1a. Typed field DSL — [src/db/fields.ts](../src/db/fields.ts) (new)

Each field is a tagged builder carrying a phantom TS type. The runtime shape is `{ kind, nullable, immutable }` — the mutation path keeps using `isImmutableField` and ignores the rest.

```ts
export type FieldKind = "string" | "number" | "boolean" | "date" | "dbId" | "json";

export type FieldSpec<T = unknown> = {
	readonly kind: FieldKind;
	readonly nullable: boolean;
	readonly immutable: boolean;
	readonly __t?: T; // phantom, never read at runtime
};

export const field = {
	string: () => make<string>("string"),
	number: () => make<number>("number"),
	boolean: () => make<boolean>("boolean"),
	date: () => make<Date>("date"),
	dbId: () => make<DbId>("dbId"),
	json: <T = unknown>() => make<T>("json"),
};
```

Builders chain `.nullable()` / `.immutable()` via `Object.assign({}, this, { nullable: true })`. Auto-managed columns (`id: DbId`, `createdAt: Date`, `updatedAt: Date`) are merged in by inference helpers, never declared by the caller.

#### 1b. Relations map — [src/db/relations.ts](../src/db/relations.ts) (new)

```ts
export type PointsToRelation = {
	kind: "pointsTo";
	table: string;
	field: string;
	references: string;
};
export type ResolvesToManyRelation = {
	kind: "resolvesToMany";
	table: string;
	field: string;
	references: string;
};
export type EntityRelation = PointsToRelation | ResolvesToManyRelation;

export function pointsTo(table: string): { where(column: string): RelationPending };
export function resolvesToMany(table: string): { where(column: string): RelationPending };
```

`where(column)` names the FK / link column. `references(column)` names the matched column on the other side. **`.references()` is required** — incomplete chains like `pointsTo("users").where("userId")` are rejected at compile time (in `entity()`) and at runtime (`createSchema` / `assertValidRelations`).

| API                                                        | `where()` column lives on | `references()` column lives on |
| ---------------------------------------------------------- | ------------------------- | ------------------------------ |
| `pointsTo("users").where("userId").references("id")`       | this entity               | target entity (`users`)        |
| `resolvesToMany("notes").where("userId").references("id")` | target entity (`notes`)   | this entity                    |

Use `entity()` from [src/schema/entity.ts](../src/schema/entity.ts) so `pointsTo.where` is type-checked against the entity's `fields`. `resolvesToMany.where` is validated at `createSchema` (TS + runtime).

#### 1c. EntitySchema gains `relations` and typed `fields`

```ts
export type EntitySchema = {
	fields: Record<string, FieldSpec>;
	relations?: Record<string, EntityRelation>;
	permissions?: PermissionMap;
};
```

#### 1d. Updated [examples/notes_app/schema.ts](../examples/notes_app/schema.ts)

```ts
import { createSchema, entity, field, pointsTo, resolvesToMany } from "../../src/main";

export const schema = createSchema({
	entities: {
		users: entity("users", {
			fields: { email: field.string() },
			relations: { notes: resolvesToMany("notes").where("userId").references("id") },
			permissions: { read: async () => null },
		}),
		notes: entity("notes", {
			fields: {
				title: field.string(),
				content: field.string(),
				userId: field.dbId().immutable(),
			},
			relations: { author: pointsTo("users").where("userId").references("id") },
			permissions: { read: async () => null /* + existing create/update/delete */ },
		}),
	},
});
```

### 2. Action shape — [src/db/select.ts](../src/db/select.ts) (new)

```ts
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
export type WithClause = Record<string, true | DbSelectAction>;

export type AggregateSpec =
	| { fn: "count"; field?: string; distinct?: boolean }
	| { fn: "sum" | "avg"; field: string }
	| { fn: "min" | "max"; field: string };

export type DbSelectAction = {
	table: string;
	columns?: string[]; // partial column projection
	where?: WhereClause;
	with?: WithClause;
	aggregates?: Record<string, AggregateSpec>; // named aggregates
	groupBy?: string[]; // group-by columns (must be in columns)
	orderBy?: OrderBy[];
	limit?: number;
	offset?: number;
};
```

No `action: "select"` discriminator — the method is `db.select`, so the field would be redundant on every action. Nested `with` entries follow the same shape.

Bare value in `where` means `eq`. `null` bare value compiles to `is null`. `with: { author: true }` is shorthand for `{ author: { table: <relation.table> } }`. Nested `with` recurses.

#### Partial columns

`columns` selects a subset of the entity's fields. Auto-managed columns (`id`, `createdAt`, `updatedAt`) are included only if `columns` is omitted or lists them.

Joined columns are **never** flattened with dotted SQL aliases — results are always nested JSON, so `notes.title` is naturally `row.notes[i].title`. To project a subset of joined columns, set `columns` on the `with` entry:

```ts
await db.select({
	table: "notes",
	columns: ["id", "title"],
	with: { author: { table: "users", columns: ["email"] } },
});
// => { id: DbId; title: string; author: { email: string } | null }[]
```

#### Aggregates and grouping

`aggregates` produces named scalar results. `count` accepts no field (`count(*)`) or a field plus optional `distinct`. `sum`/`avg`/`min`/`max` require a field.

Without `groupBy`, the query returns a single row of aggregate results:

```ts
await db.select({
	table: "notes",
	aggregates: { total: { fn: "count" } },
});
// => [{ total: number }]

await db.select({
	table: "notes",
	aggregates: { authors: { fn: "count", field: "userId", distinct: true } },
});
// => [{ authors: number }]
```

With `groupBy`, every entry must also appear in `columns` (validated at normalization):

```ts
await db.select({
	table: "notes",
	columns: ["userId"],
	groupBy: ["userId"],
	aggregates: { count: { fn: "count" } },
	orderBy: [{ field: "count", direction: "desc" }],
	limit: 10,
});
// => { userId: DbId; count: number }[]
```

`aggregates` and `with` on the same node are mutually exclusive (rejected at normalization). Aggregating inside a `with` subquery is also rejected (out of scope; callers can derive counts in JS from the embedded array, or run a second `select` keyed by parent id).

Postgres returns `count`/`sum` as `bigint` (string in the `postgres` driver) for large values. The implementation casts these to `number` after row return — acceptable for sane row counts.

#### Examples

```ts
// notes with author
await db.select({
	table: "notes",
	where: { userId: session.userId },
	with: { author: true },
	orderBy: [{ field: "createdAt", direction: "desc" }],
	limit: 50,
});

// users with their (filtered, limited) notes
await db.select({
	table: "users",
	where: { id: someId },
	with: {
		notes: {
			table: "notes",
			where: { archived: { eq: false } },
			orderBy: [{ field: "createdAt", direction: "desc" }],
			limit: 10,
		},
	},
});
```

### 3. Public API: `db.select`

```ts
select<A extends DbSelectAction>(action: A): Promise<InferSelect<Schema, A>[]>;
```

- Must be called inside `withSession`; throws `AuthError` otherwise (mirrors [src/db/db.ts:361](../src/db/db.ts#L361)).
- Always wraps in `withTransaction` — same helper used by mutations ([src/db/dbutils.ts:17-26](../src/db/dbutils.ts#L17-L26)).
- Calls the `read` permitter once per **unique table** referenced in the action tree, before SQL is built.
- Returns rows whose type is **inferred** from `Schema` + `A`.

Single-shot only. No batched `doQueries` form — adding it later is non-breaking if a caller needs it.

### 4. SQL generation

Single statement per `select`. Joins are _not_ SQL `JOIN`s on the outer query — they are subqueries that return JSON, so row fanout never happens and parent `LIMIT`/`OFFSET` work correctly (Drizzle's approach).

- **pointsTo** → correlated scalar subquery returning `json_build_object(...)`, aliased as the relation name.
- **resolvesToMany** → `LEFT JOIN LATERAL (select json_agg(json_build_object(...) order by ...) from (<inner with where/order/limit>) t) on true`, with `coalesce(..., '[]'::json)` for the empty case.

Example — `notes` with `author` (pointsTo):

```sql
select
    t0.id, t0.title, t0.content, t0."userId", t0."createdAt", t0."updatedAt",
    (
        select json_build_object(
            'id', t1.id,
            'email', t1.email,
            'createdAt', t1."createdAt",
            'updatedAt', t1."updatedAt"
        )
        from users t1
        where t1.id = t0."userId"
        limit 1
    ) as author
from notes t0
where t0."userId" = $1
limit 50
```

Example — `users` with `notes` (resolvesToMany):

```sql
select
    t0.id, t0.email, t0."createdAt", t0."updatedAt",
    coalesce(t1.notes, '[]'::json) as notes
from users t0
left join lateral (
    select json_agg(
        json_build_object(
            'id', t2.id, 'title', t2.title, 'content', t2.content,
            'userId', t2."userId", 'createdAt', t2."createdAt", 'updatedAt', t2."updatedAt"
        )
        order by t2."createdAt" desc
    ) as notes
    from (
        select * from notes
        where notes."userId" = t0.id and notes.archived = $2
        order by "createdAt" desc
        limit 10
    ) t2
) t1 on true
where t0.id = $1
```

#### Aggregates SQL

`count(*)` → `count(*) as "<alias>"`. `count("col", distinct=true)` → `count(distinct "col") as "<alias>"`. Other aggregates → `<fn>("col") as "<alias>"`. `groupBy: ["userId"]` → `group by "userId"`.

Example — notes per user:

```sql
select t0."userId" as "userId", count(*)::bigint as "count"
from notes t0
group by t0."userId"
order by "count" desc
limit 10
```

#### Implementation: small builder + `sql.unsafe`

`buildSelectSql(schema, action)` returns `{ text: string; params: unknown[] }` and is executed via `sqlClient.unsafe(text, params)` — the `postgres` v3 driver supports this for dynamically structured queries. Identifiers go through a `quoteIdent(name)` helper that whitelists `[A-Za-z0-9_]` and double-quotes the result. All values are parameters; nothing is concatenated. `serializeValue` is lifted from [src/db/db.ts:130](../src/db/db.ts#L130) into a shared [src/db/serialize.ts](../src/db/serialize.ts).

Aliasing: `t0`, `t1`, `t2`, … via a counter passed through recursion, so the same table can appear multiple times in a tree without collision.

### 5. Permission integration (gate-only)

The `Permitter` return type is widened additively in [src/schema.ts](../src/schema.ts) so a future row-level filter PR doesn't break callers:

```ts
export type Permitter = (
	session: AuthSession,
	sql: DbSql,
	operation?: DbOperationContext | DbReadOperationContext,
) => Promise<null | PermissionError | { filter: unknown }>;
```

In this PR, `select.ts` only handles `null | PermissionError`. If a permitter returns `{ filter }` we throw `TromError("row-level read filters not yet supported")`. Mutation permitters never return `{ filter }`, so the union widening is invisible to existing code.

A new `DbReadOperationContext` is built per unique table:

```ts
export type DbReadOperationContext = {
	action: "read";
	table: string;
	columns: string[];
	where?: WhereClause;
};
```

`db.select` collects every table touched by the action tree, calls each entity's `read` permitter once, fails fast on the first denial. SQL is only built after all permitters pass.

### 6. Type inference

Result type is computed from `Schema` and the action `A`. Public types live in [src/db/select.types.ts](../src/db/select.types.ts) (new).

```ts
type InferField<F> =
	F extends FieldSpec<infer T> ? (F extends { nullable: true } ? T | null : T) : never;

type AutoColumns = { id: DbId; createdAt: Date; updatedAt: Date };

type RowOf<S extends TromSchema, T extends keyof S["entities"]> = AutoColumns & {
	[K in keyof S["entities"][T]["fields"]]: InferField<S["entities"][T]["fields"][K]>;
};

type PickColumns<
	Row,
	Cols extends readonly string[] | undefined,
> = Cols extends readonly (infer K extends keyof Row)[] ? Pick<Row, K> : Row;

type InferAggregate<
	S extends TromSchema,
	T extends keyof S["entities"],
	A extends AggregateSpec,
> = A extends { fn: "count" }
	? number
	: A extends { fn: "sum" | "avg" }
		? number | null
		: A extends { fn: "min" | "max"; field: infer F extends keyof S["entities"][T]["fields"] }
			? InferField<S["entities"][T]["fields"][F]> | null
			: never;

type InferAggregates<S extends TromSchema, T extends keyof S["entities"], As> = {
	[K in keyof As]: As[K] extends AggregateSpec ? InferAggregate<S, T, As[K]> : never;
};

type RelationTarget<S extends TromSchema, T extends keyof S["entities"], R extends string> =
	S["entities"][T]["relations"] extends Record<string, EntityRelation>
		? S["entities"][T]["relations"][R] extends { table: infer Tgt extends keyof S["entities"] }
			? Tgt
			: never
		: never;

type RelationKind<
	S extends TromSchema,
	T extends keyof S["entities"],
	R extends string,
> = S["entities"][T]["relations"][R]["kind"];

type InferWith<S extends TromSchema, T extends keyof S["entities"], W> = {
	[K in keyof W]: RelationKind<S, T, K & string> extends "resolvesToMany"
		? InferSelectFor<S, RelationTarget<S, T, K & string>, W[K]>[]
		: InferSelectFor<S, RelationTarget<S, T, K & string>, W[K]> | null;
};

type InferSelectFor<S extends TromSchema, T extends keyof S["entities"], A> = A extends {
	aggregates: infer As;
}
	? PickColumns<RowOf<S, T>, A extends { columns: infer C extends readonly string[] } ? C : []> &
			InferAggregates<S, T, As>
	: A extends { with: infer W }
		? PickColumns<
				RowOf<S, T>,
				A extends { columns: infer C extends readonly string[] } ? C : undefined
			> &
				InferWith<S, T, W>
		: PickColumns<
				RowOf<S, T>,
				A extends { columns: infer C extends readonly string[] } ? C : undefined
			>;

export type InferSelect<S extends TromSchema, A extends DbSelectAction> = InferSelectFor<
	S,
	A["table"] & keyof S["entities"],
	A
>;
```

Notes:

- `with: { author: true }` shorthand is normalized at the type level to `{ author: { table } }` before inference.
- `columns` narrows the row type via `Pick`. When `aggregates` is present, the row contains only listed columns (defaulting to none) plus the aggregates — auto columns are not auto-included in aggregate queries.
- For `groupBy`, runtime asserts every entry is in `columns`; the type system enforces this lazily via the `Pick` narrowing.

This buys: `await db.select({ table: "notes", with: { author: true } })` produces `Promise<(NoteRow & { author: UserRow | null })[]>` with no caller annotation.

### 7. File layout

New:

- [src/db/fields.ts](../src/db/fields.ts) — typed field DSL.
- [src/db/relations.ts](../src/db/relations.ts) — relation types + helpers.
- [src/db/serialize.ts](../src/db/serialize.ts) — `serializeValue` extracted from `db.ts`.
- [src/db/select.ts](../src/db/select.ts) — `DbSelectAction` types, normalization, `buildSelectSql`, `executeSelect`, `runReadPermissions`.
- [src/db/select.types.ts](../src/db/select.types.ts) — `InferSelect` and friends.
- [src_tests/db/select.test.ts](../src_tests/db/select.test.ts) — Bun tests.

Edits:

- [src/db/db.ts](../src/db/db.ts) — `createDb` adds `select`; pull `serializeValue` import from `./serialize`. Mutation logic untouched.
- [src/schema.ts](../src/schema.ts) — `EntitySchema.fields` typed as `Record<string, FieldSpec>`, `relations?` added, `Permitter` return widened with `{ filter: unknown }`.
- [src/main.ts](../src/main.ts) — **delete the duplicated schema block** (lines 34–96 currently duplicate types from [src/schema.ts](../src/schema.ts)) and re-export from `./schema`. Must happen before adding `relations` so the new field isn't defined twice and silently drift. Re-export `field`, `pointsTo`, `resolvesToMany`, `entity`, `DbSelectAction`, `InferSelect`.
- [examples/notes_app/schema.ts](../examples/notes_app/schema.ts) — migrate to typed fields, add `users` entity + relations + permissive `read` permitters.
- [examples/notes_app/server.ts](../examples/notes_app/server.ts) — add `/api/db/select` route.

Reuse from [src/utilities/](../src/utilities/):

- `assignRecord`, `copyRecord`, `hasOwn` from `records.ts`.
- `isRecord`, `isString`, `isArray` from `type-guards.ts`.

### 8. Implementation order

1. **Refactor (no behavior change):** delete duplicated schema types in [src/main.ts](../src/main.ts), re-export from [src/schema.ts](../src/schema.ts).
2. **Extract `serializeValue`** into [src/db/serialize.ts](../src/db/serialize.ts).
3. **Typed field DSL:** add [src/db/fields.ts](../src/db/fields.ts). Migrate [examples/notes_app/schema.ts](../examples/notes_app/schema.ts) fields to `field.*()`. Update `EntitySchema.fields` type.
4. **Relations:** add [src/db/relations.ts](../src/db/relations.ts). Extend `EntitySchema` with optional `relations`. Add `users` entity + relations to the example.
5. **Widen `Permitter` return type** with `{ filter: unknown }`. Mutation path treats `{ filter }` as a hard error today.
6. **SQL builder:** [src/db/select.ts](../src/db/select.ts) with `DbSelectAction`, normalization, `buildSelectSql`, alias counter, `quoteIdent`. Pure unit tests.
7. **Wire `select` into `DbService`**: session check → withTransaction → read-permission gate per unique table → `sql.unsafe(text, params)` → return rows.
8. **Inference types:** [src/db/select.types.ts](../src/db/select.types.ts). Re-export from [src/main.ts](../src/main.ts).
9. **Example route:** add `/api/db/select` to [examples/notes_app/server.ts](../examples/notes_app/server.ts).
10. Tests + manual verification (sections 9 and 10).

### 9. Tests — [src_tests/db/select.test.ts](../src_tests/db/select.test.ts)

Pure builder (no DB):

- scalar select; `where` for each operator (eq via bare value, in, gte, like, isNull),
- pointsTo embedding produces `json_build_object` subquery,
- resolvesToMany embedding produces `LEFT JOIN LATERAL` with inner `LIMIT`/`ORDER BY`,
- nested `with` two levels deep generates correct alias progression `t0/t1/t2`,
- `DbId` value serializes to its string form in params,
- partial `columns` narrows root projection AND nested `json_build_object` keys,
- `aggregates: { total: { fn: "count" } }` emits `count(*) as "total"`,
- `aggregates` with `field` + `distinct` emits `count(distinct "<col>")`,
- `groupBy` emits `group by` with quoted identifiers,
- rejects unknown table, unknown relation key in `with`, unknown field in `where` / `columns` / `groupBy`,
- rejects `aggregates` together with `with` on the same node,
- rejects `groupBy` entries not in `columns`,
- `{ filter }` returned from a `read` permitter throws `TromError`.

Service-level:

- `db.select` throws `AuthError` when called outside `withSession` (mirrors existing test in [src_tests/db/db.test.ts](../src_tests/db/db.test.ts)).

Live-DB integration tests are out of scope — there is no Postgres test harness yet. End-to-end correctness is verified manually through the example app.

### 10. Verification

1. Migrate [examples/notes_app/schema.ts](../examples/notes_app/schema.ts) per §1d.
2. Add `/api/db/select` to [examples/notes_app/server.ts](../examples/notes_app/server.ts) accepting `{ action }` in body.
3. Sign in, then `POST /api/db/select`:
   ```json
   { "action": { "table": "notes", "with": { "author": true }, "limit": 5 } }
   ```
   Expected JSON:
   ```json
   [
   	{
   		"id": "...",
   		"title": "...",
   		"userId": "...",
   		"createdAt": "...",
   		"updatedAt": "...",
   		"author": { "id": "...", "email": "...", "createdAt": "...", "updatedAt": "..." }
   	}
   ]
   ```
4. Confirm the SQL emitted matches §4 — enable `postgres({ debug })` in [src/db/dbutils.ts](../src/db/dbutils.ts) temporarily.
5. Inverse direction:
   ```json
   {
   	"action": {
   		"table": "users",
   		"where": { "id": "<your-user-id>" },
   		"with": { "notes": { "table": "notes", "limit": 10 } }
   	}
   }
   ```
   Verify `users[0].notes` is `[]` for an empty user, length-≤10 ordered array otherwise.
6. Aggregate:
   ```json
   { "action": { "table": "notes", "aggregates": { "total": { "fn": "count" } } } }
   ```
   Expect `[{ "total": <number> }]`.
7. Switch one entity's `read` permitter to `defaultPermitter` and confirm the route returns `PermissionError`.
8. In TypeScript, hover the result of `db.select({ table: "notes", with: { author: true } })` and confirm inference yields `(NoteRow & { author: UserRow | null })[]` with no manual generics.

## Consequences

### Positive

- **No N+1, no row fanout** — single round trip; parent `LIMIT`/`OFFSET` are honored because joins are JSON subqueries, not flat `JOIN`s.
- **Symmetric API** with `doMutations`: object-literal action, no chained builder, same `withSession` + `withTransaction` semantics.
- **End-to-end inference** — caller writes `db.select({ table: "notes", with: { author: true } })` and gets a fully typed result without generics.
- **Permission system finally exercises `read`**, with a forward-compatible return-type widening for row-level SQL filtering in a follow-up PR.
- **Schema duplication is eliminated** as a side benefit of step 1 (deleting the duplicated block in [src/main.ts](../src/main.ts) before adding new fields).

### Negative

- **Schema migration is required** — every existing field declaration (`title: {}`) becomes `title: field.string()`. In-repo this is just the notes_app example, so the cost is small now but grows with adoption.
- **No raw-SQL escape hatch** in the action object — power users still have direct `getSql()` access, but the `select` API itself is opinionated. Acceptable for now; can add later if needed.
- **No batched `select`** — callers needing snapshot consistency across multiple top-level reads must wait for `doSelects` (or fall back to `getSql()`).
- **`bigint` cast to `number`** for counts/sums is wrong at extreme magnitudes. Document the limit; revisit if a caller hits it.
- **Aggregates inside `with` are rejected** — callers can derive counts in JS from the embedded array or run a second `select`. Lifting this restriction is non-trivial because `json_agg` and aggregate functions don't compose inside the same SELECT list without subqueries.
- **Type-system complexity** — `InferSelect` is a chain of conditional types. Hover times in editors will be noticeably longer for deep `with` trees. Acceptable trade-off for inference quality.

### Alternatives considered

- **Field-inline relations** (`userId: { references: "users" }`): rejected — the relation name has to equal the FK column name, and the reverse resolvesToMany side has only an implicit name. The Drizzle-style top-level map decouples relation names from column names.
- **Row-level read filters now**: rejected for this PR — the splicing logic into nested LATERAL subqueries is a separate design pass. The `Permitter` return type is widened today so the follow-up PR is non-breaking.
- **Typed field DSL deferred**: rejected — caller-typed generics work but lose the "schema is the source of truth" property that motivated this design. Doing typing now keeps the schema migration to one PR.
- **Kysely-style chained query builder**: rejected — inconsistent with the `doMutations` action shape and adds a large surface area.
