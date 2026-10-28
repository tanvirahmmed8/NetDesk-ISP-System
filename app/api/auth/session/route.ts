import { sessionUser } from '@/lib/auth';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{const user=await sessionUser(request);return Response.json({success:!!user,user},{status:user?200:401,headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({success:false,message:'Login service unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
