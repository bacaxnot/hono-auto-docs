// src/config/index.ts
import type { HonoDocsConfig } from "../types";

/**
 * A no‑op helper to get TS inference and IDE support when
 * writing `export default defineConfig({...})` in userland.
 */
export function defineConfig<T extends HonoDocsConfig>(config: T): T {
  return config;
}
