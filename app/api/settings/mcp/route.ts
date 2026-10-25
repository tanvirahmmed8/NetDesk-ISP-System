import { readMcpSettings, requireMcpKey, saveMcpSettings } from "@/lib/mcp-settings";
import { InputError } from "@/lib/manage";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET() {
  try{return Response.json({success:true,data:await readMcpSettings()},{headers:{"Cache-Control":"no-store"}});}
  catch{return Response.json({success:false,message:"Unable to read MCP settings"},{status:503});}
}
export async function PUT(request:Request) {
  const denied=requireMcpKey(request);if(denied)return denied;
  try {
    let body;try{body=await request.json();}catch{throw new InputError("Invalid JSON");}
    const data=await saveMcpSettings(body?.origins);
    return Response.json({success:true,message:"MCP origins saved. Changes apply immediately.",data},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return Response.json({success:false,message:error instanceof InputError?error.message:"Unable to save settings. Check server directory permissions."},{status:error instanceof InputError?400:500});}
}
