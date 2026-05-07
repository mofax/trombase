export const AUTH_TABLES = {
	users: "trom_auth_users",
	sessions: "trom_auth_sessions",
	passwordResets: "trom_auth_password_resets",
} as const;

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;
