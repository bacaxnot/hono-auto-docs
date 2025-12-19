import type { Node, Project, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { extractJsDocFromHandler, type JsDocMetadata } from "./extractJsDoc.js";
import path from "node:path";
import fs from "node:fs";

export interface HandlerMetadata extends JsDocMetadata {
  path: string;
  method: string;
}

/**
 * Discover handlers from a Hono route file and extract their JSDoc metadata
 * @param project - ts-morph Project instance
 * @param routeFilePath - Absolute path to the route file (e.g., src/routes/accounts.ts)
 * @param rootPath - Root path of the project
 * @param tsConfigPath - Path to tsconfig.json for path alias resolution
 * @returns Map of "method path" -> metadata
 */
export function discoverHandlersFromRoute(
  project: Project,
  routeFilePath: string,
  rootPath: string,
  tsConfigPath?: string
): Map<string, HandlerMetadata> {
  const metadataMap = new Map<string, HandlerMetadata>();

  const sourceFile = project.getSourceFile(routeFilePath);
  if (!sourceFile) {
    return metadataMap;
  }

  // Find Hono app export (e.g., export const accountsApp = new Hono())
  const appExports = sourceFile.getVariableDeclarations().filter((decl) => {
    const initializer = decl.getInitializer();
    return initializer?.getText().includes("Hono()");
  });

  if (appExports.length === 0) {
    return metadataMap;
  }

  for (const appExport of appExports) {
    const initializer = appExport.getInitializer();
    if (!initializer) continue;

    // Parse method chain (.get(), .post(), .put(), etc.)
    parseMethodChain(
      initializer,
      sourceFile,
      project,
      metadataMap,
      rootPath,
      tsConfigPath
    );
  }

  return metadataMap;
}

/**
 * Parse Hono method chain to extract routes and their handlers
 */
function parseMethodChain(
  node: Node,
  sourceFile: SourceFile,
  project: Project,
  metadataMap: Map<string, HandlerMetadata>,
  rootPath: string,
  tsConfigPath?: string
) {
  // Get all call expressions in the chain
  const callExpressions = node.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of callExpressions) {
    const expression = call.getExpression();
    const expressionText = expression.getText();

    // Match .get(), .post(), .put(), .patch(), .delete()
    const methodMatch = expressionText.match(/\.(get|post|put|patch|delete)$/);
    if (!methodMatch) continue;

    const method = methodMatch[1].toLowerCase();
    const args = call.getArguments();

    if (args.length < 1) continue;

    // First argument is the path
    const pathArg = args[0];
    let routePath = pathArg.getText().replace(/['"]/g, "");

    // Normalize path: remove leading/trailing slashes for consistency
    if (routePath !== "/") {
      routePath = routePath.replace(/^\/+|\/+$/g, "");
      if (routePath) routePath = `/${routePath}`;
      else routePath = "/";
    }

    // Find spread handler arguments (e.g., ...getAccountsHandlers)
    const spreadArgs = args.filter((arg) =>
      arg.getText().startsWith("...")
    );

    if (spreadArgs.length === 0) continue;

    // Get handler name
    const handlerName = spreadArgs[0].getText().replace(/^\.\.\./g, "");

    // Trace import to find source file
    const handlerSourcePath = traceHandlerImport(
      sourceFile,
      handlerName,
      rootPath,
      tsConfigPath
    );

    if (!handlerSourcePath) continue;

    // Load handler source file
    let handlerFile = project.getSourceFile(handlerSourcePath);
    if (!handlerFile) {
      // Try adding .ts extension if not found
      const withExt = handlerSourcePath.endsWith(".ts")
        ? handlerSourcePath
        : `${handlerSourcePath}.ts`;
      handlerFile = project.addSourceFileAtPath(withExt);
    }

    if (!handlerFile) continue;

    // Extract JSDoc metadata
    const jsDocMeta = extractJsDocFromHandler(handlerFile, handlerName);
    if (!jsDocMeta) continue;

    // Create key: "method path"
    const key = `${method} ${routePath}`;
    metadataMap.set(key, {
      path: routePath,
      method,
      ...jsDocMeta,
    });
  }
}

/**
 * Trace an imported handler back to its source file
 */
function traceHandlerImport(
  sourceFile: SourceFile,
  handlerName: string,
  rootPath: string,
  tsConfigPath?: string
): string | null {
  // Find the import declaration for this handler
  const importDecl = sourceFile.getImportDeclaration((decl) => {
    const namedImports = decl.getNamedImports();
    return namedImports.some((imp) => imp.getName() === handlerName);
  });

  if (!importDecl) return null;

  // Get the import path
  const importPath = importDecl.getModuleSpecifierValue();

  // Resolve the import path
  return resolveImportPath(
    sourceFile.getFilePath(),
    importPath,
    rootPath,
    tsConfigPath
  );
}

/**
 * Resolve import path to absolute file path
 * Handles relative paths, TypeScript path aliases, and node_modules
 */
function resolveImportPath(
  currentFilePath: string,
  importPath: string,
  rootPath: string,
  tsConfigPath?: string
): string | null {
  // Handle relative imports (./foo or ../bar)
  if (importPath.startsWith(".")) {
    const dir = path.dirname(currentFilePath);
    const resolved = path.resolve(dir, importPath);

    // Try with .ts extension
    if (fs.existsSync(`${resolved}.ts`)) {
      return `${resolved}.ts`;
    }
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    return null;
  }

  // Handle path aliases (e.g., ~/foo or @/foo)
  if (tsConfigPath && (importPath.startsWith("~") || importPath.startsWith("@"))) {
    const tsConfig = loadTsConfig(tsConfigPath);
    if (tsConfig?.compilerOptions?.paths) {
      const resolved = resolvePathAlias(
        importPath,
        tsConfig.compilerOptions.paths,
        rootPath,
        tsConfig.compilerOptions.baseUrl
      );
      if (resolved) return resolved;
    }
  }

  // Handle absolute imports from src (common convention)
  const srcPath = path.join(rootPath, "src", importPath);
  if (fs.existsSync(`${srcPath}.ts`)) {
    return `${srcPath}.ts`;
  }
  if (fs.existsSync(srcPath)) {
    return srcPath;
  }

  return null;
}

interface TsConfig {
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
}

/**
 * Load and parse tsconfig.json
 */
function loadTsConfig(tsConfigPath: string): TsConfig | null {
  try {
    const content = fs.readFileSync(tsConfigPath, "utf-8");
    // Remove comments (simple approach, not perfect but works for most cases)
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    return JSON.parse(cleanContent);
  } catch {
    return null;
  }
}

/**
 * Resolve TypeScript path alias
 */
function resolvePathAlias(
  importPath: string,
  paths: Record<string, string[]>,
  rootPath: string,
  baseUrl?: string
): string | null {
  const base = baseUrl ? path.join(rootPath, baseUrl) : rootPath;

  for (const [alias, targets] of Object.entries(paths)) {
    // Convert alias pattern to regex (e.g., "~/*" -> "^~/(.*)")
    const aliasPattern = alias.replace(/\*/g, "(.*)");
    const regex = new RegExp(`^${aliasPattern}$`);
    const match = importPath.match(regex);

    if (match) {
      // Replace wildcard in target with captured group
      for (const target of targets) {
        const resolvedTarget = target.replace(/\*/g, match[1] || "");
        const fullPath = path.join(base, resolvedTarget);

        // Try with .ts extension
        if (fs.existsSync(`${fullPath}.ts`)) {
          return `${fullPath}.ts`;
        }
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }
  }

  return null;
}
