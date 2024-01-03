import { ErrorResponse, Context } from './types.js';
import { ValidationError } from './Validator.js';
import { AuthError, RateLimitError } from './Middleware.js';

interface ErrorMapping {
  match: (err: Error) => boolean;
  statusCode: number;
  code: string;
}

const DEFAULT_MAPPINGS: ErrorMapping[] = [
  {
    match: (err) => err instanceof ValidationError,
    statusCode: 400,
    code: 'VALIDATION_ERROR',
  },
  {
    match: (err) => err instanceof AuthError,
    statusCode: 401,
    code: 'UNAUTHORIZED',
  },
  {
    match: (err) => err.name === 'ForbiddenError',
    statusCode: 403,
    code: 'FORBIDDEN',
  },
  {
    match: (err) => err.name === 'NotFoundError',
    statusCode: 404,
    code: 'NOT_FOUND',
  },
  {
    match: (err) => err instanceof RateLimitError,
    statusCode: 429,
    code: 'RATE_LIMIT_EXCEEDED',
  },
];

export interface ErrorHandlerOptions {
  includeStack?: boolean;
  customMappings?: ErrorMapping[];
  onError?: (error: Error, ctx?: Context) => void;
}

export class ErrorHandler {
  private mappings: ErrorMapping[];
  private includeStack: boolean;
  private onError?: (error: Error, ctx?: Context) => void;

  constructor(options: ErrorHandlerOptions = {}) {
    this.mappings = [...(options.customMappings ?? []), ...DEFAULT_MAPPINGS];
    this.includeStack = options.includeStack ?? false;
    this.onError = options.onError;
  }

  handle(error: unknown, ctx?: Context): { statusCode: number; body: ErrorResponse } {
    const err = error instanceof Error ? error : new Error(String(error));

    this.onError?.(err, ctx);

    const mapping = this.mappings.find((m) => m.match(err));

    const statusCode = mapping?.statusCode ?? 500;
    const code = mapping?.code ?? 'INTERNAL_ERROR';

    const body: ErrorResponse = {
      success: false,
      error: {
        code,
        message: statusCode === 500 ? 'Internal server error' : err.message,
      },
    };

    if (err instanceof ValidationError) {
      body.error.details = err.fieldErrors;
    }

    if (this.includeStack && err.stack) {
      (body.error as any).stack = err.stack;
    }

    return { statusCode, body };
  }

  getStatusCode(error: Error): number {
    const mapping = this.mappings.find((m) => m.match(error));
    return mapping?.statusCode ?? 500;
  }

  getErrorCode(error: Error): string {
    const mapping = this.mappings.find((m) => m.match(error));
    return mapping?.code ?? 'INTERNAL_ERROR';
  }

  addMapping(mapping: ErrorMapping): void {
    this.mappings.unshift(mapping);
  }

  static httpStatusText(code: number): string {
    const texts: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
    };
    return texts[code] ?? 'Unknown Error';
  }
}
