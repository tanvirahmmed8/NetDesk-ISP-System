import { z } from "zod";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { PoolConnection } from "mysql2/promise";
import { db, transaction } from "./db";
import { InputError } from "./errors";
import { parseReport, reportDate, ReportKind, ticketSource } from "./report-format";
import { amount, bool, customerExtraFields, date, datetime } from "./ops-schema";
import { audit } from "./audit";
import { resolveCustomer } from "./customer-lookup";
import { ticketExtraFields } from "./ops-schema";
import { prepareTicketMetadata, saveCustomerMetadata } from "./ops-metadata";
type Payload=Record<string,unknown>;
type StoredRow=RowDataPacket&{id:number;rowNumber:number;original:Payload;payload:Payload;issues:string[];state:string;result:unknown};
type Options={dateFormat:"MDY"|"DMY";contactRole:"reporter"|"employee"|"customer";createReferences:boolean;packageMap:Record<string,number>};
const optionsSchema=z.object({dateFormat:z.enum(["MDY","DMY"]).default("MDY"),contactRole:z.enum(["reporter","employee","customer"]).default("reporter"),createReferences:z.boolean().default(false),packageMap:z.record(z.string(),z.coerce.number().int().positive()).default({})});
const text=(n:number)=>z.string().trim().min(1).max(n);
const customerRow=z.object({cid:text(30),name:text(120),phone:text(30),address:z.string().max(2000).optional(),packageId:z.coerce.number().int().positive(),nextPaymentDate:date.nullable().optional(),accountStatus:z.enum(["active","suspended","inactive"]).default("inactive"),...customerExtraFields});
const ticketRow=z.object({ticketNo:text(80),cid:z.string().max(100).optional(),subject:text(180),description:text(10000),priority:z.enum(["low","medium","high","urgent"]),status:z.enum(["open","in_progress","resolved","closed"]),createdAt:datetime,resolvedAt:datetime.nullable(),reporterName:text(150),reporterPhone:z.string().max(80),allowUnlinked:bool.optional(),issueTypeId:z.coerce.number().int().positive(),source:text(60)});
const decode=(value:unknown)=>typeof value==="string"?JSON.parse(value):value;
async function lookup(table:"packages"|"teams"|"pops"|"employees"|"issue_types",name:unknown){if(!name)return null;const[rows]=await db.query<RowDataPacket[]>(`SELECT * FROM ${table} WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) LIMIT 2`,[name]);return rows.length===1?rows[0]:null;}

