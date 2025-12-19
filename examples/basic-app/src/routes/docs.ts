// src/routes/docs.ts
import { Hono } from "hono";
import { Scalar } from "@scalar/hono-api-reference";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * @name Documentation
 */
const docs = new Hono()
  /**
   * API Documentation UI
   * @summary View API documentation
   * @description Interactive API documentation powered by Scalar
   * @tags Documentation
   */
  .get(
    "/",
    Scalar({
      url: "/api/docs/open-api",
      theme: "kepler",
      layout: "modern",
      defaultHttpClient: { targetKey: "js", clientKey: "axios" },
    })
  )
  /**
   * OpenAPI Specification
   * @summary Get OpenAPI JSON spec
   * @description Returns the complete OpenAPI 3.0 specification
   * @tags Documentation
   */
  .get("/open-api", async (c) => {
    const raw = await fs.readFile(
      path.join(process.cwd(), "./openapi/openapi.json"),
      "utf-8"
    );
    return c.json(JSON.parse(raw));
  });

export type AppType = typeof docs;
export default docs;
