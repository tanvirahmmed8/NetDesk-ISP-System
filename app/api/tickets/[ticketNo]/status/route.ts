import { NextRequest, NextResponse } from "next/server";
import { setTicketStatus } from "@/lib/operations";
import { apiError } from "@/lib/http";
export async function PATCH(request:NextRequest,context:{params:Promise<{ticketNo:string}>}) {
  try {
    const {ticketNo}=await context.params;
    const body=await request.json();
    const data=await setTicketStatus(ticketNo,body?.status);
    return NextResponse.json({success:true,message:"Ticket status updated",data});
  }catch(error){return apiError(error);}
}
