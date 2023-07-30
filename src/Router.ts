import { ZodType, z } from 'zod';
import {
  HttpMethod,
  RouteDefinition,
  EndpointDefinition,
  Context,
  Middleware,
  ApiResponse,
} from './types.js';
import { Validator, ValidationError } from './Validator.js';

interface RouteEntry {
  definition: RouteDefinition;
  pattern: RegExp;
  paramNames: string[];
}

export class Router<TSchema extends Record<string, EndpointDefinition> = {}> {
  private routes: Map<string, RouteEntry> = new Map();
  private globalMiddleware: Middleware[] = [];
  private validator = new Validator();

  use(middleware: Middleware): this {
    this.globalMiddleware.push(middleware);
    return this;
  }

  define<
    TName extends string,
    TInput extends ZodType,
    TOutput extends ZodType,
  >(
    name: TName,
    endpoint: EndpointDefinition<TInput, TOutput>,
    handler: (ctx: Context<z.infer<TInput>>) => Promise<z.infer<TOutput>>,
    middleware?: Middleware[],
  ): Router<TSchema & Record<TName, EndpointDefinition<TInput, TOutput>>> {
    const { pattern, paramNames } = this.compilePath(endpoint.path);

    const route: RouteDefinition<TInput, TOutput> = {
      ...endpoint,
      handler,
      middleware,
    };

    this.routes.set(name, {
      definition: route as RouteDefinition,
      pattern,
      paramNames,
    });

    return this as unknown as Router<TSchema & Record<TName, EndpointDefinition<TInput, TOutput>>>;
  }

  private compilePath(path: string): { pattern: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];
    const regexStr = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    return { pattern: new RegExp(`^${regexStr}$`), paramNames };
  }

  match(method: HttpMethod, path: string): { route: RouteEntry; params: Record<string, string> } | null {
    for (const [, entry] of this.routes) {
      if (entry.definition.method !== method) continue;
      const match = path.match(entry.pattern);
      if (match) {
        const params: Record<string, string> = {};
        entry.paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(match[i + 1]);
        });
        return { route: entry, params };
      }
    }
    return null;
  }

  async handle(method: HttpMethod, path: string, rawCtx: Partial<Context>): Promise<ApiResponse> {
    const result = this.match(method, path);
    if (!result) {
      return { success: false, error: { code: 'NOT_FOUND', message: `No route matches ${method} ${path}` } };
    }

    const { route, params } = result;
    const { definition } = route;

    try {
      const validatedInput = this.validator.validate(definition.input, rawCtx.input ?? {});

      const ctx: Context = {
        input: validatedInput,
        params,
        query: rawCtx.query ?? {},
        headers: rawCtx.headers ?? {},
        method,
        path,
        state: {},
      };

      const middlewareChain = [...this.globalMiddleware, ...(definition.middleware ?? [])];
      const output = await this.executeMiddlewareChain(middlewareChain, ctx, async () => {
        return definition.handler(ctx);
      });

      const validatedOutput = this.validator.validate(definition.output, output);
      return { success: true, data: validatedOutput };
    } catch (err) {
      if (err instanceof ValidationError) {
        return { success: false, error: { code: 'VALIDATION_ERROR', message: err.message, details: err.fieldErrors } };
      }
      const message = err instanceof Error ? err.message : 'Internal server error';
      return { success: false, error: { code: 'INTERNAL_ERROR', message } };
    }
  }

  private async executeMiddlewareChain(
    middleware: Middleware[],
    ctx: Context,
    handler: () => Promise<unknown>,
  ): Promise<unknown> {
    if (middleware.length === 0) return handler();

    let index = 0;
    const next = async (): Promise<unknown> => {
      if (index < middleware.length) {
        const mw = middleware[index++];
        return mw(ctx, next);
      }
      return handler();
    };
    return next();
  }

  getSchema(): Record<string, EndpointDefinition> {
    const schema: Record<string, EndpointDefinition> = {};
    for (const [name, entry] of this.routes) {
      schema[name] = entry.definition;
    }
    return schema;
  }

  getRoutes(): Map<string, RouteEntry> {
    return new Map(this.routes);
  }
}
