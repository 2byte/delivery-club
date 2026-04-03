declare module "@2byte/bun-server" {
  export type RouteHandler = (
    req: Request,
    params?: Record<string, string>,
  ) => Response | Promise<Response>;

  export interface ServerOptions {
    port?: number;
    hostname?: string;
  }

  export class BunServerWrapper {
    constructor(options?: ServerOptions);
    get(path: string, handler: RouteHandler): void;
    post(path: string, handler: RouteHandler): void;
    put(path: string, handler: RouteHandler): void;
    delete(path: string, handler: RouteHandler): void;
    patch(path: string, handler: RouteHandler): void;
    start(): void;
    stop(): void;
    maxRequestBodySize(bytes: number): void;
  }
}
