import { NextRequest, NextResponse } from 'next/server';
import { login, sameOrigin, sessionCookie, sessionSeconds } from '@/lib/auth';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 if(!sameOrigin(request))return NextResponse.json({success:false,message:'Same-origin request required.'},{status:403});
 try{
  const text=await request.text();if(text.length>4096)return NextResponse.json({success:false,message:'Invalid login input.'},{status:400});
  let body;try{body=JSON.parse(text);}catch{return NextResponse.json({success:false,message:'Invalid JSON.'},{status:400});}
  if(typeof body?.username!=='string'||typeof body?.password!=='string'||!body.username.trim()||body.username.length>80||!body.password||body.password.length>256)return NextResponse.json({success:false,message:'Enter your user ID and password.'},{status:400});
  const result=await login(body.username,body.password);
  if('error' in result)return NextResponse.json({success:false,message:result.error},{status:result.status,headers:{'Cache-Control':'no-store'}});
  const response=NextResponse.json({success:true,user:result.user},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set(sessionCookie,result.token,{httpOnly:true,secure:process.env.AUTH_COOKIE_SECURE!=='false'&&(process.env.NODE_ENV==='production'||process.env.AUTH_COOKIE_SECURE==='true'),sameSite:'lax',path:'/',maxAge:sessionSeconds});return response;
 }catch{return NextResponse.json({success:false,message:'Login unavailable. Check the database and run npm run db:migrate:auth.'},{status:503});}
}
