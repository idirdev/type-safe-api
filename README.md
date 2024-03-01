# type-safe-api

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![Zod](https://img.shields.io/badge/Zod-3.23-orange.svg)](https://zod.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**End-to-end type-safe API framework** with automatic type inference from Zod schemas. Define your API once, get typed server handlers, typed client calls, and OpenAPI documentation -- all from a single source of truth.

## Features

- **Single schema definition** - Define input/output schemas once using Zod
- **Type-safe router** - Handlers receive fully typed context with validated input
- **Type-safe client** - Generated client with autocomplete for endpoints, inputs, and outputs
- **Automatic validation** - Request/response validation via Zod with detailed error messages
- **OpenAPI generation** - Generate OpenAPI 3.0 specs directly from your route definitions
- **Middleware support** - Composable middleware chain with typed context
- **CORS built-in** - Configurable CORS with sensible defaults
- **Zero codegen** - Pure TypeScript inference, no build step required for types

## Quick Start

```bash
npm install type-safe-api zod
```

### Define Your API

```typescript
import { z } from 'zod';
import { Router, Server } from 'type-safe-api';

const router = new Router()
  .define('getUser', {
    method: 'GET',
    path: '/users/:id',
    input: z.object({ id: z.string() }),
    output: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().email(),
    }),
    description: 'Get a user by ID',
    tags: ['users'],
  }, async (ctx) => {
    // ctx.input is typed as { id: string }
    // ctx.params has the path parameters
    return {
      id: ctx.params.id,
      name: 'Alice',
      email: 'alice@example.com',
    };
    // Return type is validated against the output schema
  });

const server = new Server(router, { port: 3000, cors: true });
server.listen();
```

### Use the Typed Client

```typescript
import { Client } from 'type-safe-api';

const client = new Client(apiSchema, {
  baseURL: 'http://localhost:3000',
  headers: { Authorization: 'Bearer token' },
});

// Full autocomplete and type checking
const user = await client.api.getUser({ id: '123' });
// user is typed as { id: string; name: string; email: string }
```

### Generate OpenAPI Spec

```typescript
import { OpenAPIGenerator } from 'type-safe-api';

const generator = new OpenAPIGenerator();
const spec = generator.generate(
  router.getSchema(),
  { title: 'My API', version: '1.0.0' },
  [{ url: 'http://localhost:3000' }],
);

// spec is a valid OpenAPI 3.0.3 document
```

## Middleware

```typescript
const authMiddleware: Middleware = async (ctx, next) => {
  const token = ctx.headers['authorization']?.replace('Bearer ', '');
  if (!token) throw new Error('Unauthorized');
  ctx.state.userId = verifyToken(token);
  return next();
};

router.use(authMiddleware);
```

## Validation

Input validation happens automatically. Invalid requests return structured errors:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed: email: Invalid email",
    "details": {
      "email": ["Invalid email"]
    }
  }
}
```

## Architecture

```
Schema (Zod) ─── Router (Server) ─── Handler (Business Logic)
     │                                        │
     │                                        v
     └──────── Client (Type-safe) ──── API Response
     │
     └──────── OpenAPI (Docs) ──── Swagger/Redoc
```

## API Reference

### `Router`
- `use(middleware)` - Add global middleware
- `define(name, endpoint, handler)` - Define a typed route
- `handle(method, path, ctx)` - Handle a request
- `getSchema()` - Get all endpoint definitions

### `Server`
- `listen(port?)` - Start the HTTP server
- `close()` - Gracefully shut down

### `Client`
- `api[endpointName](input)` - Call a typed endpoint

### `OpenAPIGenerator`
- `generate(endpoints, info, servers?)` - Generate OpenAPI 3.0 spec

### `Validator`
- `validate(schema, data)` - Validate and return typed data

## License

MIT

## Comparison

Similar to tRPC but works without a build step and generates standard OpenAPI specs.

---

## 🇫🇷 Documentation en français

### Description
type-safe-api est un framework d'API entièrement typé de bout en bout avec inférence automatique des types depuis les schémas Zod. Définissez votre API une seule fois et obtenez des handlers serveur typés, des appels client typés et une documentation OpenAPI — tout depuis une source unique. Un outil puissant pour éliminer les erreurs de typage entre le frontend et le backend.

### Installation
```bash
npm install type-safe-api zod
```

### Utilisation
```typescript
import { createAPI } from 'type-safe-api';
import { z } from 'zod';
// Définissez vos routes une fois, profitez du typage partout
```
Consultez la documentation en anglais ci-dessus pour les exemples complets de définition de routes et de génération OpenAPI.
