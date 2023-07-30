import { z } from 'zod';
import { Router } from '../src/Router.js';
import { Server } from '../src/Server.js';
import { OpenAPIGenerator } from '../src/OpenAPI.js';

// Define schemas
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'user', 'moderator']),
  createdAt: z.string(),
});

const CreateUserInput = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  role: z.enum(['admin', 'user', 'moderator']).default('user'),
});

const ListUsersInput = z.object({
  page: z.number().optional(),
  limit: z.number().optional(),
  role: z.enum(['admin', 'user', 'moderator']).optional(),
});

const ListUsersOutput = z.object({
  users: z.array(UserSchema),
  total: z.number(),
  page: z.number(),
});

// Build the router with full type safety
const router = new Router()
  .define('listUsers', {
    method: 'GET',
    path: '/users',
    input: ListUsersInput,
    output: ListUsersOutput,
    description: 'List all users with pagination',
    tags: ['users'],
  }, async (ctx) => {
    const { page = 1, limit = 20 } = ctx.input;
    return {
      users: [
        { id: '1', name: 'Alice', email: 'alice@example.com', role: 'admin' as const, createdAt: new Date().toISOString() },
      ],
      total: 1,
      page,
    };
  })
  .define('createUser', {
    method: 'POST',
    path: '/users',
    input: CreateUserInput,
    output: UserSchema,
    description: 'Create a new user',
    tags: ['users'],
  }, async (ctx) => {
    return {
      id: crypto.randomUUID(),
      name: ctx.input.name,
      email: ctx.input.email,
      role: ctx.input.role,
      createdAt: new Date().toISOString(),
    };
  })
  .define('getUser', {
    method: 'GET',
    path: '/users/:id',
    input: z.object({ id: z.string() }),
    output: UserSchema,
    description: 'Get a user by ID',
    tags: ['users'],
  }, async (ctx) => {
    return {
      id: ctx.params.id,
      name: 'Alice',
      email: 'alice@example.com',
      role: 'admin' as const,
      createdAt: new Date().toISOString(),
    };
  });

// Generate OpenAPI spec
const openapi = new OpenAPIGenerator();
const spec = openapi.generate(
  router.getSchema(),
  { title: 'Users API', version: '1.0.0', description: 'A type-safe user management API' },
  [{ url: 'http://localhost:3000', description: 'Development' }],
);
console.log('OpenAPI Spec:', JSON.stringify(spec, null, 2));

// Start the server
const server = new Server(router, { port: 3000, cors: true });
server.listen().then(() => {
  console.log('API is ready. Try: curl http://localhost:3000/users');
});
