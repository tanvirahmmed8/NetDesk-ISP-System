import { NextRequest, NextResponse } from "next/server";
import { getCustomer } from "@/lib/queries";
import { apiError } from "@/lib/http";
export async function GET(_request:NextRequest,context:{params:Promise<{cid:string}>}) {
  try{const {cid}=await context.params;return NextResponse.json({success:true,data:await getCustomer(cid)});}
  catch(error){return apiError(error);}
}
