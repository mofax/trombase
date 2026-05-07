import { randomUUID } from "node:crypto";

import { getSql, withTransaction, type DbSql } from "../db/dbutils";
import { stdoutEmailSender, type EmailSender } from "../email";
import { unsafe_ignoreThrowAsync } from "../utilities/promises";
import { isRecord } from "../utilities/type-guards";
import {
	AUTH_TABLES,
	MIN_PASSWORD_LENGTH,
	PASSWORD_RESET_TTL_MS,
	SESSION_TTL_MS,
} from "./constants.auth";
import {
	AuthSession,
	AuthUser,
	AuthWithSessionResult,
	InvalidateSessionTokenResult,
	RequestPasswordResetResult,
	PasswordResetDelivery,
} from "./dto.auth";
import { generateToken, hashToken } from "./tokens.auth";
import type { AuthToken } from "./types.auth";
import { AuthError } from "../errors";

type UserRow = {
	id: string;
	email: string;
	password_hash: string;
	created_at: Date;
	updated_at: Date;
};

type SessionRow = {
	id: string;
	user_id: string;
	expires_at: Date;
};

type ResetUserRow = {
	reset_id: string;
	user_id: string;
	email: string;
	created_at: Date;
	updated_at: Date;
};

export type AuthOptions = {
	emailSender?: EmailSender;
};

function normalizeEmail(email: string): string {
	const normalized = email.trim().toLowerCase();
	if (!normalized) {
		throw new AuthError("INVALID_AUTH_INPUT", "Email is required");
	}
	return normalized;
}

