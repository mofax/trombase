import { decodeBase62, encodeBase62 } from "../utilities/encoding/base62";
import { bigIntToBytes, bytesToBigInt, randomBytes } from "../utilities/random";

function getRandomId(): Uint8Array {
	const bytes = randomBytes(8);
	bytes[0] = (bytes[0] ?? 0) | 0x80;
	return bytes;
}

export class DbId {
	private readonly value: Uint8Array;

	constructor(value: Uint8Array) {
		const highByte = value[0];
		if (value.length !== 8) {
			throw new TypeError("Expect input to be 8 bytes long");
		}
		if (highByte === undefined || (highByte & 0x80) === 0) {
			throw new TypeError("DbId value must be a 64-bit value with the first bit set");
		}

		this.value = Uint8Array.from(value);
	}

	static init(): DbId {
		return new DbId(getRandomId());
	}

	static fromBigInt(value: bigint): DbId {
		return new DbId(bigIntToBytes(value, 8));
	}

	static fromString(value: string): DbId {
		return new DbId(decodeBase62(value));
	}

	toBigInt(): bigint {
		return bytesToBigInt(this.value);
	}

	toString(): string {
		return encodeBase62(this.value);
	}

	toJSON(): string {
		return this.toString();
	}
}
