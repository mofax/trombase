export type AuthErrorCode =
	| "INVALID_AUTH_INPUT"
	| "INVALID_CREDENTIALS"
	| "INVALID_RESET_TOKEN"
	| "SESSION_NOT_FOUND"
	| "USERNAME_TAKEN";

export type AuthToken = Uint8Array;

export * from "./dto.auth";
