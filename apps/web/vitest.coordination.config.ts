import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./core", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: { environment: "node", include: ["tests/coordination.test.tsx"] },
});
