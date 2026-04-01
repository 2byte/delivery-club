import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class DatabaseFile<T = Record<string, unknown>> {
  private filePath: string;
  private data: T;

  constructor(filePath: string, defaultData: T = {} as T) {
    this.filePath = filePath;
    this.data = this.load(defaultData);
  }

  private load(defaultData: T): T {
    try {
      if (existsSync(this.filePath)) {
        const fileContent = readFileSync(this.filePath, "utf-8");
        return JSON.parse(fileContent) as T;
      }

      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      this.save(defaultData);
      return defaultData;
    } catch (error) {
      console.error("Failed to load database file:", error);
      return defaultData;
    }
  }

  private save(data: T): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(this.filePath, JSON.stringify(data, null, 4), "utf-8");
      this.data = data;
    } catch (error) {
      console.error("Failed to save database file:", error);
      throw error;
    }
  }

  public getAll(): T {
    return this.data;
  }

  public get<K extends keyof T>(key: K): T[K] {
    return this.data[key];
  }

  public set<K extends keyof T>(key: K, value: T[K]): void {
    this.data[key] = value;
    this.save(this.data);
  }

  public update(updates: Partial<T>): void {
    this.data = { ...this.data, ...updates };
    this.save(this.data);
  }

  public delete<K extends keyof T>(key: K): boolean {
    if (key in this.data) {
      delete this.data[key];
      this.save(this.data);
      return true;
    }

    return false;
  }

  public clear(): void {
    this.data = {} as T;
    this.save(this.data);
  }

  public has<K extends keyof T>(key: K): boolean {
    return key in this.data;
  }

  public keys(): string[] {
    return Object.keys(this.data);
  }

  public values(): unknown[] {
    return Object.values(this.data);
  }

  public entries(): [string, unknown][] {
    return Object.entries(this.data);
  }

  public reload(): void {
    this.data = this.load(this.data);
  }

  public getFilePath(): string {
    return this.filePath;
  }
}