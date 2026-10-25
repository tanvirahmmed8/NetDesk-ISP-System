import assert from "node:assert/strict";
import fs from "node:fs/promises";
import mysql from "mysql2/promise";
process.loadEnvFile(".env");
const base=process.env.TEST_BASE_URL||"http://127.0.0.1:3018",stamp=Date.now().toString(),cid=`OPS-${stamp}`;
const headers={"Content-Type":"application/json",Authorization:`Bearer ${process.env.MCP_API_KEY}`};
const resources=[],ticketNos=[],customerCids=[],batchIds=[];let packageId;
async function api(path,method="GET",body){const response=await fetch(base+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});return {http:response.status,...await response.json()};}
async function add(entity,body){const result=await api(`/api/operations?entity=${entity}`,"POST",body);assert.equal(result.success,true,result.message||result.error);resources.push({entity,id:result.data.id});return result.data.id;}
const csvRow=values=>values.map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(',');
const csv=(headers,rows,preamble="")=>preamble+headers.join(',')+'\n'+rows.map(csvRow).join('\n');
try{
 for(const url of ["/api/operations?entity=employees","/api/operations?entity=invoices","/api/report-imports"])assert.equal((await fetch(base+url)).status,401);
 const p=await api("/api/packages","POST",{name:`OPS plan ${stamp}`,speedMbps:30,price:650,vatPercent:5,vatIncluded:false});assert.equal(p.success,true);packageId=p.data.id;
 const popId=await add("pops",{name:`OPS POP ${stamp}`,type:"channel_partner",district:"Dhaka",upazila:"Mirpur"});
 const teamId=await add("teams",{name:`OPS Team ${stamp}`,popId});
 const employeeId=await add("employees",{name:`OPS Employee ${stamp}`,phone:"01799999999",role:"technician",teamId});
 const issue1=await add("issue-types",{name:`OPS Upgrade ${stamp}`,category:"other",kind:"service_request"});
 const issue2=await add("issue-types",{name:`OPS Router ${stamp}`,category:"other",kind:"support"});
 const customer={cid,name:"Ops check customer",phone:`018${stamp.slice(-8)}`,packageId,nextPaymentDate:null,accountStatus:"inactive",district:"Dhaka",upazila:"Mirpur",popId,customerType:"home",registrationStatus:"pending_payment",registrationDate:"2026-08-02",agreedMrc:683,agreedOtc:1000,paymentStatus:"unknown"};
 const created=await api("/api/customers","POST",customer);assert.equal(created.success,true,created.message);customerCids.push(cid);
 assert.equal(Number((await api(`/api/customers?cid=${cid}`)).data.customer.packageMonthlyTotal),683);
 const detail=await api(`/api/operations?detail=1&entity=customers&key=${cid}`);assert.equal(detail.data.record.nextPaymentDate,null);assert.equal(detail.data.record.registrationStatus,"pending_payment");
 const complaint={cid,category:"other",subject:"Ops complaint",description:"Test",priority:"medium",status:"open",source:"phone",assignedTeamId:teamId,assignedMemberId:employeeId,createdById:employeeId,expectedResolutionAt:"2026-12-01T12:00"};
 for(const issueTypeId of [issue1,issue2]){const result=await api("/api/tickets","POST",{...complaint,issueTypeId});assert.equal(result.success,true,result.message);assert.equal(result.data.action,"created");ticketNos.push(result.data.ticketNo);}
 const duplicate=await api("/api/tickets","POST",{...complaint,issueTypeId:issue1});assert.equal(duplicate.data.action,"note_added");assert.equal(duplicate.data.ticketNo,ticketNos[0]);
 const history=await api(`/api/operations?detail=1&entity=tickets&key=${ticketNos[0]}`);assert.equal(history.data.record.assignedMemberId,employeeId);assert.ok(history.data.events.some(e=>e.action==="complaint_note"));
 const historical=await api("/api/tickets","POST",{...complaint,issueTypeId:issue1,status:"resolved"});assert.equal(historical.data.action,"created");ticketNos.push(historical.data.ticketNo);assert.equal((await api("/api/tickets","PATCH",{ticketNo:historical.data.ticketNo,status:"open"})).http,409);
 await add("followups",{cid,note:"Called; customer promised payment",outcome:"promised_payment",employeeId,nextFollowUpAt:"2026-12-01T10:00",promisedPaymentDate:"2026-12-01"});
 const invoiceId=await add("invoices",{cid,period:"2026-12",dueDate:"2026-12-01",otc:1000,discount:83});
 let invoice=(await api("/api/operations?entity=invoices")).data.find(row=>row.id===invoiceId);assert.equal(Number(invoice.amount),1600);
 await add("payments",{invoiceId,amount:400,method:"cash",employeeId});
 invoice=(await api("/api/operations?entity=invoices")).data.find(row=>row.id===invoiceId);assert.equal(invoice.paymentStatus,"partial");assert.equal(Number(invoice.balance),1200);
 assert.equal((await api("/api/operations?entity=payments","POST",{invoiceId,amount:1201})).http,409);
 await add("payments",{invoiceId,amount:1200,method:"bank",reference:`TEST-${stamp}`});
 invoice=(await api("/api/operations?entity=invoices")).data.find(row=>row.id===invoiceId);assert.equal(invoice.paymentStatus,"paid");assert.equal(Number(invoice.balance),0);
 assert.equal((await api("/api/operations?entity=invoices","DELETE",{id:invoiceId})).http,409);assert.equal((await api("/api/customers","DELETE",{cid})).http,409);
 const ticketNo=`LEG-${stamp}`;
 const ticketCsv=csv(['Ticket NO','Ticket Source','Subject','Last Note','Assigned(Team)','Priority','Status','Customer ID','Name','Mobile No.','Customer Name','Message','POP Name','Package','Entry Date Time','Create By','Resolved By','Resolved Date','First WP Message','Last WP Message'],[[ticketNo,'Phone',`OPS Upgrade ${stamp}`,'Original note',`OPS Team ${stamp}`,'High','Resolved','not-in-master',`OPS Employee ${stamp}`,'01799999999','Unmatched customer','Historical complaint',`OPS POP ${stamp}`,'Old plan','8/10/2026 9:00',`OPS Employee ${stamp}`,`OPS Employee ${stamp}`,'8/10/2026 10:30','Working','Completed']]);
 const staged=await api("/api/report-imports","POST",{action:"stage",kind:"tickets",csv:ticketCsv,filename:"test-ticket.csv",options:{dateFormat:"MDY",contactRole:"employee"}});assert.equal(staged.success,true,staged.message);batchIds.push(staged.data.id);
 let batch=(await api(`/api/report-imports?id=${staged.data.id}`)).data;assert.equal(batch.rows[0].state,"needs_review");
 const row=batch.rows[0];const edited=await api("/api/report-imports","POST",{action:"edit",batchId:batch.id,rowId:row.id,payload:{...row.payload,allowUnlinked:true}});assert.equal(edited.success,true,edited.message);assert.deepEqual(edited.data.issues,[]);
 const committed=await api("/api/report-imports","POST",{action:"commit",batchId:batch.id});assert.equal(committed.data.imported,1,JSON.stringify(committed));ticketNos.push(ticketNo);
 assert.equal((await api("/api/report-imports","POST",{action:"commit",batchId:batch.id})).data.imported,0);
 const legacy=await api(`/api/operations?detail=1&entity=tickets&key=${ticketNo}`);assert.equal(legacy.data.record.cid,null);assert.equal(legacy.data.record.reporterRole,"employee");assert.ok(legacy.data.events.some(e=>e.actorName===`OPS Employee ${stamp}`));
 assert.equal(Number(legacy.data.record.createdEpoch),Date.parse('2026-08-10T09:00:00+06:00')/1000);assert.equal(Number(legacy.data.record.resolvedEpoch),Date.parse('2026-08-10T10:30:00+06:00')/1000);
 const revalidated=await api('/api/report-imports','POST',{action:'revalidate',batchId:batch.id});assert.equal(revalidated.success,true);assert.equal(revalidated.data.rows[0].state,'imported');
 const payCid=`IMP-${stamp}`,packageName=`Mapped ${stamp}`;
 const customerCsv=csv(['Customer ID','Name','Mobile No.','Address','District','Upazilla','POP','PoP Type','Entry Date','Remarks','Package','MRC','OTC','Payment Status'],[[payCid,'Imported test customer','01999999999','Dhaka','Dhaka','Mirpur',`OPS POP ${stamp}`,'Channel Partner','8/2/2026','First call\nNo answer',packageName,'683','1000','']], 'Example title\nPayment Due report\n');
 const stagedCustomer=await api("/api/report-imports","POST",{action:"stage",kind:"customers",csv:customerCsv,filename:"test-payment.csv",options:{dateFormat:"MDY",packageMap:{[packageName]:packageId}}});assert.equal(stagedCustomer.success,true,stagedCustomer.message);batchIds.push(stagedCustomer.data.id);
 const customerCommit=await api("/api/report-imports","POST",{action:"commit",batchId:stagedCustomer.data.id});assert.equal(customerCommit.data.imported,1,JSON.stringify(customerCommit));customerCids.push(payCid);
 const importedCustomer=await api(`/api/operations?detail=1&entity=customers&key=${payCid}`);assert.equal(importedCustomer.data.record.nextPaymentDate,null);assert.equal(importedCustomer.data.record.paymentStatus,"unknown");assert.equal(importedCustomer.data.followups.length,1);assert.equal(importedCustomer.data.invoices.length,0);
 for(const [kind,file] of [["customers","Payment Due list.csv"],["tickets","Ticket list with Our Own Employee Name & Contact number.csv"]]){
  const text=await fs.readFile(file,'utf8');const preview=await api("/api/report-imports","POST",{action:"preview",kind,csv:text,filename:file,options:{dateFormat:"MDY",contactRole:"employee"}});assert.equal(preview.success,true,preview.message);assert.equal(preview.data.rows.length,353);console.log(`${kind} source report: 353 rows previewed only; no source records imported`);
 }
 console.log("PASS: authenticated master CRUD, agreed pricing, issue-aware duplicate handling, assignment/history, payment balance guards, historical and customer report imports, idempotency and safe source previews.");
}finally{
 for(const ticketNo of ticketNos)await api("/api/tickets","DELETE",{ticketNo});
 for(const resource of resources.filter(r=>r.entity==='payments').reverse())await api(`/api/operations?entity=${resource.entity}`,"DELETE",{id:resource.id});
 for(const resource of resources.filter(r=>r.entity==='invoices'||r.entity==='followups').reverse())await api(`/api/operations?entity=${resource.entity}`,"DELETE",{id:resource.id});
 for(const value of customerCids)await api("/api/customers","DELETE",{cid:value});
 for(const resource of resources.filter(r=>!['payments','invoices','followups'].includes(r.entity)).reverse())await api(`/api/operations?entity=${resource.entity}`,"DELETE",{id:resource.id});
 if(packageId)await api("/api/packages","DELETE",{id:packageId});
 const connection=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
 try{for(const id of batchIds)await connection.execute("DELETE FROM report_import_batches WHERE id=?",[id]);for(const value of [...ticketNos,...customerCids])await connection.execute("DELETE FROM activity_events WHERE entity IN ('customers','tickets') AND record_key=?",[value]);for(const resource of resources)await connection.execute("DELETE FROM activity_events WHERE entity=? AND record_key=?",[resource.entity,String(resource.id)]);}finally{await connection.end();}
}
