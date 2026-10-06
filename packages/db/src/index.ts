import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

export type Db = InstanceType<typeof PrismaClient>;

export function createDb(connectionString = process.env.DATABASE_URL): Db {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Reuse one client across hot reloads in development.
const globalForDb = globalThis as unknown as { viticoDb?: Db };

export function getDb(): Db {
  globalForDb.viticoDb ??= createDb();
  return globalForDb.viticoDb;
}
