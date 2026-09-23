import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The grid and the 400-generation runs live in that file so they can be
    // repeated. They are not the regression: `curve.test.ts` locks the verdict.
    exclude: [
      "test/curve-sweep.test.ts",
      "**/node_modules/**",
      "**/dist/**",
    ],
  },
});
