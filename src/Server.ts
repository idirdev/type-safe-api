import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { Router } from './Router.js';
import { ServerOptions, HttpMethod, CorsOptions, Context } from './types.js';

export class Server {
  private server: ReturnType<typeof createServer> | null = null;
  private router: Router;
  private options: Required<ServerOptions>;

  constructor(router: Router, options: ServerOptions = {}) {
    this.router = router;
    this.options = {
      port: options.port ?? 3000,
      cors: options.cors ?? false,
      prefix: options.prefix ?? '',
      onError: options.onError ?? this.defaultErrorHandler.bind(this),
    };
  }

  async listen(port?: number): Promise<void> {
    const listenPort = port ?? this.options.port;

    this.server = createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (err) {
        console.error('Unhandled server error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }));
      }
    });

    return new Promise((resolve) => {
      this.server!.listen(listenPort, () => {
        console.log(`Type-safe API server running on http://localhost:${listenPort}`);
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (this.options.cors) {
      this.applyCors(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    let path = url.pathname;

    if (this.options.prefix && path.startsWith(this.options.prefix)) {
      path = path.slice(this.options.prefix.length) || '/';
    }

    const method = (req.method?.toUpperCase() ?? 'GET') as HttpMethod;
    const query = this.parseQuery(url.searchParams);
    const headers = this.parseHeaders(req.headers);
    const body = await this.parseBody(req);

    const result = await this.router.handle(method, path, {
      input: body ?? query,
      query,
      headers,
    });

    const statusCode = this.resolveStatusCode(result);
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  }

  private parseQuery(searchParams: URLSearchParams): Record<string, string | string[]> {
    const query: Record<string, string | string[]> = {};
    for (const [key, value] of searchParams.entries()) {
      const existing = query[key];
      if (existing) {
        query[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      } else {
        query[key] = value;
      }
    }
    return query;
  }

  private parseHeaders(headers: IncomingMessage['headers']): Record<string, string> {
    const parsed: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value) parsed[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
    }
    return parsed;
  }

  private parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
      if (req.method === 'GET' || req.method === 'DELETE') return resolve(null);

      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (!raw) return resolve(null);
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(null);
        }
      });
      req.on('error', () => resolve(null));
    });
  }

  private applyCors(req: IncomingMessage, res: ServerResponse): void {
    const corsOpts: CorsOptions = typeof this.options.cors === 'object'
      ? this.options.cors
      : { origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] };

    const origin = typeof corsOpts.origin === 'string'
      ? corsOpts.origin
      : Array.isArray(corsOpts.origin)
        ? (corsOpts.origin.includes(req.headers.origin ?? '') ? req.headers.origin! : corsOpts.origin[0])
        : (corsOpts.origin.test(req.headers.origin ?? '') ? req.headers.origin! : '');

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', (corsOpts.methods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).join(', '));
    res.setHeader('Access-Control-Allow-Headers', (corsOpts.allowedHeaders ?? ['Content-Type', 'Authorization']).join(', '));
    if (corsOpts.credentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (corsOpts.maxAge) res.setHeader('Access-Control-Max-Age', String(corsOpts.maxAge));
  }

  private resolveStatusCode(result: { success: boolean; error?: { code: string } }): number {
    if (result.success) return 200;
    switch (result.error?.code) {
      case 'NOT_FOUND': return 404;
      case 'VALIDATION_ERROR': return 400;
      case 'UNAUTHORIZED': return 401;
      case 'FORBIDDEN': return 403;
      default: return 500;
    }
  }

  private defaultErrorHandler(error: Error, _ctx: Context) {
    return {
      success: false as const,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    };
  }
}
