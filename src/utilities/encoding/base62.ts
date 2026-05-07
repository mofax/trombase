const base62Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function encodeBase62(bytes: Uint8Array): string {
	if (bytes.length === 0) return "0";

	const input = Array.from(bytes);
	const chars: string[] = [];

	while (input.some((b) => b !== 0)) {
		let remainder = 0;
		for (let i = 0; i < input.length; i++) {
			const current = remainder * 256 + (input[i] ?? 0);
			input[i] = Math.floor(current / 62);
			remainder = current % 62;
		}
		chars.push(base62Alphabet[remainder] ?? "0");
	}

	return chars.reverse().join("") || "0";
}

export function decodeBase62(value: string): Uint8Array {
	if (!value) {
		throw new Error("decodeBase62: input string is empty");
	}

	const bytes: number[] = [0];

	for (const char of value) {
		const digit = base62Alphabet.indexOf(char);
		if (digit < 0) {
			throw new Error("decodeBase62: input string is not valid base62");
		}

		let carry = digit;
		for (let i = bytes.length - 1; i >= 0; i--) {
			const current = (bytes[i] ?? 0) * 62 + carry;
			bytes[i] = current & 0xff;
			carry = current >> 8;
		}

		while (carry > 0) {
			bytes.unshift(carry & 0xff);
			carry >>= 8;
		}
	}

	return new Uint8Array(bytes);
}
