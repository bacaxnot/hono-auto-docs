import fs from "node:fs";
import path, { resolve } from "node:path";
import { Project } from "ts-morph";
import { loadConfig } from "../config/loadConfig";
import { generateTypes } from "./generateTypes";
import { generateOpenApi } from "./generateOpenApi";
import { Api } from "../types";
import { cleanDefaultResponse, sanitizeApiPrefix } from "../utils/format";
import { getLibDir } from "../utils/libDir";
import { discoverHandlersFromRoute } from "../utils/traceHandlers.js";
import { normalizeApiGroup } from "../utils/normalizeApiGroup.js";
import { discoverRoutesFromApp } from "../utils/discoverRoutesFromApp.js";

export async function runGenerate(configPath: string) {
  const config = await loadConfig(configPath);
  const rootPath = process.cwd();
  console.log("Initializing ts-morph with tsConfig:", config.tsConfigPath);
  const project = new Project({
    tsConfigFilePath: resolve(rootPath, config.tsConfigPath),
  });

  // const isDevMode =
  //   __dirname.includes("/src/") || __dirname.includes("\\src\\");

  // const libDir = isDevMode
  //   ? path.resolve(__dirname, "../../")
  //   : // : path.dirname(require.resolve("@rcmade/hono-docs/package.json"));
  //     path.dirname(fileURLToPath(import.meta.url));
  const libDir = getLibDir();
  console.log("Library root directory:", libDir);

  // Validate config: either appPath or apis must be provided, not both
  if (config.appPath && config.apis) {
    throw new Error(
      "Config error: cannot use both 'appPath' and 'apis'. Use either 'appPath' for auto-discovery or 'apis' for manual configuration."
    );
  }

  if (!config.appPath && !config.apis) {
    throw new Error(
      "Config error: must provide either 'appPath' (for auto-discovery) or 'apis' (for manual configuration)."
    );
  }

  // Discover or normalize API groups
  let normalizedApis;
  if (config.appPath) {
    // Auto-discover routes from main app file
    const discoveredRoutes = discoverRoutesFromApp(
      project,
      config.appPath,
      rootPath,
      config.tsConfigPath
    );
    // Normalize discovered routes (sets name from filename/JSDoc)
    normalizedApis = discoveredRoutes.map((route) =>
      normalizeApiGroup(route, project, rootPath)
    );
  } else {
    // Use provided apis array (convert strings to full ApiGroup objects)
    normalizedApis = config.apis!.map((api) =>
      normalizeApiGroup(api, project, rootPath)
    );
  }

  const snapshotOutputRoot = path.resolve(libDir, "output/types");
  const openAPiOutputRoot = path.resolve(libDir, "output/openapi");

  const commonParams = {
    config,
    libDir,
    project,
    rootPath,
  };
  for (const apiGroup of normalizedApis) {
    const sanitizedName = sanitizeApiPrefix(apiGroup.apiPrefix);

    const snapshotPath = await generateTypes({
      ...commonParams,
      apiGroup: apiGroup,
      fileName: sanitizedName,
      outputRoot: snapshotOutputRoot,
    });

    await generateOpenApi({
      snapshotPath,
      ...commonParams,
      fileName: sanitizedName,
      outputRoot: openAPiOutputRoot,
    });
  }

  const merged = {
    ...config.openApi,
    tags: [] as { name: string }[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paths: {} as Record<string, any>,
  };

  for (const apiGroup of normalizedApis) {
    const name = sanitizeApiPrefix(apiGroup.apiPrefix);
    const openApiFile = path.join(openAPiOutputRoot, `${name}.json`);

    if (!fs.existsSync(openApiFile)) {
      console.warn(`⚠️ Missing OpenAPI file: ${openApiFile}`);
      continue;
    }

    const json = JSON.parse(fs.readFileSync(openApiFile, "utf-8"));
    merged.tags.push({ name: apiGroup.name });

    const customApiMap = new Map<string, Api>();

    if (apiGroup?.api) {
      for (const customApi of apiGroup.api) {
        const fullPath =
          path.posix
            .join(apiGroup.apiPrefix, customApi.api)
            .replace(/\/+$/, "") || "/";
        customApiMap.set(
          `${customApi.method.toLowerCase()} ${fullPath}`,
          customApi
        );
      }
    }

    // NEW: Extract JSDoc metadata from handler files
    const jsDocMapRaw = discoverHandlersFromRoute(
      project,
      path.join(rootPath, apiGroup.appTypePath),
      rootPath,
      config.tsConfigPath
    );

    // Remap JSDoc keys to include apiPrefix for matching
    const jsDocMap = new Map<string, typeof jsDocMapRaw extends Map<string, infer T> ? T : never>();
    for (const [key, metadata] of jsDocMapRaw.entries()) {
      // key format: "method path" (e.g., "get /" or "put /:id")
      const [method, routePath] = key.split(" ", 2);
      // Convert :param to {param} to match OpenAPI format
      const normalizedPath = routePath.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "{$1}");
      const prefixedPath = path.posix.join(apiGroup.apiPrefix, normalizedPath).replace(/\/+$/, "") || "/";
      const prefixedKey = `${method} ${prefixedPath}`;
      jsDocMap.set(prefixedKey, metadata);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const [pathKey, operations] of Object.entries<any>(json.paths)) {
      const prefixedPath =
        path.posix.join(apiGroup.apiPrefix, pathKey).replace(/\/+$/, "") || "/";
      if (!merged.paths[prefixedPath]) merged.paths[prefixedPath] = {};

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const [method, operation] of Object.entries<any>(operations)) {
        const opKey = `${method.toLowerCase()} ${prefixedPath}`;
        const customApi = customApiMap.get(opKey);
        const jsDocMeta = jsDocMap.get(opKey);

        // Apply metadata in priority order:
        // 1. Auto-generated (already set in operation)
        // 2. JSDoc from handler files (if available)
        // 3. Config file (highest priority)

        // Apply JSDoc metadata (fallback if auto-generated is empty)
        if (jsDocMeta) {
          operation.summary = jsDocMeta.summary || operation.summary;
          operation.description = jsDocMeta.description || operation.description;
          if (jsDocMeta.tags && jsDocMeta.tags.length > 0) {
            operation.tags = jsDocMeta.tags;
          }
        }

        // Override or enrich metadata from config (highest priority)
        if (customApi) {
          operation.summary = customApi.summary || operation.summary;
          operation.description =
            customApi.description || operation.description;
          operation.tags =
            customApi.tag && customApi.tag.length > 0
              ? customApi.tag
              : operation.tags;
        }

        // Ensure tags array exists and includes apiGroup name if no custom tags
        if (!operation.tags || operation.tags.length === 0) {
          operation.tags = [apiGroup.name];
        } else if (!operation.tags.includes(apiGroup.name)) {
          operation.tags.push(apiGroup.name);
        }

        cleanDefaultResponse(operation, prefixedPath, method);
        merged.paths[prefixedPath][method] = operation;
      }
    }
  }

  const outputPath = path.join(rootPath, config.outputs.openApiJson);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  fs.writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`);

  console.log(`✅ Final merged OpenAPI spec written to: ${outputPath}`);
}
