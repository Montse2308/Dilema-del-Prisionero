import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // La grilla y las 400 generaciones viven en ese archivo para poder
    // repetirlas. No son regresión: `curve.test.ts` fija el veredicto.
    exclude: [
      "test/curve-sweep.test.ts",
      "**/node_modules/**",
      "**/dist/**",
    ],
  },
});
