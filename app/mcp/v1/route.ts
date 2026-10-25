import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp";
import { readMcpSettings, requireMcpKey } from "@/lib/mcp-settings";

export const runtime="nodejs";
export const dynamic="force-dynamic";
function cors(request:NextRequest,response:Response,origins:string[]) {
  const origin=request.headers.get("origin");
  if(origin && origins.includes(origin)){
    response.headers.set("Access-Control-Allow-Origin",origin);
    response.headers.set("Access-Control-Expose-Headers","Mcp-Session-Id, MCP-Protocol-Version");
    response.headers.append("Vary","Origin");
  }
  response.headers.set("Cache-Control","no-store");
  return response;
}
async function handle(request:NextRequest) {
  let origins:string[];
  try{origins=(await readMcpSettings()).origins;}
  catch{return Response.json({error:"Unable to load MCP origin settings"},{status:503});}
  const origin=request.headers.get("origin");
  if(origin && !origins.includes(origin))return Response.json({error:"Origin not allowed"},{status:403});
  if(request.method==="OPTIONS")return cors(request,new Response(null,{status:204,headers:{"Access-Control-Allow-Methods":"POST, GET, DELETE, OPTIONS","Access-Control-Allow-Headers":"Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID"}}),origins);
  const rejected=requireMcpKey(request);if(rejected)return cors(request,rejected,origins);
  if(request.method!=="POST")return cors(request,Response.json({error:"Use MCP Streamable HTTP POST. Standalone SSE is not provided."},{status:405,headers:{Allow:"POST, OPTIONS"}}),origins);
  const server=createMcpServer();
  const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true,maxRequestBodySize:2*1024*1024});
  try{await server.connect(transport);return cors(request,await transport.handleRequest(request),origins);}
  catch{return cors(request,Response.json({jsonrpc:"2.0",id:null,error:{code:-32603,message:"Unable to process MCP request"}},{status:500}),origins);}
  finally{await server.close();}
}
export const POST=handle;
export const GET=handle;
export const DELETE=handle;
export const OPTIONS=handle;
