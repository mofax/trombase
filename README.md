# TromBase

A simple backend for serverside js.

## Install

```bash
npm install trombase
```

From source:

```bash
bun install
bun run build   # vp pack → dist/
```

## The Lowdown

```ts
import { TromBase, createSchema, entity, field, DbId, PermissionError } from "trombase";
import type { Permitter } from "trombase";

// A permitter is an async function that returns null to allow, or PermissionError to deny.
// - session is the current auth session
// - sql is a database connection object that allows arbitrary queries against the db
// - operation is an object that describes what the user is trying to do
const ownerOnly: Permitter = async (session, sql, operation) => {
	const payload = operation?.payload as { userId?: string };
	if (payload?.userId === session.userId) return null;

	return new PermissionError("not your row");
};

const schema = createSchema({
	entities: {
		expenses: entity("expenses", {
			fields: {
				userId: field.dbId().immutable(),
				amount: field.number(),
			},
			permissions: {
				read: ownerOnly,
				create: ownerOnly,
				update: ownerOnly,
				delete: ownerOnly,
			},
		}),
	},
});

const trom = TromBase({
	databaseUrl: process.env.DATABASE_URL!,
	schema,
});
```

## Example app

A fullstack reference app (HTTP API + React UI) lives in [`examples/notes_app/`](examples/notes_app/).

- Register, login, CRUD notes with ownership permitters.
- Reads via `db.select` and `/api/db/select`.

Setup and run instructions: [`examples/notes_app/README.md`](examples/notes_app/README.md).

## API overview

| Surface                                                             | Purpose                                |
| ------------------------------------------------------------------- | -------------------------------------- |
| `TromBase({ databaseUrl, schema, emailSender? })`                   | Wire schema, database, and auth        |
| `createSchema` / `entity` / `field` / `pointsTo` / `resolvesToMany` | Schema DSL                             |
| `trom.auth.registerWithUsernamePassword`                            | Create user + session                  |
| `trom.auth.loginWithUsernamePassword`                               | Login                                  |
| `trom.auth.requestPasswordReset`                                    | Start reset flow                       |
| `trom.auth.validatePasswordReset`                                   | Complete reset                         |
| `trom.auth.invalidateSessionToken`                                  | Log out                                |
| `trom.db.withSession`                                               | Bind session for DB calls              |
| `trom.db.doMutations`                                               | Transactional insert / update / delete |
| `trom.db.select`                                                    | Permissioned reads and joins           |

Public exports are defined in [`src/main.ts`](src/main.ts).

## Non-goals

- Database migrations or schema codegen
- Built-in HTTP / GraphQL server (bring your framework)
- Session token middleware in the library (validate sessions in your routes)
- Arbitrary raw SQL through the public `db` API
- Databases other than PostgreSQL
