import { defineConfig } from "vitest/config";

// Only the reproduction runs. `npm run reproduce` writes results/; `npm test` does not.
// One file at a time, so each run's durationMs is not shared with another.
export default defineConfig({
  test: {
    include: ["scripts/reproduce/r[1-6]-*.ts"],
    fileParallelism: false,
    // Print each run's summary even though the run passes. Vitest picks a
    // reporter that hides logs when it detects an agent or CI; this one does not.
    reporters: ["default"],
    silent: false,
    testTimeout: 3_600_000,
  },
});
