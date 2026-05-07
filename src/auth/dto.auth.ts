import { DTOValidationError } from "../errors";
import { isBoolean, isNumber, isRecord, isString } from "../utilities/type-guards";
import { MIN_PASSWORD_LENGTH } from "./constants.auth";
import type { AuthToken } from "./types.auth";

function assertRecord(value: unknown, name: string): Record<string, unknown> {
	if (!isRecord(value)) {
		throw new DTOValidationError(`${name} must be an object`);
	}
	return value;
}

function assertString(value: unknown, name: string): string {
	if (!isString(value)) {
		throw new DTOValidationError(`${name} must be a string`);
	}
	return value;
}

function assertNonEmptyString(value: unknown, name: string): string {
	const stringValue = assertString(value, name);
	if (!stringValue.trim()) {
		throw new DTOValidationError(`${name} must not be empty`);
	}
	return stringValue;
}

function assertEmail(value: unknown, name: string): string {
	const email = assertNonEmptyString(value, name);
	if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
		throw new DTOValidationError(`${name} must be a valid email address`);
	}
	return email;
}

function assertPassword(value: unknown, name: string): string {
	const password = assertString(value, name);
	if (password.length < MIN_PASSWORD_LENGTH) {
		throw new DTOValidationError(`${name} must be at least ${MIN_PASSWORD_LENGTH} characters`);
	}
	return password;
}

function assertBoolean(value: unknown, name: string): boolean {
	if (!isBoolean(value)) {
		throw new DTOValidationError(`${name} must be a boolean`);
	}
	return value;
}

function assertNumber(value: unknown, name: string): number {
	if (!isNumber(value)) {
		throw new DTOValidationError(`${name} must be a number`);
	}
	return value;
}

function assertDate(value: unknown, name: string): Date {
	const epochMilliseconds = assertNumber(value, name);
	if (!Number.isFinite(epochMilliseconds)) {
		throw new DTOValidationError(`${name} must be an epoch millisecond number`);
	}

	const date = new Date(epochMilliseconds);
	if (Number.isNaN(date.getTime())) {
		throw new DTOValidationError(`${name} must be a valid epoch millisecond number`);
	}
	return date;
}

function assertToken(value: unknown, name: string): AuthToken {
	const encoded = assertString(value, name);
	if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
		throw new DTOValidationError(`${name} must be a non-empty base64url string`);
	}

	const token = Uint8Array.from(Buffer.from(encoded, "base64url"));
	if (token.byteLength === 0 || Buffer.from(token).toString("base64url") !== encoded) {
		throw new DTOValidationError(`${name} must be a valid base64url token`);
	}
	return token;
}

function tokenToJSON(token: AuthToken): string {
	if (token.byteLength === 0) {
		throw new DTOValidationError("token must not be empty");
	}
	return Buffer.from(token).toString("base64url");
}

export class AuthUser {
	public readonly id: string;
	public readonly email: string;
	public readonly createdAt: Date;
	public readonly updatedAt: Date;

	constructor(id: string, email: string, createdAt: Date, updatedAt: Date) {
		this.id = assertNonEmptyString(id, "AuthUser.id");
		this.email = assertEmail(email, "AuthUser.email");
		this.createdAt = createdAt;
		this.updatedAt = updatedAt;
	}

	toJSON() {
		return {
			id: this.id,
			email: this.email,
			createdAt: this.createdAt.getTime(),
			updatedAt: this.updatedAt.getTime(),
		};
	}

	static fromJSON(value: unknown): AuthUser {
		const json = assertRecord(value, "AuthUser");
		return new AuthUser(
			assertNonEmptyString(json.id, "AuthUser.id"),
			assertEmail(json.email, "AuthUser.email"),
			assertDate(json.createdAt, "AuthUser.createdAt"),
			assertDate(json.updatedAt, "AuthUser.updatedAt"),
		);
	}
}

export class AuthSession {
	constructor(
		public readonly id: string,
		public readonly userId: string,
		public readonly token: AuthToken,
		public readonly expiresAt: Date,
	) {}

	toJSON() {
		return {
			id: this.id,
			userId: this.userId,
			token: tokenToJSON(this.token),
			expiresAt: this.expiresAt.getTime(),
		};
	}

	static fromJSON(value: unknown): AuthSession {
		const json = assertRecord(value, "AuthSession");
		return new AuthSession(
			assertNonEmptyString(json.id, "AuthSession.id"),
			assertNonEmptyString(json.userId, "AuthSession.userId"),
			assertToken(json.token, "AuthSession.token"),
			assertDate(json.expiresAt, "AuthSession.expiresAt"),
		);
	}
}

export class AuthWithSessionResult {
	constructor(
		public readonly user: AuthUser,
		public readonly session: AuthSession,
	) {}

	toJSON() {
		return {
			user: this.user.toJSON(),
			session: this.session.toJSON(),
		};
	}

	static fromJSON(value: unknown): AuthWithSessionResult {
		const json = assertRecord(value, "AuthWithSessionResult");
		return new AuthWithSessionResult(
			AuthUser.fromJSON(json.user),
			AuthSession.fromJSON(json.session),
		);
	}
}

