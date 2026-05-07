CREATE TABLE IF NOT EXISTS trom_auth_users (
	id TEXT PRIMARY KEY,
	email TEXT UNIQUE NOT NULL,
	password_hash TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL,
	updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS trom_auth_sessions (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES trom_auth_users(id),
	token_hash TEXT NOT NULL,
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL,
	invalidated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trom_auth_password_resets (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES trom_auth_users(id),
	token_hash TEXT NOT NULL,
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL,
	used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notes (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	content TEXT NOT NULL,
	user_id TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL,
	updated_at TIMESTAMPTZ NOT NULL
);

CREATE OR REPLACE VIEW users AS
SELECT
	id,
	email,
	created_at AS "createdAt",
	updated_at AS "updatedAt"
FROM trom_auth_users;
