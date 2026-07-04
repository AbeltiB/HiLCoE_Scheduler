import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";

async function main() {
  const sql = readFileSync(join(__dirname, "hardening.sql"), "utf8");
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Hardening applied.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Hardening failed:", err.message);
  process.exit(1);
});