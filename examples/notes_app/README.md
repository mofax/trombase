# TromBase Notes App Example

A minimal fullstack application demonstrating the `trombase` library with Bun and React.

## Features

- **User authentication:** Register and login with email/password using trombase auth.
- **Note creation:** Write notes that are persisted to PostgreSQL via trombase's permission-checked `db.exec`.
- **Note editing & deletion:** Update and delete notes with ownership enforced by schema permitters.
- **React frontend:** Client-side rendered UI that communicates with the Bun backend.

## Prerequisites

- [Bun](https://bun.sh) installed
- PostgreSQL running locally (or via Docker)

## Database Setup

Create a database and run the schema:

```bash
# Using psql (adjust connection string as needed)
psql postgres://localhost:5432/postgres -c "CREATE DATABASE trombase_harness;"
psql postgres://localhost:5432/trombase_harness -f ./schema.sql
```

Or with Docker:

```bash
docker run -d --name trombase-postgres \
  -e POSTGRES_DB=trombase_harness \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 postgres:16

# Wait a moment for Postgres to start, then:
PGPASSWORD=postgres psql -h localhost -U postgres -d trombase_harness -f ./schema.sql
```

## Running the App

```bash
# Set the database URL if not using the default
export DATABASE_URL="postgres://localhost:5432/trombase_harness"

# Run the server with hot reload
bun --hot ./server.ts
```

Open http://localhost:3000 in your browser.

## Architecture

- **`./schema.ts`** — Schema with `casing: "snake"`: logical field names stay camelCase in the API (`userId`, `createdAt`) while PostgreSQL columns are snake_case (`user_id`, `created_at`). Permission SQL uses `toDbIdent()` for physical column names.
- **`./server.ts`** — Bun server using `Bun.serve()` with API routes and HTML imports. It defines a `notes` entity schema with per-action permissions that enforce note ownership.
- **`./index.html`** — HTML entry point that imports `frontend.tsx`. Bun bundles the React app automatically.
- **`./frontend.tsx`** — React frontend with auth forms and a notes dashboard. Notes are loaded via `GET /api/db/select` with the select action nested in the query string (`qs` parse/stringify) and logical camelCase field names.
- **`./schema.sql`** — PostgreSQL schema for trombase auth tables and the notes table (snake_case columns, aligned with `casing: "snake"`).
- **`./REPORT.md`** — Detailed documentation of library gaps discovered during development.

## Known Limitations

Because of missing functionality in the current version of trombase, the app has the following limitations (see `REPORT.md` for details):

1. **No server-side session validation:** The full `AuthSession` JSON is sent in request bodies instead of a token in the `Authorization` header.
2. **Read via select API:** Notes are loaded with `db.select` using logical camelCase field names; the library maps them to snake_case columns in SQL.
3. **No access to the underlying SQL client:** Custom queries outside of `db.exec` are not possible through the public API.