export class RegisterWithUsernamePasswordInput {
	public readonly email: string;
	public readonly password: string;

	constructor(email: string, password: string) {
		this.email = assertEmail(email, "RegisterWithUsernamePasswordInput.email");
		this.password = assertPassword(password, "RegisterWithUsernamePasswordInput.password");
	}

	toJSON() {
		return {
			email: this.email,
			password: this.password,
		};
	}

	static fromJSON(value: unknown): RegisterWithUsernamePasswordInput {
		const json = assertRecord(value, "RegisterWithUsernamePasswordInput");
		return new RegisterWithUsernamePasswordInput(
			assertEmail(json.email, "RegisterWithUsernamePasswordInput.email"),
			assertPassword(json.password, "RegisterWithUsernamePasswordInput.password"),
		);
	}
}

export class LoginWithUsernamePasswordInput {
	public readonly email: string;
	public readonly password: string;

	constructor(email: string, password: string) {
		this.email = assertEmail(email, "LoginWithUsernamePasswordInput.email");
		this.password = assertNonEmptyString(password, "LoginWithUsernamePasswordInput.password");
	}

	toJSON() {
		return {
			email: this.email,
			password: this.password,
		};
	}

	static fromJSON(value: unknown): LoginWithUsernamePasswordInput {
		const json = assertRecord(value, "LoginWithUsernamePasswordInput");
		return new LoginWithUsernamePasswordInput(
			assertEmail(json.email, "LoginWithUsernamePasswordInput.email"),
			assertNonEmptyString(json.password, "LoginWithUsernamePasswordInput.password"),
		);
	}
}

export class RequestPasswordResetInput {
	public readonly email: string;

	constructor(email: string) {
		this.email = assertEmail(email, "RequestPasswordResetInput.email");
	}

	toJSON() {
		return {
			email: this.email,
		};
	}

	static fromJSON(value: unknown): RequestPasswordResetInput {
		const json = assertRecord(value, "RequestPasswordResetInput");
		return new RequestPasswordResetInput(
			assertEmail(json.email, "RequestPasswordResetInput.email"),
		);
	}
}

export class RequestPasswordResetResult {
	public readonly accepted = true;

	toJSON() {
		return {
			accepted: this.accepted,
		};
	}

	static fromJSON(value: unknown): RequestPasswordResetResult {
		const json = assertRecord(value, "RequestPasswordResetResult");
		if (assertBoolean(json.accepted, "RequestPasswordResetResult.accepted") !== true) {
			throw new DTOValidationError("RequestPasswordResetResult.accepted must be true");
		}
		return new RequestPasswordResetResult();
	}
}

export class ValidatePasswordResetInput {
	constructor(
		public readonly token: string,
		public readonly newPassword: string,
	) {
		assertNonEmptyString(token, "ValidatePasswordResetInput.token");
	}

	toJSON() {
		return {
			token: this.token,
			newPassword: this.newPassword,
		};
	}

	static fromJSON(value: unknown): ValidatePasswordResetInput {
		const json = assertRecord(value, "ValidatePasswordResetInput");
		return new ValidatePasswordResetInput(
			assertNonEmptyString(json.token, "ValidatePasswordResetInput.token"),
			assertPassword(json.newPassword, "ValidatePasswordResetInput.newPassword"),
		);
	}
}

export class InvalidateSessionTokenInput {
	constructor(public readonly token: string) {
		assertNonEmptyString(token, "InvalidateSessionTokenInput.token");
	}

	toJSON() {
		return {
			token: this.token,
		};
	}

	static fromJSON(value: unknown): InvalidateSessionTokenInput {
		const json = assertRecord(value, "InvalidateSessionTokenInput");
		return new InvalidateSessionTokenInput(
			assertNonEmptyString(json.token, "InvalidateSessionTokenInput.token"),
		);
	}
}

export class InvalidateSessionTokenResult {
	constructor(public readonly invalidated: boolean) {}

	toJSON() {
		return {
			invalidated: this.invalidated,
		};
	}

	static fromJSON(value: unknown): InvalidateSessionTokenResult {
		const json = assertRecord(value, "InvalidateSessionTokenResult");
		return new InvalidateSessionTokenResult(
			assertBoolean(json.invalidated, "InvalidateSessionTokenResult.invalidated"),
		);
	}
}

export class PasswordResetDelivery {
	constructor(
		public readonly user: AuthUser,
		public readonly token: AuthToken,
		public readonly expiresAt: Date,
	) {}

	toJSON() {
		return {
			user: this.user.toJSON(),
			token: tokenToJSON(this.token),
			expiresAt: this.expiresAt.getTime(),
		};
	}

	static fromJSON(value: unknown): PasswordResetDelivery {
		const json = assertRecord(value, "PasswordResetDelivery");
		return new PasswordResetDelivery(
			AuthUser.fromJSON(json.user),
			assertToken(json.token, "PasswordResetDelivery.token"),
			assertDate(json.expiresAt, "PasswordResetDelivery.expiresAt"),
		);
	}
}
