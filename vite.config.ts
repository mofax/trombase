import { defineConfig } from "vite-plus";

export default defineConfig({
	pack: {
		entry: ["src/main.ts"],
		dts: true,
		format: ["esm"],
		sourcemap: false,
		exports: false,
	},
});
