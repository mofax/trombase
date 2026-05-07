export function unsafe_ignoreThrow<T>(fn: () => T) {
	try {
		return fn();
	} catch (err) {
		console.error(err);
	}
}

export async function unsafe_ignoreThrowAsync<T>(fn: () => Promise<T>) {
	try {
		return await fn();
	} catch (err) {
		console.error(err);
	}
}

export const promises = {
	sleep(num: number) {
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				resolve();
			}, num);
		});
	},
};
