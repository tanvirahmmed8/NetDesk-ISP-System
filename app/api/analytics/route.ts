import { NextRequest } from "next/server";
import { dashboardAnalytics } from "@/lib/analytics";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest) {
  const days=Number(request.nextUrl.searchParams.get("days")||30);
  if(![7,30,90].includes(days))return Response.json({success:false,message:"days must be 7, 30 or 90"},{status:400});
  try{return Response.json({success:true,data:await dashboardAnalytics(days)},{headers:{"Cache-Control":"no-store"}});}
  catch(error){console.error("Analytics query failed",(error as {code?:string}).code||"unknown");return Response.json({success:false,message:"Analytics unavailable. Check your MySQL connection and database tables."},{status:503,headers:{"Cache-Control":"no-store"}});}
}
