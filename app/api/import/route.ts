import { requireAdminAccess } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { importRows } from "@/lib/operations";
import { apiError } from "@/lib/http";

export async function POST(request: NextRequest) {
  // Uploads bypass Node middleware, so enforce auth before reading any body.
  const denied=await requireAdminAccess(request);if(denied)return denied;
  try { const body=await request.json();return NextResponse.json({success:true,data:await importRows(body?.entity,body?.rows)}); }
  catch(error){return apiError(error);}
}
