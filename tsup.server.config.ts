import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server.ts",
  },
  format: ["esm"],
  outDir: "dist",
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
