import { defineConfig } from "vitest/config";

// Only the exporter. `npm run export:curve` writes export/curve.json; `npm test` does not.
export default defineConfig({
  test: {
    include: ["scripts/export-curve.ts"],
  },
});
