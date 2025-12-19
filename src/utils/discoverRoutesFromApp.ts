import type { Project, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ApiGroup } from "../types/index.js";
import path from "node:path";
import fs from "node:fs";

interface DiscoveredRoute {
  prefix: string;
  appName: string;
  appTypePath: string;
}

/**
 * Discover all routes from a main app file by parsing .route() calls
 * @param project - ts-morph Project instance
 * @param appPath - Path to the main app file (e.g., "src/index.ts")
 * @param rootPath - Root path of the project
 * @param tsConfigPath - Path to tsconfig.json for path alias resolution
 * @returns Array of ApiGroup objects with discovered routes
 */
export function discoverRoutesFromApp(
  project: Project,
  appPath: string,
  rootPath: string,
  tsConfigPath?: string
): ApiGroup[] {
  const fullAppPath = path.join(rootPath, appPath);
  const sourceFile = project.getSourceFile(fullAppPath) || project.addSourceFileAtPath(fullAppPath);

  if (!sourceFile) {
    throw new Error(`Could not load app file: ${fullAppPath}`);
  }

  const routes = extractRouteCalls(sourceFile);
  const apiGroups: ApiGroup[] = [];

  for (const route of routes) {
    const routeFilePath = resolveRouteImport(
      sourceFile,
      route.appName,
      rootPath,
      tsConfigPath
    );

    if (routeFilePath) {
      apiGroups.push({
        apiPrefix: route.prefix,
        appTypePath: path.relative(rootPath, routeFilePath),
        name: "", // Will be set by normalizeApiGroup
      });
    }
  }

  return apiGroups;
}

/**
 * Extract all .route() calls from a Hono app file
 */
function extractRouteCalls(sourceFile: SourceFile): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];

  // Find all call expressions in the file
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of callExpressions) {
    const expression = call.getExpression();
    const expressionText = expression.getText();

    // Match .route() calls
    if (!expressionText.endsWith(".route")) continue;

    const args = call.getArguments();
    if (args.length < 2) continue;

    // First argument is the prefix (string literal)
    const prefixArg = args[0];
    const prefix = prefixArg.getText().replace(/['"]/g, "");

    // Second argument is the app variable
    const appArg = args[1];
    const appName = appArg.getText();

    routes.push({ prefix, appName, appTypePath: "" });
  }

  return routes;
}

/**
 * Resolve a route app import to its file path
 */
function resolveRouteImport(
  sourceFile: SourceFile,
  appName: string,
  rootPath: string,
  tsConfigPath?: string
): string | null {
  // Find the import declaration for this app
  const importDecl = sourceFile.getImportDeclaration((decl) => {
    const namedImports = decl.getNamedImports();
    return namedImports.some((imp) => imp.getName() === appName);
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
