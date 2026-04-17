import { getRequestContext } from "@cloudflare/next-on-pages";

interface D1RunResult {
  success?: boolean;
  meta?: Record<string, unknown>;
}

interface D1AllResult<T> {
  results: T[];
  success?: boolean;
  meta?: Record<string, unknown>;
}

interface D1BatchResult {
  success?: boolean;
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1AllResult<T>>;
  run(): Promise<D1RunResult>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch?(statements: D1PreparedStatementLike[]): Promise<D1BatchResult[]>;
}

export function getDb(): D1DatabaseLike {
  const { env } = getRequestContext();
  const db = (env as Record<string, unknown>)?.DB;

  if (!db || typeof (db as D1DatabaseLike).prepare !== "function") {
    throw new Error("D1 数据库绑定 DB 不可用，请检查 wrangler.toml 配置。");
  }

  return db as D1DatabaseLike;
}
