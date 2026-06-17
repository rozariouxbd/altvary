import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Build the Prisma client once. Prisma 7 needs a driver adapter; we use the pooled
 * DATABASE_URL (Supavisor transaction mode, port 6543) for app runtime queries.
 *
 * The node-postgres Pool is capped and given a short idle timeout: each process (every
 * Vercel lambda + the dev server) otherwise opens up to pg's default of 10 connections
 * and holds them open forever, and those accumulate against Supavisor's ~200 client-
 * connection ceiling until new connections are refused ("EMAXCONN max client connections").
 * A small max + idle reaping keeps each process's footprint tiny. Override with PG_POOL_MAX.
 */
function createPrisma(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error"] : [],
  });
}

// Reuse a single client across HMR reloads in dev (the global guard) so we never spawn a
// second Pool that leaks its connections to the pooler. Only construct on a cache miss.
export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
