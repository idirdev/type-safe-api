import { ZodType, ZodError, ZodObject } from 'zod';

export class ValidationError extends Error {
  public fieldErrors: Record<string, string[]>;

  constructor(message: string, fieldErrors: Record<string, string[]>) {
    super(message);
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }

  static fromZodError(zodError: ZodError): ValidationError {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of zodError.issues) {
      const path = issue.path.join('.') || '_root';
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }
    const message = zodError.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return new ValidationError(`Validation failed: ${message}`, fieldErrors);
  }
}

export class Validator {
  private coercionEnabled: boolean;

  constructor(options?: { coerce?: boolean }) {
    this.coercionEnabled = options?.coerce ?? true;
  }

  coerce(data: unknown): unknown {
    return this.coercionEnabled ? this.coerceTypes(data) : data;
  }

  validate<T>(schema: ZodType<T>, data: unknown, options?: { skipCoercion?: boolean }): T {
    const skipCoercion = options?.skipCoercion ?? false;
    const preprocessed = (!skipCoercion && this.coercionEnabled) ? this.coerceTypes(data) : data;

    const result = schema.safeParse(preprocessed);

    if (!result.success) {
      throw ValidationError.fromZodError(result.error);
    }

    return result.data;
  }

  private coerceTypes(data: unknown): unknown {
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;
    if (Array.isArray(data)) return data.map((item) => this.coerceTypes(item));

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (typeof value === 'string') {
        if (value === 'true') result[key] = true;
        else if (value === 'false') result[key] = false;
        else if (value === 'null') result[key] = null;
        else if (/^\d+$/.test(value) && !isNaN(Number(value))) result[key] = Number(value);
        else result[key] = value;
      } else {
        result[key] = this.coerceTypes(value);
      }
    }
    return result;
  }

  formatErrors(error: ValidationError): string {
    const lines: string[] = ['Validation errors:'];
    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      for (const msg of messages) {
        lines.push(`  - ${field}: ${msg}`);
      }
    }
    return lines.join('\n');
  }
}
