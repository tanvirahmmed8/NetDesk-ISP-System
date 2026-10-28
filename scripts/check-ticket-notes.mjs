import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
if(fs.existsSync('.env'))process.loadEnvFile('.env');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3018',stamp=Date.now(),cid=`NOTE-${stamp}`;
const headers={'Content-Type':'application/json',Authorization:`Bearer ${process.env.MCP_API_KEY}`};
const connection=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'isp_system'});
const ticketNos=[];let packageId,userId,customerCreated=false;
async function api(path,method='GET',body,customHeaders=headers){const response=await fetch(base+path,{method,headers:customHeaders,...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,...await response.json()};}
try{
 assert.equal((await api('/api/tickets/123456/notes','POST',{note:'unauthorized'},{'Content-Type':'application/json'})).status,401);
 const pkg=await api('/api/packages','POST',{name:`Notes plan ${stamp}`,speedMbps:10,price:500});assert.equal(pkg.success,true);packageId=pkg.data.id;
 const customer=await api('/api/customers','POST',{cid,name:'Notes test customer',phone:'01700000001',packageId,nextPaymentDate:null,accountStatus:'active'});assert.equal(customer.success,true);customerCreated=true;
 const complaint={cid,category:'billing',subject:'Notes test',description:'Original description must remain unchanged',status:'resolved',priority:'medium'};
 for(let i=0;i<2;i++){const result=await api('/api/tickets','POST',complaint);assert.equal(result.success,true,result.message);assert.match(result.data.ticketNo,/^[1-9]\d{5}$/);ticketNos.push(result.data.ticketNo);}
 assert.notEqual(ticketNos[0],ticketNos[1]);
 const legacyNo=`TKT-legacy-note-${stamp}`;
 await connection.execute('INSERT INTO tickets(ticket_no,customer_id,category,subject,description,status,priority) SELECT ?,id,\'other\',\'Legacy notes\',\'Legacy description\',\'open\',\'low\' FROM customers WHERE cid=?',[legacyNo,cid]);ticketNos.push(legacyNo);
 const initial=await api(`/api/tickets?ticketNo=${ticketNos[0]}`);assert.equal(initial.success,true);assert.ok(Number.isInteger(initial.data.ticket.id));const resolvedAt=initial.data.ticket.resolvedAt;
 const path=`/api/tickets/${ticketNos[0]}/notes`;
 const first=await api(path,'POST',{note:'First update\nCalled customer.'});assert.equal(first.status,201);assert.ok(first.data.id);
 const second=await api(path,'POST',{note:'Second update – customer replied.'});assert.equal(second.status,201);
 let notes=(await api(path)).data;assert.equal(notes.length,2);
 assert.equal((await api(`/api/tickets/${ticketNos[1]}/notes`,'PUT',{id:first.data.id,note:'Wrong ticket'})).status,404);
 assert.equal((await api(`/api/tickets/${ticketNos[1]}/notes`,'DELETE',{id:first.data.id})).status,404);
 assert.equal((await api(path,'POST',{note:'   '})).status,400);assert.equal((await api(path,'POST',{note:'x'.repeat(10001)})).status,400);
 assert.equal((await api(path,'PUT',{id:first.data.id,note:'Updated first note'})).status,200);
 notes=(await api(path)).data;assert.equal(notes.find(row=>row.id===first.data.id).note,'Updated first note');
 const detail=(await api(`/api/tickets?ticketNo=${ticketNos[0]}`)).data;assert.equal(detail.ticket.description,complaint.description);assert.equal(detail.ticket.status,'resolved');assert.equal(detail.ticket.resolvedAt,resolvedAt);assert.equal(detail.notes.length,2);
 const history=(await api(`/api/operations?detail=1&entity=tickets&key=${ticketNos[0]}`)).data.events;assert.ok(history.some(event=>event.action==='create_note'));assert.ok(history.some(event=>event.action==='update_note'));
 assert.equal((await api(path,'DELETE',{id:first.data.id})).status,200);assert.equal((await api(path)).data.length,1);
 const token=randomBytes(32).toString('hex'),username=`note-check-${stamp}`;
 const [user]=await connection.execute('INSERT INTO app_users(username,password_hash) VALUES(?,?)',[username,`scrypt:test:${randomBytes(64).toString('hex')}`]);userId=user.insertId;
 await connection.execute('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))',[createHash('sha256').update(token).digest('hex'),userId]);
 const cookieHeaders={'Content-Type':'application/json',Cookie:`netdesk_session=${token}`,Origin:new URL(base).origin};
 assert.equal((await api(path,'POST',{note:'Rejected cross-site'},{...cookieHeaders,Origin:'https://evil.example'})).status,403);
 assert.equal((await api(path,'POST',{note:'Session user note'},cookieHeaders)).status,201);
 const events=(await api(`/api/operations?detail=1&entity=tickets&key=${ticketNos[0]}`)).data.events;assert.ok(events.some(event=>event.action==='create_note'&&event.actorName===username));
 const legacyNote=await api(`/api/tickets/${encodeURIComponent(legacyNo)}/notes`,'POST',{note:'Legacy reference still works'});assert.equal(legacyNote.status,201);assert.equal((await api(`/api/tickets?ticketNo=${legacyNo}`)).data.ticket.ticketNo,legacyNo);
 const listed=(await api('/api/tickets')).data;assert.ok(listed.some(ticket=>ticket.ticketNo===ticketNos[0]&&Number.isInteger(ticket.id)&&ticket.noteCount===2));
 console.log('PASS: six-digit ticket references, numeric list IDs, multi-note CRUD, note ownership/validation, preserved description/resolution, session/CSRF protection, actor history and unchanged legacy references.');
}finally{
 for(const ticketNo of ticketNos)await api('/api/tickets','DELETE',{ticketNo});
 if(customerCreated)await api('/api/customers','DELETE',{cid});if(packageId)await api('/api/packages','DELETE',{id:packageId});
 if(userId)await connection.execute('DELETE FROM app_users WHERE id=?',[userId]);
 for(const key of [...ticketNos,cid])await connection.execute("DELETE FROM activity_events WHERE entity IN ('customers','tickets') AND record_key=?",[key]);
 await connection.end();
}
