import { requireAdminAccess } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { importRows } from "@/lib/operations";
import { apiError } from "@/lib/http";

import { customerExtraFields, ticketExtraFields } from "@/lib/ops-schema";
export async function POST(request: NextRequest) {
  try { const body=await request.json();const fields=body?.entity==="customers"?customerExtraFields:body?.entity==="tickets"?ticketExtraFields:{};if(Array.isArray(body?.rows)&&body.rows.some((row:unknown)=>row&&typeof row==="object"&&Object.keys(fields).some(key=>key in row))){const denied=await requireAdminAccess(request);if(denied)return denied;}return NextResponse.json({success:true,data:await importRows(body?.entity,body?.rows)}); }
  catch(error){return apiError(error);}
}
