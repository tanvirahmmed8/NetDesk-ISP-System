import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { RowDataPacket } from 'mysql2/promise';
import { db, transaction } from './db';

export const sessionCookie='netdesk_session';
export const sessionSeconds=8*60*60;
const derive=promisify(scrypt);
export const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function readSessionToken(request:Request){
 const cookie=(request.headers.get('cookie')||'').split(';').map(value=>value.trim()).find(value=>value.startsWith(sessionCookie+'='));
 const token=cookie?.slice(sessionCookie.length+1);return token&&/^[a-f0-9]{64}$/.test(token)?token:null;
}
export async function sessionUser(request:Request){
 const token=readSessionToken(request);if(!token)return null;
 const [rows]=await db.query<RowDataPacket[]>('SELECT u.id,u.username FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP() AND u.active=1',[tokenHash(token)]);
 return rows.length?{id:Number(rows[0].id),username:String(rows[0].username)}:null;
}
export function sameOrigin(request:Request){
 if(request.headers.get('sec-fetch-site')==='cross-site')return false;
 const origin=request.headers.get('origin');if(!origin)return false;
 try{const parsed=new URL(origin);return ['http:','https:'].includes(parsed.protocol)&&parsed.host===(request.headers.get('host')||new URL(request.url).host);}catch{return false;}
}
export async function verifyPassword(password:string,stored:string){
 const [version,salt,hash]=stored.split(':');if(version!=='scrypt'||!salt||!hash||!/^[a-f0-9]{128}$/.test(hash))return false;
 const actual=await derive(password,salt,64) as Buffer;return timingSafeEqual(actual,Buffer.from(hash,'hex'));
}
export async function login(username:string,password:string){
 const normalized=username.trim().toLowerCase();
 // Unknown accounts share a bucket so random usernames cannot bypass throttling.
 const [users]=await db.query<RowDataPacket[]>('SELECT id,username,password_hash,active FROM app_users WHERE username=?',[normalized]);
 const user=users[0];const bucket=tokenHash(user?`user:${normalized}`:'unknown-user');
 const permitted=await transaction(async connection=>{
  await connection.execute('INSERT IGNORE INTO app_login_limits(bucket,attempts,window_end) VALUES(?,0,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE))',[bucket]);
  const [rows]=await connection.query<RowDataPacket[]>('SELECT attempts,window_end<=UTC_TIMESTAMP() AS expired FROM app_login_limits WHERE bucket=? FOR UPDATE',[bucket]);
  if(rows[0].expired)await connection.execute('UPDATE app_login_limits SET attempts=1,window_end=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) WHERE bucket=?',[bucket]);
  else{if(rows[0].attempts>=10)return false;await connection.execute('UPDATE app_login_limits SET attempts=attempts+1 WHERE bucket=?',[bucket]);}return true;
 });
 if(!permitted)return {error:'Too many login attempts. Try again in 15 minutes.',status:429} as const;
 const dummy='scrypt:netdesk-dummy-salt:'+ '0'.repeat(128);
 const valid=await verifyPassword(password,user?.password_hash||dummy);
 if(!user||!user.active||!valid)return {error:'Invalid user ID or password.',status:401} as const;
 const token=randomBytes(32).toString('hex');
 await transaction(async connection=>{
  await connection.execute('DELETE FROM app_login_limits WHERE bucket=?',[bucket]);
  await connection.execute('DELETE FROM app_sessions WHERE expires_at<=UTC_TIMESTAMP()');
  await connection.execute('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))',[tokenHash(token),user.id]);
 });
 return {token,user:{id:Number(user.id),username:String(user.username)}};
}
export async function requireAdminAccess(request:Request){
 // Kept separate from MCP auth: a dashboard cookie never authenticates /mcp/v1.
 const {requireMcpKey}=await import('./mcp-settings');
 if(!requireMcpKey(request))return;
 try{if(await sessionUser(request)){
  if(!['GET','HEAD','OPTIONS'].includes(request.method)&&!sameOrigin(request))return Response.json({success:false,message:'Same-origin request required.'},{status:403});
  return;
 }}catch{return Response.json({success:false,message:'Login service unavailable. Run the auth migration.'},{status:503});}
 return Response.json({success:false,message:'Login or a valid API bearer key is required.'},{status:401});
}
