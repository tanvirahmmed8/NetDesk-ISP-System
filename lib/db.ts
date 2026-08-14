import mysql, { PoolConnection, RowDataPacket } from "mysql2/promise";

const globalForDb = globalThis as unknown as { dbPool?: mysql.Pool };

export const db = globalForDb.dbPool ?? mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "isp_system",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

if (process.env.NODE_ENV !== "production") globalForDb.dbPool = db;

export async function transaction<T>(fn: (connection: PoolConnection) => Promise<T>) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export type DbRow = RowDataPacket & Record<string, unknown>;
