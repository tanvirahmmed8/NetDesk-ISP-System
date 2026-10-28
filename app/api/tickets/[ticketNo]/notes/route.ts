import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess, sessionUser } from '@/lib/auth';
import { manageTicketNote } from '@/lib/ticket-notes';
import { getTicket } from '@/lib/queries';
import { apiError } from '@/lib/http';
import { InputError } from '@/lib/errors';
export const dynamic='force-dynamic';
type Context={params:Promise<{ticketNo:string}>};
export async function GET(request:NextRequest,context:Context){
 const denied=await requireAdminAccess(request);if(denied)return denied;
 try{const {ticketNo}=await context.params;const data=await getTicket(ticketNo);return NextResponse.json({success:true,data:data.notes},{headers:{'Cache-Control':'no-store'}});}catch(error){return apiError(error);}
}
async function write(request:NextRequest,context:Context){
 const denied=await requireAdminAccess(request);if(denied)return denied;
 try{
  const {ticketNo}=await context.params;const body=await request.json();
  if(!body||typeof body!=='object'||Array.isArray(body))throw new InputError('Expected a JSON object');
  const user=await sessionUser(request);
  const data=await manageTicketNote(request.method==='POST'?'create':request.method==='PUT'?'update':'delete',{...body,ticketNo},user?.username??null);
  return NextResponse.json({success:true,data,message:request.method==='POST'?'Note added':request.method==='PUT'?'Note updated':'Note deleted'},{status:request.method==='POST'?201:200,headers:{'Cache-Control':'no-store'}});
 }catch(error){return apiError(error);}
}
export const POST=write;export const PUT=write;export const DELETE=write;
