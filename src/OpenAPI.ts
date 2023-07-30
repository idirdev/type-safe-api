import { ZodType, ZodObject, ZodString, ZodNumber, ZodBoolean, ZodArray, ZodOptional, ZodEnum, ZodDefault } from 'zod';
import { EndpointDefinition, HttpMethod } from './types.js';

interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, Record<string, PathOperation>>;
  components?: { schemas: Record<string, SchemaObject> };
}

interface PathOperation {
  operationId: string;
  summary?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: ParameterObject[];
  requestBody?: { required: boolean; content: { 'application/json': { schema: SchemaObject } } };
  responses: Record<string, { description: string; content?: { 'application/json': { schema: SchemaObject } } }>;
}

interface ParameterObject {
  name: string; in: 'query' | 'path'; required: boolean; schema: SchemaObject;
}

interface SchemaObject {
  type?: string; properties?: Record<string, SchemaObject>; required?: string[];
  items?: SchemaObject; enum?: string[]; description?: string; example?: unknown;
  nullable?: boolean; default?: unknown;
}

export class OpenAPIGenerator {
  private schemas: Map<string, SchemaObject> = new Map();

  generate(
    endpoints: Record<string, EndpointDefinition>,
    info: { title: string; version: string; description?: string },
    servers?: Array<{ url: string; description?: string }>,
  ): OpenAPISpec {
    const paths: OpenAPISpec['paths'] = {};

    for (const [name, endpoint] of Object.entries(endpoints)) {
      const pathKey = endpoint.path.replace(/:(\w+)/g, '{$1}');
      if (!paths[pathKey]) paths[pathKey] = {};

      const methodKey = endpoint.method.toLowerCase();
      const params = this.extractPathParams(endpoint.path);
      const hasBody = endpoint.method !== 'GET' && endpoint.method !== 'DELETE';

      const operation: PathOperation = {
        operationId: name,
        summary: endpoint.description,
        tags: endpoint.tags,
        deprecated: endpoint.deprecated,
        parameters: params.length > 0 ? params : undefined,
        responses: {
          '200': {
            description: 'Successful response',
            content: { 'application/json': { schema: this.zodToSchema(endpoint.output) } },
          },
          '400': { description: 'Validation error' },
          '500': { description: 'Internal server error' },
        },
      };

      if (hasBody) {
        operation.requestBody = {
          required: true,
          content: { 'application/json': { schema: this.zodToSchema(endpoint.input) } },
        };
      } else {
        const queryParams = this.extractQueryParams(endpoint.input);
        if (queryParams.length > 0) {
          operation.parameters = [...(operation.parameters ?? []), ...queryParams];
        }
      }

      paths[pathKey][methodKey] = operation;
    }

    return {
      openapi: '3.0.3',
      info,
      servers,
      paths,
      components: this.schemas.size > 0 ? { schemas: Object.fromEntries(this.schemas) } : undefined,
    };
  }

  private zodToSchema(zodType: ZodType): SchemaObject {
    const def = (zodType as any)._def;

    if (zodType instanceof ZodString) return { type: 'string' };
    if (zodType instanceof ZodNumber) return { type: 'number' };
    if (zodType instanceof ZodBoolean) return { type: 'boolean' };
    if (zodType instanceof ZodArray) return { type: 'array', items: this.zodToSchema(def.type) };
    if (zodType instanceof ZodOptional) return { ...this.zodToSchema(def.innerType), nullable: true };
    if (zodType instanceof ZodDefault) return { ...this.zodToSchema(def.innerType), default: def.defaultValue() };
    if (zodType instanceof ZodEnum) return { type: 'string', enum: def.values };

    if (zodType instanceof ZodObject) {
      const shape = zodType.shape as Record<string, ZodType>;
      const properties: Record<string, SchemaObject> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToSchema(value);
        if (!(value instanceof ZodOptional) && !(value instanceof ZodDefault)) {
          required.push(key);
        }
      }

      return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
    }

    return { type: 'object' };
  }

  private extractPathParams(path: string): ParameterObject[] {
    const params: ParameterObject[] = [];
    const regex = /:(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(path)) !== null) {
      params.push({ name: match[1], in: 'path', required: true, schema: { type: 'string' } });
    }
    return params;
  }

  private extractQueryParams(zodType: ZodType): ParameterObject[] {
    if (!(zodType instanceof ZodObject)) return [];
    const shape = zodType.shape as Record<string, ZodType>;
    return Object.entries(shape).map(([name, schema]) => ({
      name,
      in: 'query' as const,
      required: !(schema instanceof ZodOptional),
      schema: this.zodToSchema(schema),
    }));
  }
}
