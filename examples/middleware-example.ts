import { z } from 'zod';
import { Router } from '../src/Router.js';
import { Server } from '../src/Server.js';
import {
  createMiddleware,
  composeMiddleware,
  timingMiddleware,
  corsMiddleware,
  authMiddleware,
  rateLimitMiddleware,
} from '../src/Middleware.js';

// --- middleware setup ---

const logger = timingMiddleware((method, path, ms) => {
  console.log(`${method} ${path} - ${ms}ms`);
});

const cors = corsMiddleware({
  origin: ['http://localhost:3000', 'https://myapp.dev'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
});

const auth = authMiddleware(async (token) => {
  // in production this would verify a JWT or hit a database
  if (token === 'admin-secret') return { userId: 'admin-1', role: 'admin' };
  if (token.startsWith('user-')) return { userId: token, role: 'user' };
  return null;
});

const rateLimit = rateLimitMiddleware({
  windowMs: 60_000,
  maxRequests: 100,
});

// compose into a single global middleware
const globalMiddleware = composeMiddleware(logger, cors, rateLimit);

// --- protected routes ---

const requireAdmin = createMiddleware(async (ctx, next) => {
  const user = ctx.state['user'] as { role: string } | undefined;
  if (user?.role !== 'admin') {
    throw new Error('Admin access required');
  }
  return next();
});

// --- router definition ---

const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
  createdBy: z.string(),
});

const router = new Router()
  .use(globalMiddleware)
  .define('listItems', {
    method: 'GET',
    path: '/items',
    input: z.object({
      page: z.number().optional(),
      limit: z.number().optional(),
    }),
    output: z.object({
      items: z.array(ItemSchema),
      total: z.number(),
    }),
    description: 'List all items',
  }, async (ctx) => {
    // publicly accessible, no auth needed
    return {
      items: [
        { id: '1', name: 'Widget', price: 9.99, createdBy: 'admin-1' },
        { id: '2', name: 'Gadget', price: 19.99, createdBy: 'admin-1' },
      ],
      total: 2,
    };
  })
  .define('createItem', {
    method: 'POST',
    path: '/items',
    input: z.object({
      name: z.string().min(1),
      price: z.number().positive(),
    }),
    output: ItemSchema,
    description: 'Create a new item (requires admin)',
  }, async (ctx) => {
    const user = ctx.state['user'] as { userId: string };
    return {
      id: crypto.randomUUID(),
      name: ctx.input.name,
      price: ctx.input.price,
      createdBy: user.userId,
    };
  }, [auth, requireAdmin]);

// --- start server ---

const server = new Server(router, {
  port: 3001,
  cors: true,
});

server.listen().then(() => {
  console.log('Middleware example running on http://localhost:3001');
  console.log('Try:');
  console.log('  curl http://localhost:3001/items');
  console.log('  curl -X POST http://localhost:3001/items -H "Authorization: Bearer admin-secret" -H "Content-Type: application/json" -d \'{"name":"New Item","price":29.99}\'');
});
