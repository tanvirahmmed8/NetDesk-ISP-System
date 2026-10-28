import { requireAdminAccess } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { listOperations, writeOperation, operationalDetails } from "@/lib/ops";
import { apiError } from "@/lib/http";

export const dynamic="force-dynamic";
export async function GET(request:NextRequest){const denied=await requireAdminAccess(request);if(denied)return denied;try{const params=request.nextUrl.searchParams;const data=params.get("detail")?await operationalDetails(params.get("entity")||"",params.get("key")||""):await listOperations(params.get("entity")||"pops",params.get("cid")||undefined);return NextResponse.json({success:true,data},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiError(error);}}
async function write(request:NextRequest){const denied=await requireAdminAccess(request);if(denied)return denied;try{const body=await request.json();return NextResponse.json({success:true,data:await writeOperation(request.nextUrl.searchParams.get("entity")||"",request.method==="POST"?"create":request.method==="PUT"?"update":"delete",body),message:"Saved successfully"});}catch(error){return apiError(error);}}
export const POST=write;export const PUT=write;export const DELETE=write;
