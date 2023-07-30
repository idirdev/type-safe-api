import { z, ZodType } from 'zod';
import {
  ApiSchema,
  EndpointDefinition,
  ClientOptions,
  RequestConfig,
  ApiResponse,
  HttpMethod,
} from './types.js';

type ClientMethods<TSchema extends ApiSchema> = {
  [K in keyof TSchema]: TSchema[K] extends EndpointDefinition<infer TInput, infer TOutput>
    ? (input: z.infer<TInput>) => Promise<z.infer<TOutput>>
    : never;
};

export class Client<TSchema extends ApiSchema> {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private interceptors: ClientOptions['interceptors'];
  private timeout: number;

  constructor(
    private schema: TSchema,
    options: ClientOptions,
  ) {
    this.baseURL = options.baseURL.replace(/\/$/, '');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    this.interceptors = options.interceptors;
    this.timeout = options.timeout ?? 30000;
  }

  get api(): ClientMethods<TSchema> {
    const proxy = new Proxy({} as ClientMethods<TSchema>, {
      get: (_target, prop: string) => {
        const endpoint = this.schema[prop];
        if (!endpoint) {
          throw new Error(`Unknown endpoint: ${prop}`);
        }
        return (input: unknown) => this.request(endpoint, input);
      },
    });
    return proxy;
  }

  private async request<TInput extends ZodType, TOutput extends ZodType>(
    endpoint: EndpointDefinition<TInput, TOutput>,
    input: z.infer<TInput>,
  ): Promise<z.infer<TOutput>> {
    const url = this.buildURL(endpoint.path, input);
    const method = endpoint.method;
    const hasBody = method !== 'GET' && method !== 'DELETE';

    let config: RequestConfig = {
      url,
      method,
      headers: { ...this.defaultHeaders },
      body: hasBody ? input : undefined,
      query: !hasBody ? this.extractQuery(input) : undefined,
    };

    if (this.interceptors?.request) {
      config = await this.interceptors.request(config);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    config.signal = controller.signal;

    try {
      const fetchURL = config.query
        ? `${config.url}?${new URLSearchParams(config.query).toString()}`
        : config.url;

      const response = await fetch(fetchURL, {
        method: config.method,
        headers: config.headers,
        body: config.body ? JSON.stringify(config.body) : undefined,
        signal: config.signal,
      });

      clearTimeout(timeoutId);

      const json: ApiResponse = await response.json();

      if (!json.success) {
        throw new ApiError(json.error.code, json.error.message, json.error.details);
      }

      let data = json.data;
      if (this.interceptors?.response) {
        data = await this.interceptors.response(data);
      }

      return data as z.infer<TOutput>;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof ApiError) throw err;
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiError('TIMEOUT', `Request timed out after ${this.timeout}ms`);
      }
      throw new ApiError('NETWORK_ERROR', err instanceof Error ? err.message : 'Network error');
    }
  }

  private buildURL(pathTemplate: string, input: Record<string, unknown>): string {
    const path = pathTemplate.replace(/:(\w+)/g, (_, param) => {
      const value = input[param];
      return value != null ? encodeURIComponent(String(value)) : `:${param}`;
    });
    return `${this.baseURL}${path}`;
  }

  private extractQuery(input: unknown): Record<string, string> {
    if (!input || typeof input !== 'object') return {};
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (value != null) query[key] = String(value);
    }
    return query;
  }
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
