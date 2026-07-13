import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm"],
  outDir: "api",
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  dts: false,
  outExtension() {
    return {
      js: ".mjs",
    };
  },
});
