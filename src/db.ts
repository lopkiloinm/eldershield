import { Pool } from "pg";
import { config } from "./config";

// Ghost-managed Postgres pool
// Ghost.build provides unlimited Postgres DBs for agents – set DATABASE_URL
// to the connection string from your Ghost project dashboard.
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: config.databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

export async function dbHealthCheck(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
