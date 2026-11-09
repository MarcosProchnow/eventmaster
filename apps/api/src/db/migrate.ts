import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createPool } from "./client.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");

const pool = createPool(url);
try {
  await migrate(createDb(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrations aplicadas.");
} finally {
  await pool.end();
}
