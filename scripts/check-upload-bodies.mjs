import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { randomBytes, createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import ts from 'typescript';
const helper=ts.transpileModule(fs.readFileSync('lib/api-response.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const {readApiResponse}=await import('data:text/javascript;base64,'+Buffer.from(helper).toString('base64'));
assert.deepEqual(await readApiResponse(new Response('{"success":true,"data":[1]}')),{success:true,data:[1]});
for(const status of [413,500,502,504])await assert.rejects(()=>readApiResponse(new Response('<!DOCTYPE html><title>Proxy error</title>',{status})),new RegExp(`HTTP ${status}`));
await assert.rejects(()=>readApiResponse(new Response('{"success":false,"message":"Sign in required"}',{status:401})),/Sign in required/);
await assert.rejects(()=>readApiResponse(new Response('null')),/invalid response/);
if(fs.existsSync('.env'))process.loadEnvFile('.env');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3018';
const token=randomBytes(32).toString('hex'),username=`upload-check-${Date.now()}`;
const connection=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'isp_system'});
let userId;
const cookie=`netdesk_session=${token}`,origin=new URL(base).origin;
const headers={'Content-Type':'application/json',Cookie:cookie,Origin:origin};
async function streamed(path,body,extra={}){
 const buffer=Buffer.from(JSON.stringify(body)),url=new URL(path,base),transport=url.protocol==='https:'?https:http;
 return new Promise((resolve,reject)=>{
  const request=transport.request(url,{method:'POST',headers:{...headers,'Content-Length':buffer.length,...extra}},response=>{let text='';response.setEncoding('utf8');response.on('data',chunk=>{text+=chunk;});response.on('end',()=>{let json;try{json=JSON.parse(text);}catch{reject(new Error(`Expected JSON, received HTTP ${response.statusCode}: ${text.slice(0,100)}`));return;}resolve({status:response.statusCode,json});});});
  request.setTimeout(60000,()=>request.destroy(new Error('Upload test timed out')));request.on('error',reject);
  let offset=0;function send(){if(request.destroyed)return;if(offset>=buffer.length){request.end();return;}const chunk=buffer.subarray(offset,offset+4096);offset+=chunk.length;request.write(chunk);setTimeout(send,2);}send();
 });
}
try{
 const [created]=await connection.execute('INSERT INTO app_users(username,password_hash) VALUES(?,?)',[username,`scrypt:${randomBytes(16).toString('hex')}:${randomBytes(64).toString('hex')}`]);userId=created.insertId;
 await connection.execute('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))',[createHash('sha256').update(token).digest('hex'),userId]);
 for(const path of ['/api/import','/api/report-imports']){
  const rejected=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(rejected.status,401);assert.equal((await rejected.json()).success,false);
 }
 // Large preview requests only: no tickets, customers or batches are created.
 const csv='Ticket NO,Ticket Source,Subject,Priority,Status,Customer ID,Name,Mobile No.,Customer Name,Message,Entry Date Time,Resolved Date\nUPLOAD-TEST,Phone,Nms down,High,Resolved,UNMATCHED-UPLOAD,Test reporter,01700000000,Test account,Synthetic preview only,8/10/2026 9:00,8/10/2026 10:00';
 const preview={action:'preview',kind:'tickets',csv,options:{dateFormat:'MDY',contactRole:'employee'},padding:'x'.repeat(300000)};
 for(let i=0;i<3;i++){
  const result=await streamed('/api/report-imports',preview);assert.equal(result.status,200);assert.equal(result.json.data.rows.length,1);assert.ok(result.json.data.rows[0].issues.length,'Unmatched CID must remain in review');
 }
 const denied=await streamed('/api/report-imports',preview,{Origin:'https://evil.example'});assert.equal(denied.status,403);
 const bulk=await streamed('/api/import',{entity:'invalid',rows:[],padding:'x'.repeat(300000)});assert.equal(bulk.status,400);assert.equal(bulk.json.success,false);
 const malformed=await fetch(base+'/api/report-imports',{method:'POST',headers,body:'{'});assert.equal(malformed.status,400);assert.equal((await malformed.json()).success,false);
 if(fs.existsSync('data/tickets-template.csv')){
  const actual=await streamed('/api/report-imports',{action:'preview',kind:'tickets',csv:fs.readFileSync('data/tickets-template.csv','utf8'),options:{dateFormat:'MDY',contactRole:'employee',createReferences:true}});
  assert.equal(actual.status,200);assert.equal(actual.json.success,true);assert.equal(actual.json.data.rows.length,332);console.log('Actual 332-row ticket CSV previewed only; no source records imported.');
 }
 await connection.execute('UPDATE app_sessions SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE user_id=?',[userId]);
 const after=await streamed('/api/report-imports',{action:'preview',kind:'tickets',csv});assert.equal(after.status,401);
 console.log('PASS: repeated streamed 300 KB cookie-authenticated requests, report preview, basic-upload JSON validation, unauthenticated/expired-session rejection, CSRF and malformed JSON. No tickets or review batches created.');
}finally{if(userId)await connection.execute('DELETE FROM app_users WHERE id=?',[userId]);await connection.end();}