export async function reviewPayload(kind:ReportKind,payload:Payload,options:Options){
 const result={...payload};const issues:string[]=[];
 for(const key of ["popId","assignedTeamId","assignedMemberId","createdById","assignedById","forwardedById","resolvedById","issueTypeId"])if(result[key]==="")delete result[key];
 for(const key of ["registrationDate","nextPaymentDate","agreedMrc","agreedOtc","expectedResolutionAt","resolvedAt"])if(result[key]==="")result[key]=null;
 if(kind==="customers"){
  const mapped=options.packageMap[String(result.packageName)];if(mapped)result.packageId=mapped;
  if(!result.packageId){const pkg=await lookup("packages",result.packageName);result.packageId=pkg?.id;}
  if(!result.popId&&result.popName){const pop=await lookup("pops",result.popName);if(pop)result.popId=pop.id;else if(!options.createReferences)issues.push("POP is missing; map it or allow reference creation");}
  const parsed=customerRow.safeParse(result);if(!parsed.success)issues.push(...parsed.error.issues.map(i=>`${i.path.join(".")}: ${i.message}`));
  else Object.assign(result,parsed.data);
  if(result.cid){const[existing]=await db.query<RowDataPacket[]>("SELECT id FROM customers WHERE cid=? LIMIT 1",[result.cid]);if(existing.length)issues.push("Customer CID already exists; skip or choose a different CID. No automatic overwrite.");}
  if(result.packageId){const[packages]=await db.query<RowDataPacket[]>("SELECT id FROM packages WHERE id=?",[result.packageId]);if(!packages.length)issues.push("Package not found");}
 }else{
  if(!result.issueTypeId){const issue=await lookup("issue_types",result.subject);if(issue)result.issueTypeId=issue.id;}
  if(!result.assignedTeamId&&result.teamName){const team=await lookup("teams",result.teamName);if(team)result.assignedTeamId=team.id;else if(!options.createReferences)issues.push("Assigned team is missing; map it or allow reference creation");}
  for(const[field,source]of Object.entries({createdById:"createdByName",assignedById:"assignedByName",forwardedById:"forwardedByName",resolvedById:"resolvedByName",assignedMemberId:"assignedMemberName"})){if(!result[field]&&result[source]){const employee=await lookup("employees",result[source]);if(employee)result[field]=employee.id;else if(field==="assignedMemberId")issues.push("Assigned member needs an employee mapping");}}
  const parsed=ticketRow.safeParse(result);if(!parsed.success)issues.push(...parsed.error.issues.map(i=>`${i.path.join(".")}: ${i.message}`));else Object.assign(result,parsed.data);
  if(result.status==="resolved"&&!result.resolvedAt)issues.push("Resolved date required for historical resolved tickets");
  if(result.resolvedAt&&result.createdAt&&String(result.resolvedAt)<String(result.createdAt))issues.push("Resolution is earlier than creation");
  let linked=false;if(result.cid){const[customers]=await db.query<RowDataPacket[]>("SELECT id FROM customers WHERE cid=? LIMIT 1",[result.cid]);linked=customers.length>0;}
  if(!linked&&result.reporterRole==="customer"&&result.reporterPhone){try{const customer=await resolveCustomer(db,{phone:String(result.reporterPhone)});result.cid=customer.cid;linked=true;}catch(error){if(!result.allowUnlinked)issues.push(error instanceof Error?error.message:"Customer phone lookup failed");}}
  if(!linked&&!result.allowUnlinked)issues.push("Customer CID missing or unmatched. Map it, or explicitly allow an unlinked ticket.");
  const extra=z.object(ticketExtraFields).safeParse(result);if(!extra.success)issues.push(...extra.error.issues.map(i=>`${i.path.join(".")}: ${i.message}`));else{Object.assign(result,extra.data);try{await prepareTicketMetadata(db,result,undefined,true);}catch(error){issues.push(error instanceof Error?error.message:"Invalid ticket references");}}
  const[existing]=await db.query<RowDataPacket[]>("SELECT id FROM tickets WHERE ticket_no=? LIMIT 1",[String(result.ticketNo||"")]);if(existing.length)issues.push("Ticket number already exists; skip this historical row");
 }
 return {payload:result,issues};
}
function normalize(kind:ReportKind,raw:Record<string,string>,options:Options){
 const payload:Payload={...raw};
 const optionalAmount=(value:string)=>value.trim()?Number(value.replace(/,/g,"")):null;
 if(kind==="customers"){
  payload.registrationDate=reportDate(raw.registrationDate,options.dateFormat);
  payload.nextPaymentDate=null;payload.customerType="unknown";payload.registrationStatus="pending_payment";payload.accountStatus="inactive";
  payload.agreedMrc=optionalAmount(raw.agreedMrc);payload.agreedOtc=optionalAmount(raw.agreedOtc);
  payload.paymentStatus=raw.paymentStatus?raw.paymentStatus.trim().toLowerCase():"unknown";
 }else{
  payload.source=ticketSource(raw.source);payload.priority=raw.priority.trim().toLowerCase();payload.status=raw.status.trim().toLowerCase().replace(/\s+/g,"_");
  payload.createdAt=reportDate(raw.createdAt,options.dateFormat,true);payload.resolvedAt=reportDate(raw.resolvedAt,options.dateFormat,true);
  payload.sourceCustomerId=raw.cid;payload.allowUnlinked=false;payload.reporterRole=options.contactRole;payload.customerType=String(raw.customerType||"").trim().toLowerCase();
 }
 return payload;
}
export async function previewReport(input:Payload){
 const kind=input.kind;if(kind!=="customers"&&kind!=="tickets")throw new InputError("Report kind must be customers or tickets");
 const parsedOptions=optionsSchema.safeParse(input.options||{});if(!parsedOptions.success)throw new InputError("Invalid report options");const options=parsedOptions.data;
 const parsed=parseReport(String(input.csv||""),kind,input.mapping as Record<string,string>|undefined);
 const key=kind==="customers"?"cid":"ticketNo",seen=new Map<string,number>();for(const row of parsed.rows){const id=String(row.payload[key]||"").toLowerCase();seen.set(id,(seen.get(id)||0)+1);}
 const rows=[];
 for(const row of parsed.rows){
  let checked:{payload:Payload;issues:string[]};try{checked=await reviewPayload(kind,normalize(kind,row.payload,options),options);}catch(error){checked={payload:{...row.payload},issues:[error instanceof Error?error.message:"Invalid row"]};}
  if((seen.get(String(row.payload[key]||"").toLowerCase())||0)>1)checked.issues.push("Duplicate identifier within report; skip one row and revalidate the other");
  rows.push({...row,...checked});
 }
 return {kind,options,headers:parsed.headers,mapping:parsed.mapping,rows};
}
export async function stageReport(input:Payload){
 const preview=await previewReport(input);
 return transaction(async connection=>{
  const[saved]=await connection.execute<ResultSetHeader>("INSERT INTO report_import_batches(kind,filename,options) VALUES(?,?,?)",[preview.kind,String(input.filename||"report.csv").slice(0,200),JSON.stringify(preview.options)]);
  for(const row of preview.rows)await connection.execute("INSERT INTO report_import_rows(batch_id,source_row,original_data,payload,issues,state) VALUES(?,?,?,?,?,?)",[saved.insertId,row.rowNumber,JSON.stringify(row.original),JSON.stringify(row.payload),JSON.stringify(row.issues),row.issues.length?"needs_review":"ready"]);
  return {id:saved.insertId,total:preview.rows.length};
 });
}
export async function listReportBatches(){const[rows]=await db.query<RowDataPacket[]>("SELECT b.id,b.kind,b.filename,b.created_at AS createdAt,COUNT(r.id) AS total,SUM(r.state='ready') AS ready,SUM(r.state='needs_review') AS needsReview,SUM(r.state='imported') AS imported,SUM(r.state='skipped') AS skipped FROM report_import_batches b LEFT JOIN report_import_rows r ON r.batch_id=b.id GROUP BY b.id,b.kind,b.filename,b.created_at ORDER BY b.id DESC LIMIT 100");return rows;}
export async function readReportBatch(id:number){
 if(!Number.isInteger(id)||id<=0)throw new InputError("Valid batch ID required");
 const[batches]=await db.query<RowDataPacket[]>("SELECT * FROM report_import_batches WHERE id=?",[id]);if(!batches.length)throw new InputError("Batch not found",404);
 const[rows]=await db.query<StoredRow[]>("SELECT id,source_row AS rowNumber,original_data AS original,payload,issues,state,result FROM report_import_rows WHERE batch_id=? ORDER BY id",[id]);
 return {id:Number(batches[0].id),filename:String(batches[0].filename),kind:batches[0].kind as ReportKind,options:decode(batches[0].options) as Options,rows:rows.map(row=>({...row,original:decode(row.original),payload:decode(row.payload),issues:decode(row.issues),result:decode(row.result)}))};
}
export async function editReportRow(batchId:number,rowId:number,payload:Payload,skip=false){
 const batch=await readReportBatch(batchId);const row=batch.rows.find(r=>r.id===rowId);if(!row)throw new InputError("Row not found",404);if(row.state==="imported")throw new InputError("Imported rows cannot be changed",409);
 const checked:{payload:Payload;issues:string[]}=skip?{payload:row.payload,issues:[]}:await reviewPayload(batch.kind,payload,batch.options);
 const key=batch.kind==="customers"?"cid":"ticketNo";
 if(!skip&&batch.rows.some(other=>other.id!==rowId&&!["skipped","imported"].includes(other.state)&&String(other.payload[key]||"").toLowerCase()===String(checked.payload[key]||"").toLowerCase()))checked.issues.push("Duplicate identifier in this batch");
 const [updated]=await db.execute<ResultSetHeader>("UPDATE report_import_rows SET payload=?,issues=?,state=? WHERE id=? AND state<>'imported'",[JSON.stringify(checked.payload),JSON.stringify(checked.issues),skip?"skipped":checked.issues.length?"needs_review":"ready",rowId]);if(!updated.affectedRows)throw new InputError("Row was imported; refresh the queue",409);
 return checked;
}
export async function revalidateReport(batchId:number,changes:Payload={}){
 const batch=await readReportBatch(batchId);const parsed=optionsSchema.safeParse({...batch.options,...changes});if(!parsed.success)throw new InputError("Invalid batch options");
 await db.execute("UPDATE report_import_batches SET options=? WHERE id=?",[JSON.stringify(parsed.data),batchId]);
 const active=batch.rows.filter(row=>!["imported","skipped"].includes(row.state)),key=batch.kind==="customers"?"cid":"ticketNo";
 for(const row of active){const checked=await reviewPayload(batch.kind,row.payload,parsed.data);if(active.some(other=>other.id!==row.id&&String(other.payload[key]||"").toLowerCase()===String(row.payload[key]||"").toLowerCase()))checked.issues.push("Duplicate identifier in this batch");await db.execute("UPDATE report_import_rows SET payload=?,issues=?,state=? WHERE id=? AND state NOT IN ('imported','skipped')",[JSON.stringify(checked.payload),JSON.stringify(checked.issues),checked.issues.length?"needs_review":"ready",row.id]);}
 return readReportBatch(batchId);
}

