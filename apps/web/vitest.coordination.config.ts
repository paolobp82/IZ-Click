import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@plane/types": fileURLToPath(new URL("../../packages/types/src/enums.ts", import.meta.url)), "@": fileURLToPath(new URL("./core", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: { environment: "node", include: ["tests/*coordination.test.tsx"] },
});
