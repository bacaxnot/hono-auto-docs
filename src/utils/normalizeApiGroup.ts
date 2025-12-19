import type { Project, SourceFile } from "ts-morph";
import type { ApiGroup, RouteMetadata } from "../types/index.js";
import path from "node:path";

/**
 * Extract route-level JSDoc metadata from route app export
 * Looks for @prefix, @name tags
 */
function extractRouteMetadata(sourceFile: SourceFile): RouteMetadata {
  const metadata: RouteMetadata = {};

  // Find Hono app exports (e.g., export const accountsApp = new Hono())
  const appExports = sourceFile.getVariableDeclarations().filter((decl) => {
    const initializer = decl.getInitializer();
    return initializer?.getText().includes("Hono()");
  });

  if (appExports.length === 0) {
    return metadata;
  }

  // Get JSDoc from the first app export
  const appExport = appExports[0];
  const varStatement = appExport.getVariableStatement();
  if (!varStatement) {
    return metadata;
  }

  const jsDocs = varStatement.getJsDocs();
  if (jsDocs.length === 0) {
    return metadata;
  }

  const jsDoc = jsDocs[0];
  const tags = jsDoc.getTags();

  // Extract @prefix
  const prefixTag = tags.find((tag) => tag.getTagName() === "prefix");
  if (prefixTag) {
    const comment = prefixTag.getComment();
    metadata.prefix = typeof comment === "string" ? comment : comment?.map((c) => c.getText()).join("");
  }

  // Extract @name
  const nameTag = tags.find((tag) => tag.getTagName() === "name");
  if (nameTag) {
    const comment = nameTag.getComment();
    metadata.name = typeof comment === "string" ? comment : comment?.map((c) => c.getText()).join("");
  }

  return metadata;
}

/**
 * Generate name from filename
 * Examples:
 *   "accounts.ts" -> "Accounts"
 *   "user-profile.ts" -> "User Profile"
 *   "api-keys.ts" -> "Api Keys"
 */
function generateNameFromFilename(filename: string): string {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.(ts|js)$/, "");

  // Split on hyphens, underscores, or camelCase
  const words = nameWithoutExt
    .split(/[-_]|(?=[A-Z])/)
    .filter((w) => w.length > 0);

  // Capitalize each word
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Generate API prefix from filename
 * Examples:
 *   "accounts.ts" -> "/accounts"
 *   "user-profile.ts" -> "/user-profile"
 */
function generatePrefixFromFilename(filename: string): string {
  const nameWithoutExt = filename.replace(/\.(ts|js)$/, "");
  return `/${nameWithoutExt}`;
}

/**
 * Normalize a string path or ApiGroup object to a full ApiGroup
 * @param api - Either a file path string or full ApiGroup object
 * @param project - ts-morph Project for reading JSDoc
 * @param rootPath - Root path of the project
 * @returns Normalized ApiGroup object
 */
export function normalizeApiGroup(
  api: string | ApiGroup,
  project: Project,
  rootPath: string
): ApiGroup {
  // If it's an object with a non-empty name, return as-is (fully configured)
  if (typeof api !== "string" && api.name) {
    return api;
  }

  // It's either a string path, or an object that needs name auto-discovery
  const appTypePath = typeof api === "string" ? api : api.appTypePath;
  const filename = path.basename(appTypePath);

  // Try to extract JSDoc metadata from the route file
  const fullPath = path.join(rootPath, appTypePath);
  const sourceFile = project.getSourceFile(fullPath) || project.addSourceFileAtPath(fullPath);

  const routeMetadata = sourceFile ? extractRouteMetadata(sourceFile) : {};

  // Priority: JSDoc @name > convention (filename)
  const name = routeMetadata.name || generateNameFromFilename(filename);

  // If it's a string, also auto-discover the prefix
  if (typeof api === "string") {
    // Priority: JSDoc @prefix > convention (filename)
    const apiPrefix = routeMetadata.prefix || generatePrefixFromFilename(filename);

    return {
      appTypePath,
      apiPrefix,
      name,
      // No api array - let JSDoc on handlers provide all metadata
    };
  }

  // It's an object with apiPrefix already set (from route discovery)
  // Just fill in the name
  return {
    ...api,
    name,
  };
}
