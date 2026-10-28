import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess, sessionUser } from './lib/auth';

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
 const target=new URL('/login',request.url);return NextResponse.redirect(target);
}
export const config={runtime:'nodejs',matcher:['/','/login','/api/:path*']};
