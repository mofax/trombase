import type { AuthErrorCode } from "./auth/types.auth";

export class TromError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TromError";
	}
}

export class DTOValidationError extends TromError {
	constructor(message: string) {
		super(message);
		this.name = "DTOValidationError";
	}
}

export class PermissionError extends TromError {
	constructor(message: string) {
		super(message);
		this.name = "PermissionError";
	}
}

export class AuthError extends TromError {
	constructor(
		public readonly code: AuthErrorCode,
		message: string,
	) {
		super(message);
		this.name = "AuthError";
	}
}
