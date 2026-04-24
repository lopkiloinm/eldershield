import { Pool } from "pg";
import { config } from "./config";

// Ghost-managed Postgres pool
// Ghost.build provides unlimited Postgres DBs for agents – set DATABASE_URL
// to the connection string from your Ghost project dashboard.
//
// For local dev: docker run -d -e POSTGRES_PASSWORD=postgres \
//   -e POSTGRES_DB=eldershield -p 5432:5432 postgres:16-alpine
// Then set: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/eldershield

const isPlaceholder =
  config.databaseUrl.includes("@host:") ||
  config.databaseUrl === "postgresql://user:password@host:5432/eldershield";

if (isPlaceholder) {
  console.warn(
    "[db] ⚠️  DATABASE_URL is still the placeholder value.\n" +
    "     Set a real Postgres URL in .env — see README for local Docker setup."
  );
}

// Ghost.build (Timescale Cloud) always needs SSL.
// Local connections (localhost / 127.0.0.1) do not.
const needsSsl =
  !config.databaseUrl.includes("localhost") &&
  !config.databaseUrl.includes("127.0.0.1");

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("[db] Pool error:", err.message);
});

export async function dbHealthCheck(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
