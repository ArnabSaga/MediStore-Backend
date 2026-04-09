import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/server.ts",
  },
  format: ["esm"],
  outDir: "api",
  splitting: false,
  sourcemap: true,
  clean: false,
  minify: true,
  dts: false,
  outExtension() {
    return {
      js: ".mjs",
    };
  },
});
