import { Context, Middleware, ApiResponse, ErrorResponse } from './types.js';

/**
 * Creates a typed middleware that passes context along the chain.
 * Supports async handlers and error boundaries.
 */
export function createMiddleware(
  handler: (ctx: Context, next: () => Promise<unknown>) => Promise<unknown>,
): Middleware {
  return handler;
}

/**
 * Compose multiple middleware into a single middleware.
 * Executes them in order (first in, first to execute).
 */
export function composeMiddleware(...middlewares: Middleware[]): Middleware {
  return async (ctx, next) => {
    let index = 0;

    const dispatch = async (): Promise<unknown> => {
      if (index < middlewares.length) {
        const mw = middlewares[index++];
        return mw(ctx, dispatch);
      }
      return next();
    };

    return dispatch();
  };
}

/** Middleware that logs request timing. */
export function timingMiddleware(onFinish?: (method: string, path: string, ms: number) => void): Middleware {
  return async (ctx, next) => {
    const start = Date.now();
    try {
      return await next();
    } finally {
      const duration = Date.now() - start;
      if (onFinish) {
        onFinish(ctx.method, ctx.path, duration);
      }
    }
  };
}

/** Middleware that adds CORS headers to context state. */
export function corsMiddleware(options?: {
  origin?: string | string[];
  methods?: string[];
  allowedHeaders?: string[];
}): Middleware {
  const origin = options?.origin ?? '*';
  const methods = options?.methods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const allowed = options?.allowedHeaders ?? ['Content-Type', 'Authorization'];

  return async (ctx, next) => {
    ctx.state['cors'] = {
      'Access-Control-Allow-Origin': Array.isArray(origin) ? origin.join(', ') : origin,
      'Access-Control-Allow-Methods': methods.join(', '),
      'Access-Control-Allow-Headers': allowed.join(', '),
    };
    return next();
  };
}

/** Middleware that validates authentication via Authorization header. */
export function authMiddleware(
  validate: (token: string) => Promise<{ userId: string; role: string } | null>,
): Middleware {
  return async (ctx, next) => {
    const authHeader = ctx.headers['authorization'] ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      throw new AuthError('Missing authorization token');
    }

    const user = await validate(token);
    if (!user) {
      throw new AuthError('Invalid authorization token');
    }

    ctx.state['user'] = user;
    return next();
  };
}

/** Middleware that rate-limits requests per client IP or key. */
export function rateLimitMiddleware(options: {
  windowMs: number;
  maxRequests: number;
  keyFn?: (ctx: Context) => string;
}): Middleware {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return async (ctx, next) => {
    const key = options.keyFn?.(ctx) ?? ctx.headers['x-forwarded-for'] ?? 'global';
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count++;

    if (bucket.count > options.maxRequests) {
      throw new RateLimitError(`Rate limit exceeded: ${options.maxRequests} per ${options.windowMs}ms`);
    }

    ctx.state['rateLimit'] = {
      remaining: options.maxRequests - bucket.count,
      resetAt: bucket.resetAt,
    };

    return next();
  };
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}
