import { defineConfig } from "@bacaxnot/hono-auto-docs";

export default defineConfig({
  tsConfigPath: "./tsconfig.json",
  openApi: {
    openapi: "3.0.0",
    info: { title: "Basic App API", version: "1.0.0" },
    servers: [{ url: "http://localhost:3000/api" }],
  },
  outputs: {
    openApiJson: "./openapi/openapi.json",
  },
  // ✅ Fully automatic mode - auto-discovers all routes from .route() calls
  appPath: "src/index.ts",
});
