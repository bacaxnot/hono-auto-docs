import type { Project } from "ts-morph";
import type { OpenAPIV3 } from "openapi-types";

/**
 * The base OpenAPI configuration, excluding dynamically generated fields.
 *
 * This config maps directly to the OpenAPI 3.0 `Document` type,
 * excluding `paths`, `components`, and `tags` which are generated.
 */
export type OpenAPIConfig = Omit<
  OpenAPIV3.Document,
  "paths" | "components" | "tags"
>;

/**
 * Internal representation of a route group after discovery/normalization.
 * Users never directly create this - it's built from appPath or string paths + JSDoc.
 */
export type ApiGroup = {
  /**
   * URL prefix applied to all paths within this group (e.g., `/accounts`).
   * Comes from .route() calls (appPath mode) or JSDoc @prefix / filename (apis mode).
   */
  apiPrefix: string;

  /**
   * File path to the route module (e.g., "src/routes/accounts.ts").
   */
  appTypePath: string;

  /**
   * Human-readable name for the group, shown in OpenAPI tags.
   * Comes from JSDoc @name or filename convention.
   */
  name: string;
};

/**
 * Route-level JSDoc metadata that can be defined on the route app export
 */
export type RouteMetadata = {
  /**
   * API prefix override from JSDoc @prefix tag
   */
  prefix?: string;

  /**
   * Group name override from JSDoc @name tag
   */
  name?: string;
};

/**
 * Top-level configuration object for hono-auto-docs.
 * Enforces JSDoc-only approach - no manual object configuration.
 */
export type HonoDocsConfig = {
  /**
   * Path to your `tsconfig.json`.
   */
  tsConfigPath: string;

  /**
   * Static parts of the OpenAPI document (title, version, servers, etc.).
   */
  openApi: OpenAPIConfig;

  /**
   * Output configuration for generated files.
   */
  outputs: {
    /**
     * File path where the generated `openapi.json` should be saved.
     */
    openApiJson: string;
  };

  /**
   * Path to the main app file where routes are mounted via .route() calls.
   * Automatically discovers all routes and their prefixes.
   * Example: "src/index.ts"
   *
   * Mutually exclusive with `apis` - use either `appPath` or `apis`, not both.
   */
  appPath?: string;

  /**
   * List of route file paths to generate docs for.
   * Each path auto-discovers apiPrefix from JSDoc @prefix or filename.
   * Example: ["src/routes/accounts.ts", "src/routes/transactions.ts"]
   *
   * All metadata comes from JSDoc (@prefix, @name, @summary, @description, @tags).
   * Mutually exclusive with `appPath` - use either `appPath` or `apis`, not both.
   */
  apis?: string[];

  /**
   * Optional raw string content to inject at the top of each generated `.d.ts` snapshot.
   */
  preDefineTypeContent?: string;
};

/**
 * Used to track a source route definition's `AppType` and friendly name.
 */
export type AppTypeSnapshotPath = {
  /**
   * File path to the AppType export.
   */
  appTypePath: string;

  /**
   * Human-readable name for this route module.
   */
  name: string;
};

/**
 * Represents a single OpenAPI spec file output path.
 */
export type OpenApiPath = {
  /**
   * Path to the generated `openapi.json` file.
   */
  openApiPath: string;
};

/**
 * Parameters required to generate the OpenAPI spec and TypeScript snapshots.
 */
export type GenerateParams = {
  /**
   * Full hono-docs configuration object.
   */
  config: HonoDocsConfig;

  /**
   * Path to the output directory for emitted `.d.ts` files (typically inside `node_modules`).
   */
  libDir: string;

  /**
   * ts-morph project instance for analyzing TypeScript code.
   */
  project: Project;

  /**
   * Root path of the user’s project.
   */
  rootPath: string;

  /**
   * File name for the `.d.ts` output snapshot.
   */
  fileName: string;

  /**
   * Output directory for the OpenAPI and snapshot files.
   */
  outputRoot: string;
};
