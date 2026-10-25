import { NextRequest, NextResponse } from "next/server";
import { POST as create, PUT as update, DELETE as remove } from "../manage/[entity]/route";
import { db, DbRow } from "@/lib/db";
import { apiError } from "@/lib/http";
import { packageColumns, presentPackage } from "@/lib/package-details";

export async function GET() {
  try {
    const [packages] = await db.query<DbRow[]>(`
      SELECT p.id, p.name, p.speed_mbps AS speedMbps, p.price,${packageColumns()}
      FROM packages p ORDER BY p.price ASC
    `);
    return NextResponse.json({ success: true, data: packages.map(presentPackage) });
  } catch (error) {
    return apiError(error);
  }
}

const context = {params:Promise.resolve({entity:"packages"})};
export async function POST(request:NextRequest) {return create(request,context);}
export async function PUT(request:NextRequest) {return update(request,context);}
export async function DELETE(request:NextRequest) {return remove(request,context);}
