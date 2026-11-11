import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createPool } from "../src/db/client.ts";

export const TEST_URL =
  process.env.DATABASE_URL_TEST ??
  "postgres://eventmaster:eventmaster@localhost:5432/eventmaster_test";

export default async function setup() {
  const pool = createPool(TEST_URL);
  try {
    // Recria os schemas para começar sempre limpo.
    for (const s of ["identity", "events", "sales", "payments", "notifications", "drizzle", "pgboss"]) {
      await pool.query(`drop schema if exists ${s} cascade`);
    }
    await migrate(createDb(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
