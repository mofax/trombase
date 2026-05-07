interface PasswordHashResult {
	hash: string;
	salt: string;
	iterations: number;
}

/**
 * Validates input parameters to prevent injection or weak configurations.
 */
function guardPasswordInputs(password: string, iterations: number): void {
	if (!password || typeof password !== "string" || password.trim().length === 0) {
		throw new Error("Cryptographic Failure: Password must be a non-empty string.");
	}
	if (!Number.isInteger(iterations) || iterations < 600000) {
		throw new Error("Cryptographic Failure: Iteration count must be an integer >= 600,000.");
	}
}

/**
 * Converts a hex string securely back into a Uint8Array.
 */
function hexToUint8Array(hexString: string, context: string): Uint8Array {
	if (!hexString || typeof hexString !== "string" || hexString.length % 2 !== 0) {
		throw new Error(`Cryptographic Failure: Invalid hex string formatting for ${context}.`);
	}
	const matches = hexString.match(/.{1,2}/g);
	if (!matches) {
		throw new Error(`Cryptographic Failure: Failed to parse hex string for ${context}.`);
	}
	return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

/**
 * Securely hashes a plaintext password using PBKDF2.
 */
async function hashPassword(
	password: string,
	iterations: number = 600000,
): Promise<PasswordHashResult> {
	// 1. Enforce runtime guards
	guardPasswordInputs(password, iterations);

	const encoder = new TextEncoder();

	// 2. Generate a unique, cryptographically strong salt (16 bytes minimum)
	const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));

	// 3. Import raw password string into a WebCrypto usable CryptoKey
	const passwordKey = await globalThis.crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);

	// 4. Derive bits using PBKDF2 with SHA-256
	const derivedBits = await globalThis.crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt: salt,
			iterations: iterations,
			hash: "SHA-256",
		},
		passwordKey,
		256, // Output length: 256 bits (32 bytes)
	);

	// 5. Safely map byte arrays to hexadecimal strings
	const hashHex = Array.from(new Uint8Array(derivedBits))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	const saltHex = Array.from(salt)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	return {
		hash: hashHex,
		salt: saltHex,
		iterations,
	};
}

/**
 * Verifies an incoming login password against a previously stored hash and salt.
 */
async function verifyPassword(
	passwordInput: string,
	storedHashHex: string,
	storedSaltHex: string,
	iterations: number = 600000,
): Promise<boolean> {
	// 1. Enforce runtime guards on the text and configuration inputs
	guardPasswordInputs(passwordInput, iterations);

	// 2. Parse and guard hex structures
	const storedSalt = hexToUint8Array(storedSaltHex, "salt");
	const storedHash = hexToUint8Array(storedHashHex, "hash");

	if (storedSalt.length < 16) {
		throw new Error("Cryptographic Failure: Stored salt length is dangerously short.");
	}

	const encoder = new TextEncoder();

	// 3. Import input password for derivation
	const passwordKey = await globalThis.crypto.subtle.importKey(
		"raw",
		encoder.encode(passwordInput),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);

	// 4. Regenerate hash using original salt and parameters
	const derivedBits = await globalThis.crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt: new Uint8Array(storedSalt),
			iterations: iterations,
			hash: "SHA-256",
		},
		passwordKey,
		256,
	);

	const generatedHash = new Uint8Array(derivedBits);

	// 5. Fail early if lengths don't match (prevents index overflow issues)
	if (generatedHash.length !== storedHash.length) {
		return false;
	}

	// 6. comparison
	let mismatch = 0;
	for (let i = 0; i < generatedHash.length; i++) {
		mismatch |= generatedHash[i]! ^ storedHash[i]!;
	}

	return mismatch === 0;
}

export const Passwords = {
	hashPassword,
	verifyPassword,
} as const;