function assertPassword(password: string): void {
	if (password.length < MIN_PASSWORD_LENGTH) {
		throw new AuthError(
			"INVALID_AUTH_INPUT",
			`Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
		);
	}
}

function addMilliseconds(date: Date, milliseconds: number): Date {
	return new Date(date.getTime() + milliseconds);
}

async function hashPassword(password: string): Promise<string> {
	return await Bun.password.hash(password);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return await Bun.password.verify(password, hash);
}

function toAuthUser(row: Pick<UserRow, "id" | "email" | "created_at" | "updated_at">): AuthUser {
	return new AuthUser(row.id, row.email, row.created_at, row.updated_at);
}

function toAuthSession(row: SessionRow, token: AuthToken): AuthSession {
	return new AuthSession(row.id, row.user_id, token, row.expires_at);
}

function isUniqueViolation(error: unknown): boolean {
	return isRecord(error) && error.code === "23505";
}

function encodeToken(token: AuthToken): string {
	return Buffer.from(token).toString("base64url");
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

async function sendWelcomeEmail(emailSender: EmailSender, user: AuthUser): Promise<void> {
	const email = escapeHtml(user.email);

	await unsafe_ignoreThrowAsync(async () => {
		await emailSender({
			to: user.email,
			subject: "Welcome to TromBase",
			html: `<p>Welcome, ${email}.</p>`,
		});
	});
}

async function sendPasswordResetEmail(
	emailSender: EmailSender,
	delivery: PasswordResetDelivery,
): Promise<void> {
	await unsafe_ignoreThrowAsync(async () => {
		await emailSender({
			to: delivery.user.email,
			subject: "Reset your TromBase password",
			html: `<p>Use this token to reset your password:</p><p><code>${encodeToken(delivery.token)}</code></p>`,
		});
	});
}

async function createSession(sql: DbSql, userId: string, now = new Date()): Promise<AuthSession> {
	const token = generateToken();
	const tokenHash = hashToken(token);
	const expiresAt = addMilliseconds(now, SESSION_TTL_MS);
	const [session] = await sql<SessionRow[]>`
        insert into ${sql(AUTH_TABLES.sessions)}
            (id, user_id, token_hash, expires_at, created_at, invalidated_at)
        values
            (${randomUUID()}, ${userId}, ${tokenHash}, ${expiresAt}, ${now}, null)
        returning id, user_id, expires_at
    `;

	if (!session) {
		throw new AuthError("INVALID_AUTH_INPUT", "Failed to create session");
	}

	return toAuthSession(session, token);
}

async function createPasswordResetForUser(
	sql: DbSql,
	user: AuthUser,
	now = new Date(),
): Promise<PasswordResetDelivery> {
	const token = generateToken();
	const tokenHash = hashToken(token);
	const expiresAt = addMilliseconds(now, PASSWORD_RESET_TTL_MS);

	await sql`
        insert into ${sql(AUTH_TABLES.passwordResets)}
            (id, user_id, token_hash, expires_at, created_at, used_at)
        values
            (${randomUUID()}, ${user.id}, ${tokenHash}, ${expiresAt}, ${now}, null)
    `;

	return new PasswordResetDelivery(user, token, expiresAt);
}

export function createAuth(options: AuthOptions = {}) {
	const emailSender = options.emailSender ?? stdoutEmailSender;

	return {
		async registerWithUsernamePassword(input: {
			email: string;
			password: string;
		}): Promise<AuthWithSessionResult> {
			const email = normalizeEmail(input.email);
			assertPassword(input.password);
			const passwordHash = await hashPassword(input.password);
			const now = new Date();

			try {
				const result = await withTransaction(async () => {
					const sql = getSql();
					const [userRow] = await sql<UserRow[]>`
                    insert into ${sql(AUTH_TABLES.users)}
                        (id, email, password_hash, created_at, updated_at)
                    values
                        (${randomUUID()}, ${email}, ${passwordHash}, ${now}, ${now})
                    returning id, email, password_hash, created_at, updated_at
                `;

					if (!userRow) {
						throw new AuthError("INVALID_AUTH_INPUT", "Failed to create user");
					}

					return new AuthWithSessionResult(
						toAuthUser(userRow),
						await createSession(sql, userRow.id, now),
					);
				});

				await sendWelcomeEmail(emailSender, result.user);
				return result;
			} catch (error) {
				if (isUniqueViolation(error)) {
					throw new AuthError("USERNAME_TAKEN", "Username is already registered");
				}
				throw error;
			}
		},

		async loginWithUsernamePassword(input: {
			email: string;
			password: string;
		}): Promise<AuthWithSessionResult> {
			const sql = getSql();
			const email = normalizeEmail(input.email);
			const [userRow] = await sql<UserRow[]>`
            select id, email, password_hash, created_at, updated_at
            from ${sql(AUTH_TABLES.users)}
            where email = ${email}
            limit 1
        `;

			if (!userRow || !(await verifyPassword(input.password, userRow.password_hash))) {
				throw new AuthError("INVALID_CREDENTIALS", "Invalid username or password");
			}

			return new AuthWithSessionResult(toAuthUser(userRow), await createSession(sql, userRow.id));
		},

		async requestPasswordReset(input: { email: string }): Promise<RequestPasswordResetResult> {
			const sql = getSql();
			const email = normalizeEmail(input.email);
			const [userRow] = await sql<UserRow[]>`
            select id, email, password_hash, created_at, updated_at
            from ${sql(AUTH_TABLES.users)}
            where email = ${email}
            limit 1
        `;

			if (userRow) {
				const delivery = await createPasswordResetForUser(sql, toAuthUser(userRow));
				await sendPasswordResetEmail(emailSender, delivery);
			}

			return new RequestPasswordResetResult();
		},

		async validatePasswordReset(input: {
			token: string;
			newPassword: string;
		}): Promise<AuthWithSessionResult> {
			assertPassword(input.newPassword);
			const tokenBytes = Uint8Array.from(Buffer.from(input.token, "base64url"));
			const tokenHash = hashToken(tokenBytes);
			const now = new Date();

			return await withTransaction(async () => {
				const sql = getSql();
				const [resetRow] = await sql<ResetUserRow[]>`
                select
                    resets.id as reset_id,
                    users.id as user_id,
                    users.email,
                    users.created_at,
                    users.updated_at
                from ${sql(AUTH_TABLES.passwordResets)} resets
                inner join ${sql(AUTH_TABLES.users)} users on users.id = resets.user_id
                where resets.token_hash = ${tokenHash}
                    and resets.used_at is null
                    and resets.expires_at > ${now}
                limit 1
                for update of resets
            `;

				if (!resetRow) {
					throw new AuthError("INVALID_RESET_TOKEN", "Password reset token is invalid or expired");
				}

				const passwordHash = await hashPassword(input.newPassword);
				const [userRow] = await sql<UserRow[]>`
                update ${sql(AUTH_TABLES.users)}
                set password_hash = ${passwordHash},
                    updated_at = ${now}
                where id = ${resetRow.user_id}
                returning id, email, password_hash, created_at, updated_at
            `;

				if (!userRow) {
					throw new AuthError("INVALID_RESET_TOKEN", "Password reset user was not found");
				}

				await sql`
                update ${sql(AUTH_TABLES.passwordResets)}
                set used_at = ${now}
                where id = ${resetRow.reset_id}
            `;

				return new AuthWithSessionResult(
					toAuthUser(userRow),
					await createSession(sql, userRow.id, now),
				);
			});
		},

		async getSessionByToken(token: string): Promise<AuthSession | null> {
			const sql = getSql();
			const tokenBytes = Uint8Array.from(Buffer.from(token, "base64url"));
			const tokenHash = hashToken(tokenBytes);
			const now = new Date();
			const [sessionRow] = await sql<SessionRow[]>`
                select id, user_id, expires_at
                from ${sql(AUTH_TABLES.sessions)}
                where token_hash = ${tokenHash}
                    and invalidated_at is null
                    and expires_at > ${now}
                limit 1
            `;
			if (!sessionRow) {
				return null;
			}
			return toAuthSession(sessionRow, tokenBytes as AuthToken);
		},

		async invalidateSessionToken(input: { token: string }): Promise<InvalidateSessionTokenResult> {
			const sql = getSql();
			const tokenBytes = Uint8Array.from(Buffer.from(input.token, "base64url"));
			const tokenHash = hashToken(tokenBytes);
			const now = new Date();
			const invalidatedSessions = await sql<{ id: string }[]>`
            update ${sql(AUTH_TABLES.sessions)}
            set invalidated_at = ${now}
            where token_hash = ${tokenHash}
                and invalidated_at is null
                and expires_at > ${now}
            returning id
        `;

			return new InvalidateSessionTokenResult(invalidatedSessions.length > 0);
		},
	};
}

export type AuthService = ReturnType<typeof createAuth>;

export const auth = createAuth({ emailSender: stdoutEmailSender });