async function ensureReference(connection:PoolConnection,table:"pops"|"teams",name:unknown,allow:boolean,payload:Payload){
 if(!name)return null;const[existing]=await connection.query<RowDataPacket[]>(`SELECT id FROM ${table} WHERE name=?`,[name]);if(existing.length)return existing[0].id;
 if(!allow)throw new InputError(`${table} mapping required`);
 if(String(name).length>150)throw new InputError("Reference name exceeds 150 characters");
 if(table==="teams"){const[result]=await connection.execute<ResultSetHeader>("INSERT INTO teams(name) VALUES(?)",[String(name)]);return result.insertId;}
 const type=String(payload.popType||"").toLowerCase().includes("channel")?"channel_partner":String(payload.popType||"").toLowerCase().includes("distributor")?"distributor":"own";
 const[result]=await connection.execute<ResultSetHeader>("INSERT INTO pops(name,type,district,upazila) VALUES(?,?,?,?)",[String(name),type,payload.district?String(payload.district):null,payload.upazila?String(payload.upazila):null]);return result.insertId;
}
export async function commitReport(batchId:number,rowIds?:number[]){
 if(rowIds!==undefined&&(!Array.isArray(rowIds)||rowIds.length>500||rowIds.some(id=>!Number.isInteger(id)||id<=0)))throw new InputError("Invalid row IDs");
 const batch=await readReportBatch(batchId);
 const candidates=batch.rows.filter(row=>row.state==="ready"&&(!rowIds||rowIds.includes(row.id)));
 const results=[];
 for(const row of candidates){
  try{
   const checked=await reviewPayload(batch.kind,row.payload,batch.options);if(checked.issues.length)throw new InputError(checked.issues.join("; "));
   const result=await transaction(async connection=>{
    const[locked]=await connection.query<RowDataPacket[]>("SELECT state,payload FROM report_import_rows WHERE id=? FOR UPDATE",[row.id]);
    if(locked[0]?.state!=="ready")return {skipped:true};
    if(JSON.stringify(decode(locked[0].payload))!==JSON.stringify(row.payload))throw new InputError("Row changed; refresh before importing",409);
    const p=checked.payload;let record:Payload;
    if(batch.kind==="customers"){
     const parsed=customerRow.parse(p);
     const[created]=await connection.execute<ResultSetHeader>("INSERT INTO customers(cid,name,phone,address,package_id,next_payment_date,account_status) VALUES(?,?,?,?,?,?,?)",[parsed.cid,parsed.name,parsed.phone,parsed.address||null,parsed.packageId,parsed.nextPaymentDate??null,parsed.accountStatus]);
     if(!p.popId&&p.popName)p.popId=await ensureReference(connection,"pops",p.popName,batch.options.createReferences,p);
     await saveCustomerMetadata(connection,created.insertId,p);
     if(p.remarks)await connection.execute("INSERT INTO customer_followups(customer_id,note,outcome) VALUES(?,?,'note')",[created.insertId,String(p.remarks)]);
     record={cid:parsed.cid,id:created.insertId};await audit(connection,"customers",parsed.cid,"report_import",null,p,null,null,"Original remarks preserved; no payment or due date inferred.");
    }else{
     const parsed=ticketRow.parse(p);const[customers]=await connection.query<RowDataPacket[]>("SELECT id FROM customers WHERE cid=? FOR UPDATE",[p.cid||""]);const customerId=customers[0]?.id??null;
     if(!customerId&&!p.allowUnlinked)throw new InputError("Customer not found");
     if(!p.assignedTeamId&&p.teamName)p.assignedTeamId=await ensureReference(connection,"teams",p.teamName,batch.options.createReferences,p);
     const metadata=await prepareTicketMetadata(connection,p,undefined,true);
     const[zone]=await connection.query<RowDataPacket[]>("SELECT @@session.time_zone AS zone");
     let createdId:number;
     try{
      await connection.query("SET time_zone='+06:00'");
      const[created]=await connection.execute<ResultSetHeader>("INSERT INTO tickets(ticket_no,customer_id,category,subject,description,status,priority,created_at,updated_at,resolved_at,source_customer_id,source_customer_type,source_customer_name,source_package,source_pop,import_reference) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[parsed.ticketNo,customerId,metadata.category||"other",parsed.subject,parsed.description,parsed.status,parsed.priority,parsed.createdAt,parsed.resolvedAt??parsed.createdAt,parsed.resolvedAt,p.sourceCustomerId||null,p.customerType||null,p.customerName||null,p.packageName||null,p.popName||null,`report:${parsed.ticketNo}`]);createdId=created.insertId;
     }finally{await connection.query("SET time_zone=?",[zone[0].zone]);}
     const columns=Object.keys(metadata.values);await connection.execute(`UPDATE tickets SET ${columns.map(column=>`${column}=?`).join(",")} WHERE id=?`,[...Object.values(metadata.values),createdId!]);
     for(const[label,note]of [["Last note",p.lastNote],["First work progress",p.firstWorkMessage],["Last work progress",p.lastWorkMessage]])if(note)await connection.execute("INSERT INTO ticket_notes(ticket_id,note) VALUES(?,?)",[createdId!,`[Imported ${label}; original note time unknown] ${String(note)}`]);
     for(const[action,name]of [["created",p.createdByName],["assigned",p.assignedByName],["forwarded",p.forwardedByName],["resolved",p.resolvedByName]] as const)if(name)await audit(connection,"tickets",parsed.ticketNo,`historical_${action}`,null,null,null,String(name),["assigned","forwarded"].includes(action)?"Source actor retained; original action time not supplied.":null,action==="resolved"?parsed.resolvedAt??undefined:action==="created"?parsed.createdAt:undefined);
     await audit(connection,"tickets",parsed.ticketNo,"report_import",null,p,null,null,"Historical record; duplicate complaint merging bypassed. Raw source retained in batch.");record={ticketNo:parsed.ticketNo,id:createdId!};
    }
    await connection.execute("UPDATE report_import_rows SET state='imported',result=?,issues=JSON_ARRAY() WHERE id=?",[JSON.stringify(record),row.id]);return record;
   });results.push({rowId:row.id,success:true,...result});
  }catch(error){const message=error instanceof InputError?error.message:(error as {code?:string})?.code==="ER_DUP_ENTRY"?"Identifier already exists":"Import failed; check references and field lengths";await db.execute("UPDATE report_import_rows SET state='needs_review',issues=? WHERE id=? AND state<>'imported'",[JSON.stringify([message]),row.id]);results.push({rowId:row.id,success:false,message});}
 }
 return {imported:results.filter(row=>row.success&&!("skipped" in row)).length,failed:results.filter(row=>!row.success).length,results};
}
