import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

// Strip options= from URL (pooler rejects it); search_path is set via connection instead
const cleanUrl = connectionString.replace(/[&?]options=[^&]*/g, "");

export const sql = postgres(cleanUrl, {
  ssl: "require",
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
  transform: { undefined: null },
  connection: { search_path: "finanzas" },
});
