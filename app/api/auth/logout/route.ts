import { NextResponse } from 'next/server';
import { readSessionToken, sameOrigin, sessionCookie, tokenHash } from '@/lib/auth';
import { db } from '@/lib/db';
export async function POST(request:Request){
 if(!sameOrigin(request))return NextResponse.json({success:false,message:'Same-origin request required.'},{status:403});
 try{const token=readSessionToken(request);if(token)await db.execute('DELETE FROM app_sessions WHERE token_hash=?',[tokenHash(token)]);
  const response=NextResponse.json({success:true},{headers:{'Cache-Control':'no-store'}});response.cookies.set(sessionCookie,'',{path:'/',maxAge:0,httpOnly:true,sameSite:'lax'});return response;
 }catch{return NextResponse.json({success:false,message:'Unable to log out. Please retry.'},{status:503});}
}
