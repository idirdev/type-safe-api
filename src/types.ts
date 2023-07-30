import { z, ZodType, ZodObject, ZodRawShape } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface EndpointDefinition<
  TInput extends ZodType = ZodType,
  TOutput extends ZodType = ZodType,
> {
  method: HttpMethod;
  path: string;
  input: TInput;
  output: TOutput;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
}

export interface RouteDefinition<
  TInput extends ZodType = ZodType,
  TOutput extends ZodType = ZodType,
> extends EndpointDefinition<TInput, TOutput> {
  handler: (ctx: Context<z.infer<TInput>>) => Promise<z.infer<TOutput>>;
  middleware?: Middleware[];
}

export type ApiSchema = Record<string, EndpointDefinition>;

export type InferInput<T extends EndpointDefinition> =
  T extends EndpointDefinition<infer TInput, any> ? z.infer<TInput> : never;

export type InferOutput<T extends EndpointDefinition> =
  T extends EndpointDefinition<any, infer TOutput> ? z.infer<TOutput> : never;

export interface Context<TInput = unknown> {
  input: TInput;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  headers: Record<string, string>;
  method: HttpMethod;
  path: string;
  state: Record<string, unknown>;
}

export type Middleware = (
  ctx: Context<unknown>,
  next: () => Promise<unknown>,
) => Promise<unknown>;

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

export interface ServerOptions {
  port?: number;
  cors?: CorsOptions | boolean;
  prefix?: string;
  onError?: (error: Error, ctx: Context) => ErrorResponse;
}

export interface CorsOptions {
  origin: string | string[] | RegExp;
  methods?: HttpMethod[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export interface ClientOptions {
  baseURL: string;
  headers?: Record<string, string>;
  interceptors?: {
    request?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
    response?: (response: unknown) => unknown | Promise<unknown>;
  };
  timeout?: number;
}

export interface RequestConfig {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
  signal?: AbortSignal;
}
