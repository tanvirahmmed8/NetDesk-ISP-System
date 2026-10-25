import fs from "node:fs/promises";
import mysql from "mysql2/promise";

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).flatMap(line => {
    const value = line.trim();
    if (!value || value.startsWith("#") || !value.includes("=")) return [];
    const split = value.indexOf("=");
    const key = value.slice(0, split).trim();
    const raw = value.slice(split + 1).trim();
    return [[key, raw.replace(/^(['"])(.*)\1$/, "$2")]];
  }));
}

const fileEnv = parseEnv(await fs.readFile(".env", "utf8"));
const config = { ...fileEnv, ...process.env };
const schema = await fs.readFile("database/schema.sql", "utf8");

const connection = await mysql.createConnection({
  host: config.DB_HOST ?? "127.0.0.1",
  port: Number(config.DB_PORT ?? 3306),
  user: config.DB_USER ?? "root",
  password: config.DB_PASSWORD ?? "",
  multipleStatements: true,
});

try {
  const database=config.DB_NAME??"isp_system";
  const [existing]=await connection.query("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?",[database]);
  if(!existing.length)await connection.query("CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",[database]);
  await connection.query("USE ??",[database]);
  await connection.query(schema.replace(/^CREATE DATABASE[^;]+;\s*USE[^;]+;\s*/i,""));
  console.log(`Database ${config.DB_NAME ?? "isp_system"} migrated and seeded successfully.`);
} finally {
  await connection.end();
}
