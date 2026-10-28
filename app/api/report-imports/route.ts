import { requireAdminAccess } from "@/lib/auth";
import { NextRequest } from "next/server";

import { apiError } from "@/lib/http";
import { InputError } from "@/lib/errors";
import { previewReport,stageReport,listReportBatches,readReportBatch,editReportRow,commitReport,revalidateReport } from "@/lib/report-imports";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){const denied=await requireAdminAccess(request);if(denied)return denied;try{const id=request.nextUrl.searchParams.get("id");return Response.json({success:true,data:id?await readReportBatch(Number(id)):await listReportBatches()},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){const denied=await requireAdminAccess(request);if(denied)return denied;try{const body=await request.json();if(!body||typeof body!=="object"||Array.isArray(body))throw new InputError("Expected JSON object");let data;switch(body.action){case"preview":data=await previewReport(body);break;case"stage":data=await stageReport(body);break;case"edit":data=await editReportRow(Number(body.batchId),Number(body.rowId),body.payload,!!body.skip);break;case"revalidate":data=await revalidateReport(Number(body.batchId),body.options||{});break;case"commit":data=await commitReport(Number(body.batchId),body.rowIds);break;default:throw new InputError("Unknown report action");}return Response.json({success:true,data});}catch(error){return apiError(error);}}
