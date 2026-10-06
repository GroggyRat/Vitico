/** Empties every table (keeps the schema). Used to reset test databases. */
import { createDb } from "../src/index";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to truncate in production.");

const db = createDb();
const tables = await db.$queryRaw<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
await db.$disconnect();
