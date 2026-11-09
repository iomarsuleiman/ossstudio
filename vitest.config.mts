import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["convex/**/*.test.ts", "lib/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
