import { NextRequest, NextResponse } from "next/server";
import { entities, Entity, manage, InputError, errorMessage } from "@/lib/manage";
import { requireMcpKey } from "@/lib/mcp-settings";
import { customerExtraFields, ticketExtraFields } from "@/lib/ops-schema";

async function handle(request: NextRequest, context: {params:Promise<{entity:string}>}) {
  try {
    const {entity} = await context.params;
    if (!entities.includes(entity as Entity)) throw new InputError("Invalid entity");
    if(request.method==="DELETE"&&entity!=="packages"){const denied=requireMcpKey(request);if(denied)return denied;}
    let body; try { body = await request.json(); } catch { throw new InputError("Invalid JSON"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Expected a JSON object");
    const extra=entity === "customers"?customerExtraFields:entity === "tickets"?ticketExtraFields:{};
    if(Object.keys(extra).some(key=>Object.prototype.hasOwnProperty.call(body,key))){const denied=requireMcpKey(request);if(denied)return denied;}
    const action = request.method === "POST" ? "create" : request.method === "PUT" ? "update" : "delete";
    const data = await manage(entity as Entity,action,body);
    const noteAdded="action" in data && data.action === "note_added";
    const message=noteAdded?"Complaint added as a note to the existing unresolved ticket.":`${entity.slice(0,-1)} ${action === "delete" ? "deleted" : action === "create" ? "created" : "updated"} successfully`;
    return NextResponse.json({success:true,message,data:{...data,message}},{status:action === "create" && !noteAdded?201:200});
  } catch(error) { return NextResponse.json({success:false,message:errorMessage(error)},{status:error instanceof InputError ? error.status : (error as {code?:string})?.code === "ER_DUP_ENTRY" ? 409 : 500}); }
}
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
