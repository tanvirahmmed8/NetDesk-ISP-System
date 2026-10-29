import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess, sessionUser } from './lib/auth';
import { loginRedirectUrl } from './lib/login-redirect';

export async function middleware(request:NextRequest){
 const path=request.nextUrl.pathname;
 if(path==='/login'||path.startsWith('/api/auth/'))return NextResponse.next();
 if(path.startsWith('/api/')){
  const denied=await requireAdminAccess(request);if(denied)return denied;
  const response=NextResponse.next();response.headers.set('Cache-Control','private, no-store');return response;
 }
 try{if(await sessionUser(request)){
  const response=NextResponse.next();response.headers.set('Cache-Control','private, no-store');return response;
 }}catch{/* Fail closed if the auth database has not been migrated. */}
 try{
  const response=NextResponse.redirect(loginRedirectUrl(request));
  response.headers.set('Cache-Control','private, no-store');return response;
 }catch{
  return new NextResponse('Unable to determine a safe login URL.',{status:503,headers:{'Cache-Control':'private, no-store'}});
 }
}
// Upload routes enforce requireAdminAccess inside their handlers. Excluding
// them here avoids Next 15 Node middleware cloning/locking large POST bodies.
// Do not add another exclusion without adding equivalent route-level auth.
export const config={runtime:'nodejs',matcher:['/','/login','/api/((?!(?:report-imports|import)(?:/|$)).*)']};
