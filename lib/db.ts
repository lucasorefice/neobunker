import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Reuse one pool across dev hot-reloads (Next re-evaluates modules on change).
const globalForDb = globalThis as unknown as { __neobunkerPool?: Pool };

const pool =
  globalForDb.__neobunkerPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") globalForDb.__neobunkerPool = pool;

export const db = drizzle(pool, { schema });
