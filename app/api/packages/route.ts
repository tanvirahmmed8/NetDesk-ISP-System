import { NextResponse } from "next/server";
import { db, DbRow } from "@/lib/db";
import { apiError } from "@/lib/http";

export async function GET() {
  try {
    const [packages] = await db.query<DbRow[]>(`
      SELECT id, name, speed_mbps AS speedMbps, price
      FROM packages ORDER BY price ASC
    `);
    return NextResponse.json({ success: true, data: packages });
  } catch (error) {
    return apiError(error);
  }
}
