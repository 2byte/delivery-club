import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface ServerScaffoldOptions {
  outputDir?: string;
  force?: boolean;
  hostAddress?: string;
  hostPort?: number;
}

export interface ServerScaffoldResult {
  created: string[];
  skipped: string[];
  outputDir: string;
}

export class ServerScaffoldGenerator {
  private static readonly DEFAULT_HOST_ADDRESS = "0.0.0.0";
  private static readonly DEFAULT_HOST_PORT = 3004;

  public createConsumerBootstrap(options: ServerScaffoldOptions = {}): ServerScaffoldResult {
    const outputDir = resolve(options.outputDir || process.cwd());
    const force = Boolean(options.force);
    const hostAddress = options.hostAddress || ServerScaffoldGenerator.DEFAULT_HOST_ADDRESS;
    const hostPort = options.hostPort || ServerScaffoldGenerator.DEFAULT_HOST_PORT;

    this.ensureDirectory(outputDir);

    const templates = [
      {
        path: join(outputDir, ".env.example"),
        content: this.getEnvExampleTemplate(hostAddress, hostPort),
      },
      {
        path: join(outputDir, ".env"),
        content: this.getEnvTemplate(hostAddress, hostPort),
      },
      {
        path: join(outputDir, "index.ts"),
        content: this.getIndexTemplate(),
      },
    ];

    const created: string[] = [];
    const skipped: string[] = [];

    for (const template of templates) {
      if (!force && existsSync(template.path)) {
        skipped.push(template.path);
        continue;
      }

      writeFileSync(template.path, template.content, "utf-8");
      created.push(template.path);
    }

    return {
      created,
      skipped,
      outputDir,
    };
  }

  private ensureDirectory(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  private getEnvExampleTemplate(hostAddress: string, hostPort: number): string {
    return [
      `HOST_ADDRESS=${hostAddress}`,
      `HOST_PORT=${hostPort}`,
      "",
    ].join("\n");
  }

  private getEnvTemplate(hostAddress: string, hostPort: number): string {
    return [
      `HOST_ADDRESS=${hostAddress}`,
      `HOST_PORT=${hostPort}`,
      "",
    ].join("\n");
  }

  private getIndexTemplate(): string {
    return [
      'import { SoftDeliveryServer } from "@delivery-club/server";',
      "",
      "const server = new SoftDeliveryServer({",
      '  hostname: import.meta.env.HOST_ADDRESS || "0.0.0.0",',
      '  port: Number(import.meta.env.HOST_PORT) || 3004,',
      "});",
      "",
      "server.run();",
      "",
    ].join("\n");
  }
}