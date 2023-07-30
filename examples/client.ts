import { z } from 'zod';
import { Client } from '../src/Client.js';

// Same schema definitions as the server (in practice, shared in a package)
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

// Define the API schema for the client
const apiSchema = {
  listUsers: { method: 'GET' as const, path: '/users', input: ListUsersInput, output: ListUsersOutput },
  createUser: { method: 'POST' as const, path: '/users', input: CreateUserInput, output: UserSchema },
  getUser: { method: 'GET' as const, path: '/users/:id', input: z.object({ id: z.string() }), output: UserSchema },
};

// Create a fully typed client
const client = new Client(apiSchema, {
  baseURL: 'http://localhost:3000',
  headers: { Authorization: 'Bearer my-token' },
  timeout: 5000,
  interceptors: {
    request: (config) => {
      console.log(`[Request] ${config.method} ${config.url}`);
      return config;
    },
    response: (data) => {
      console.log('[Response]', data);
      return data;
    },
  },
});

// Usage with full type safety - IDE autocomplete works here
async function main() {
  // All inputs and outputs are fully typed
  const users = await client.api.listUsers({ page: 1, limit: 10 });
  console.log(`Found ${users.total} users on page ${users.page}`);

  const newUser = await client.api.createUser({
    name: 'Bob',
    email: 'bob@example.com',
    role: 'user',
  });
  console.log(`Created user: ${newUser.name} (${newUser.id})`);

  const user = await client.api.getUser({ id: newUser.id });
  console.log(`Fetched user: ${user.name} <${user.email}>`);
}

main().catch(console.error);
