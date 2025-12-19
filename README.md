# @bacaxnot/hono-auto-docs

> Auto-generate OpenAPI 3.0 spec from Hono routes with JSDoc - zero config, maximum automation

---

## Features

- **Zero Configuration**: Point to your main app file and auto-discover all routes
- **JSDoc-Based**: All metadata lives in your code via JSDoc comments
- **Convention Over Configuration**: Automatic prefix and name generation from filenames
- **Two Modes**:
  - **Fully Automatic** (`appPath`): Discover routes from main app `.route()` calls
  - **Semi-Automatic** (`apis`): List route files with JSDoc overrides for complex setups
- **CLI** (`hono-auto-docs generate`):
  - Extract route `AppType` definitions via **ts-morph**
  - Generate merged `openapi.json` spec
- Full TypeScript support (TS & JS config files, inference via `defineConfig`)

---

## Philosophy

**Metadata lives in code, not in config files.**

This package enforces a JSDoc-based approach where all route metadata (@prefix, @name, @summary, @description, @tags) is defined directly in your route files. No verbose object configuration needed.

---

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
  - [Mode 1: Fully Automatic (Recommended)](#mode-1-fully-automatic-recommended)
  - [Mode 2: Semi-Automatic (Complex Setups)](#mode-2-semi-automatic-complex-setups)
- [JSDoc Annotations](#jsdoc-annotations)
- [Configuration Reference](#configuration-reference)
- [Serving the OpenAPI Docs](#serving-the-openapi-docs)
- [CLI Usage](#cli-usage)
- [Programmatic Usage](#programmatic-usage)
- [Limitations](#limitations)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Install

```bash
# using bun
bun add -d @bacaxnot/hono-auto-docs

# using npm
npm install --save-dev @bacaxnot/hono-auto-docs

# using yarn
yarn add -D @bacaxnot/hono-auto-docs
```

---

## Quick Start

### Mode 1: Fully Automatic (Recommended)

For simple single-file route mounting patterns, just point to your main app file:

1. **Create a config file** (`hono-docs.ts`):

   ```ts
   import { defineConfig } from "@bacaxnot/hono-auto-docs";

   export default defineConfig({
     tsConfigPath: "./tsconfig.json",
     openApi: {
       openapi: "3.0.0",
       info: { title: "My API", version: "1.0.0" },
       servers: [{ url: "http://localhost:8000" }],
     },
     outputs: {
       openApiJson: "./openapi.json",
     },
     // ✅ Single entry point - auto-discovers all routes
     appPath: "src/index.ts",
   });
   ```

2. **Your main app** (`src/index.ts`):

   ```ts
   import { Hono } from "hono";
   import { accountsApp } from "./routes/accounts";
   import { transactionsApp } from "./routes/transactions";

   export const app = new Hono()
     .route("/accounts", accountsApp)      // Auto-discovered: /accounts
     .route("/transactions", transactionsApp); // Auto-discovered: /transactions
   ```

3. **Your route files** (`src/routes/accounts.ts`):

   ```ts
   import { Hono } from "hono";

   /**
    * @name Accounts
    */
   export const accountsApp = new Hono()
     .get("/", (c) => {
       /* ... */
     })
     .post("/", (c) => {
       /* ... */
     });

   export type AppType = typeof accountsApp;
   ```

4. **Run the CLI**:

   ```bash
   bunx hono-auto-docs generate --config ./hono-docs.ts
   ```

That's it! 🎉

---

### Mode 2: Semi-Automatic (Complex Setups)

For complex mounting patterns (nested routes, conditional mounting, etc.), list route files explicitly:

```ts
import { defineConfig } from "@bacaxnot/hono-auto-docs";

export default defineConfig({
  tsConfigPath: "./tsconfig.json",
  openApi: {
    openapi: "3.0.0",
    info: { title: "My API", version: "1.0.0" },
    servers: [{ url: "http://localhost:8000" }],
  },
  outputs: {
    openApiJson: "./openapi.json",
  },
  // ✅ List route files - uses JSDoc @prefix or filename convention
  apis: [
    "src/routes/accounts.ts",
    "src/routes/transactions.ts",
    "src/routes/categories.ts",
  ],
});
```

**Route file with JSDoc overrides** (`src/routes/accounts.ts`):

```ts
import { Hono } from "hono";

/**
 * @prefix /accounts
 * @name Accounts
 */
export const accountsApp = new Hono()
  .get("/", (c) => {
    /* ... */
  })
  .post("/", (c) => {
    /* ... */
  });

export type AppType = typeof accountsApp;
```

Without `@prefix`, the prefix is auto-generated from the filename (`accounts.ts` → `/accounts`).

---

## JSDoc Annotations

### Route-Level JSDoc (on Hono app export)

Annotate your route app export to customize OpenAPI metadata:

```ts
/**
 * @prefix /custom-prefix  // Optional: Override URL prefix
 * @name My Route Group    // Optional: Override display name
 */
export const myApp = new Hono()
  .get("/", (c) => { /* ... */ });
```

| Tag | Description | Fallback |
|-----|-------------|----------|
| `@prefix` | URL prefix for all routes | Filename convention (`accounts.ts` → `/accounts`) |
| `@name` | Display name in OpenAPI tags | Filename convention (`accounts.ts` → `Accounts`) |

### Endpoint-Level JSDoc (on route handlers)

Annotate individual route handlers for rich endpoint documentation:

```ts
export const accountsApp = new Hono()
  /**
   * List all accounts
   * @summary Get all accounts for the current user
   * @description Returns a paginated list of all accounts owned by the authenticated user
   * @tags Accounts, Finance
   */
  .get("/", (c) => {
    /* ... */
  })
  /**
   * Create a new account
   * @summary Create account
   * @description Creates a new financial account with the provided details
   * @tags Accounts
   */
  .post("/", (c) => {
    /* ... */
  });
```

| Tag | Description |
|-----|-------------|
| `@summary` | Short summary for the endpoint |
| `@description` | Detailed description |
| `@tags` | Comma-separated tags for categorization |

---

## Configuration Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tsConfigPath` | `string` | Yes | Path to your `tsconfig.json` |
| `openApi` | `OpenAPIConfig` | Yes | Static OpenAPI fields (info, servers, etc.) |
| `outputs` | `{ openApiJson: string }` | Yes | Output path for generated `openapi.json` |
| `appPath` | `string` | No* | Path to main app file for auto-discovery |
| `apis` | `string[]` | No* | Array of route file paths (for manual listing) |
| `preDefineTypeContent` | `string` | No | Raw content injected at top of `.d.ts` snapshots |

\* Either `appPath` or `apis` must be provided (mutually exclusive)

---

## Serving the OpenAPI Docs

Install the Scalar viewer:

```bash
bun add @scalar/hono-api-reference
```

Mount in your Hono app:

```ts
import { Hono } from "hono";
import { Scalar } from "@scalar/hono-api-reference";
import fs from "node:fs/promises";

const docsApp = new Hono()
  .get("/", Scalar({ url: "/docs/openapi.json" }))
  .get("/openapi.json", async (c) => {
    const spec = await fs.readFile("./openapi.json", "utf-8");
    return c.json(JSON.parse(spec));
  });

export const app = new Hono()
  .route("/docs", docsApp)
  .route("/accounts", accountsApp);
```

Visit `/docs` to see the interactive API documentation.

---

## CLI Usage

```bash
# Generate OpenAPI spec
bunx hono-auto-docs generate --config ./hono-docs.ts

# Or add to package.json scripts
{
  "scripts": {
    "docs": "hono-auto-docs generate --config ./hono-docs.ts"
  }
}
```

---

## Programmatic Usage

```ts
import { runGenerate } from "@bacaxnot/hono-auto-docs";

await runGenerate("./hono-docs.ts");
```

---

## Limitations

### `appPath` Mode Limitations

The `appPath` auto-discovery only works for:
- ✅ Single-file method-chained `.route()` calls
- ✅ Simple import → mount patterns

It does **not** support:
- ❌ Nested/multi-level mounting
- ❌ Conditional route registration
- ❌ Non-chained registration patterns
- ❌ Re-exported route aggregators

**Solution**: Use `apis` mode with `@prefix` JSDoc overrides for complex setups.

### AppType Requirement

You **must** export `AppType` from each route module:

```ts
export const accountsApp = new Hono()
  .get("/", (c) => { /* ... */ });

// Required!
export type AppType = typeof accountsApp;
```

---

## Development

1. Clone & install dependencies:

   ```bash
   git clone https://github.com/bacaxnot/hono-auto-docs.git
   cd hono-auto-docs
   bun install
   ```

2. Build and watch:

   ```bash
   bun run build --watch
   ```

3. Test locally via `bun link` or `file:` install in a demo project.

---

## Contributing

1. Fork the repo
2. Create a feature branch
3. Open a PR with a clear description
4. Ensure code passes linting

---

## License

[MIT](LICENSE)
