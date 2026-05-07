export function bigIntToBytes(value: bigint, byteLength: number): Uint8Array {
	const bytes = new Uint8Array(byteLength);
	let remaining = value;
	for (let i = byteLength - 1; i >= 0; i--) {
		bytes[i] = Number(remaining & 0xffn);
		remaining >>= 8n;
	}
	return bytes;
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
	let value = 0n;
	for (const byte of bytes) {
		value = (value << 8n) + BigInt(byte);
	}
	return value;
}

export function randomBytes(len: number) {
	const buf = new Uint8Array(len);
	globalThis.crypto.getRandomValues(buf);
	return buf;
}

export function randomBigInt(len: number): bigint {
	return bytesToBigInt(randomBytes(len));
}
