# Basic App Example

This example demonstrates how to use `hono-auto-docs` to automatically generate OpenAPI documentation from your Hono routes using JSDoc annotations.

## What's Included

- **Fully Automatic Mode**: Uses `appPath` to auto-discover routes from `src/index.ts`
- **JSDoc Annotations**: Route-level and endpoint-level metadata
- **Interactive Documentation**: Scalar UI at `/api/docs`
- **Type-Safe Routes**: Full TypeScript support

## Quick Start

1. **Install dependencies**:
   ```bash
   bun install
   ```

2. **Generate OpenAPI docs**:
   ```bash
   bun run docs
   ```

3. **Start the development server**:
   ```bash
   bun run dev
   ```

4. **View the documentation**:
   ```
   open http://localhost:3000/api/docs
   ```

## Project Structure

```
src/
├── index.ts              # Main app - mounts all routes
├── routes/
│   ├── userRoutes.ts     # User API routes with JSDoc
│   └── docs.ts           # Documentation routes
hono-docs.ts              # OpenAPI generation config (8 lines!)
```

## How It Works

### 1. Configuration (`hono-docs.ts`)

The config uses `appPath` to auto-discover all routes:

```ts
import { defineConfig } from "hono-auto-docs";

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
  appPath: "src/index.ts",  // Auto-discovers all .route() calls
});
```

### 2. Main App (`src/index.ts`)

Routes are mounted using `.route()` - these are auto-discovered:

```ts
const app = new Hono()
  .basePath("/api")
  .route("/docs", docs)       // Auto-discovered: /docs
  .route("/user", userRoutes); // Auto-discovered: /user
```

### 3. Route Files with JSDoc

#### Route-Level JSDoc

Customize the route group name:

```ts
/**
 * @name Users
 */
export const userRoutes = new Hono()
  .get("/", ...)
  .get("/u/:id", ...);
```

#### Endpoint-Level JSDoc

Add rich documentation to each endpoint:

```ts
/**
 * Get user by ID
 * @summary Get user details
 * @description Returns detailed information about a specific user
 * @tags Users
 */
.get("/u/:id", (c) => c.json({ id: c.req.param("id") }))
```

## JSDoc Tags Reference

### Route-Level Tags (on Hono app export)

| Tag | Description | Example |
|-----|-------------|---------|
| `@name` | Display name in OpenAPI | `@name Users` |
| `@prefix` | Override URL prefix | `@prefix /api/v2/users` |

### Endpoint-Level Tags (on route handlers)

| Tag | Description | Example |
|-----|-------------|---------|
| `@summary` | Short endpoint title | `@summary Get user details` |
| `@description` | Detailed description | `@description Returns...` |
| `@tags` | Comma-separated tags | `@tags Users, Authentication` |

## Generated Output

Running `bun run docs` generates:

- `openapi/openapi.json` - Complete OpenAPI 3.0 spec
- `node_modules/hono-auto-docs/output/types/*.d.ts` - Type snapshots
- `node_modules/hono-auto-docs/output/openapi/*.json` - Per-route specs

## View Documentation

Start the server and visit:

- **Interactive Docs**: http://localhost:3000/api/docs
- **OpenAPI JSON**: http://localhost:3000/api/docs/open-api

## Key Features Demonstrated

✅ **Zero Configuration** - Just point to your main app file
✅ **JSDoc-Based** - All metadata lives in your code
✅ **Auto-Discovery** - Finds routes from `.route()` calls
✅ **Convention Over Configuration** - Filenames become prefixes
✅ **Type-Safe** - Full TypeScript support

## Learn More

See the [main documentation](https://github.com/bacaxnot/hono-auto-docs) for:
- Semi-automatic mode with `apis` array
- Complex mounting patterns
- Advanced JSDoc features
- API reference
