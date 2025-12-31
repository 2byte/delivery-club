import { type Server as BunServer } from 'bun';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';

interface Route {
  method: HttpMethod;
  path: string;
  handler: RouteHandler;
}

export type RouteHandler = (req: Request, params?: Record<string, string>) => Response | Promise<Response>;

interface ServerOptions {
  port?: number;
  hostname?: string;
}

export class Server {
  private routes: Route[] = [];
  private server: BunServer<undefined> | null = null;
  private options: Required<ServerOptions>;

  constructor(options: ServerOptions = {}) {
    this.options = {
      port: options.port || 3000,
      hostname: options.hostname || 'localhost',
    };
  }

  /**
   * Adding GET route
   */
  public get(path: string, handler: RouteHandler): void {
    this.addRoute('GET', path, handler);
  }

  /**
   * Adding POST route
   */
  public post(path: string, handler: RouteHandler): void {
    this.addRoute('POST', path, handler);
  }

  /**
   * Adding PUT route
   */
  public put(path: string, handler: RouteHandler): void {
    this.addRoute('PUT', path, handler);
  }

  /**
   * Adding DELETE route
   */
  public delete(path: string, handler: RouteHandler): void {
    this.addRoute('DELETE', path, handler);
  }

  /**
   * Adding PATCH route
   */
  public patch(path: string, handler: RouteHandler): void {
    this.addRoute('PATCH', path, handler);
  }

  /**
   * Adding route for any HTTP method
   */
  private addRoute(method: HttpMethod, path: string, handler: RouteHandler): void {
    this.routes.push({ method, path, handler });
  }

  /**
   * Starts the server
   */
  public start(): void {
    this.server = Bun.serve({
      port: this.options.port,
      hostname: this.options.hostname,
      fetch: async (req: Request) => {
        return await this.handleRequest(req);
      },
    });

    console.log(`🚀 Сервер запущен на http://${this.options.hostname}:${this.options.port}`);
  }

  /**
   * Stops the server
   */
  public stop(): void {
    if (this.server) {
      this.server.stop();
      console.log('🛑 Server stopped');
      this.server = null;
    }
  }

  /**
   * Handles incoming requests and routes them to the appropriate handler
   */
  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method as HttpMethod;
    const pathname = url.pathname;

    // Searching for a matching route
    for (const route of this.routes) {
      if (route.method !== method) {
        continue;
      }

      const params = this.matchRoute(pathname, route.path);
      if (params !== null) {
        try {
          return await route.handler(req, params);
        } catch (error) {
          console.error('Ошибка обработки маршрута:', error);
          return this.jsonResponse(
            { error: 'Internal Server Error' },
            500
          );
        }
      }
    }

    // Route not found
    return this.jsonResponse({ error: 'Not Found' }, 404);
  }

  /**
   * Matches the request path with the route and extracts parameters
   * Supports dynamic parameters like /users/:id
   */
  private matchRoute(pathname: string, routePath: string): Record<string, string> | null {
    const pathParts = pathname.split('/').filter(Boolean);
    const routeParts = routePath.split('/').filter(Boolean);

    if (pathParts.length !== routeParts.length) {
      return null;
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < routeParts.length; i++) {
      const routePart = routeParts[i];
      const pathPart = pathParts[i];

      if (!routePart) continue;

      if (routePart.startsWith(':')) {
        // Dynamic parameter
        const paramName = routePart.slice(1);

        if (!pathPart) {
          return null; // Invalid parameter value
        }
        params[paramName] = pathPart;
      } else if (routePart !== pathPart) {
        // Parts do not match   
        return null;
      }
    }

    return params;
  }

  /**
   * Helpful method to create JSON response
   */
  public jsonResponse(data: any, status: number = 200): Response {
    // allow policy cors
    const headerAllowPolicy = { 'Access-Control-Allow-Origin': '*' };
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headerAllowPolicy,
      },
    });
  }

  /**
   * Helpful method to create text response
   */
  public textResponse(text: string, status: number = 200): Response {
    return new Response(text, {
      status,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }

  /**
   * Helpful method to create HTML response
   */
  public htmlResponse(html: string, status: number = 200): Response {
    return new Response(html, {
      status,
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }

  /**
   * Parses JSON from the request body
   */
  public async parseJson<T = any>(req: Request): Promise<T> {
    try {
      return await req.json();
    } catch (error) {
      throw new Error('Unable to parse JSON');
    }
  }

  /**
   * Parses FormData from the request body
   */
  public async parseFormData(req: Request): Promise<FormData> {
    try {
      return await req.formData();
    } catch (error) {
      throw new Error('Unable to parse FormData');
    }
  }

  /**
   * Gets query parameters from the URL
   */
  public getQueryParams(req: Request): URLSearchParams {
    const url = new URL(req.url);
    return url.searchParams;
  }

  /**
   * Gets server information
   */
  public getServerInfo(): { port: number; hostname: string; isRunning: boolean } {
    return {
      port: this.options.port,
      hostname: this.options.hostname,
      isRunning: this.server !== null,
    };
  }
}
