import { serializeValue } from "./serialize";

export type SqlParams = {
	params: unknown[];
	add(value: unknown): string;
};

export function createSqlParams(): SqlParams {
	const params: unknown[] = [];
	return {
		params,
		add(value: unknown): string {
			params.push(serializeValue(value));
			return `$${params.length}`;
		},
	};
}
