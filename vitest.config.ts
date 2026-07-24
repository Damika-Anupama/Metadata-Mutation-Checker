import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // lib/ is pure logic — no DOM needed.
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
