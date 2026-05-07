import { createHash, randomBytes } from "node:crypto";

import type { AuthToken } from "./types.auth";

export function generateToken(): AuthToken {
	return Uint8Array.from(randomBytes(32));
}

export function hashToken(token: AuthToken): string {
	return createHash("sha256").update(token).digest("hex");
}
