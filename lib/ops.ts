import { z } from "zod";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import { InputError } from "./errors";
import { resolveCustomer } from "./customer-lookup";
import { amount, bool, date, datetime, optionalId, optionalText } from "./ops-schema";
import { monthlyPriceSql } from "./package-details";
import { audit } from "./audit";
import { customerOpsColumns, ticketOpsColumns } from "./ops-schema";
const name=z.string().trim().min(1).max(150),notes=optionalText(10000);
const schemas={
 pops:z.object({name,type:z.enum(["own","channel_partner","distributor"]).default("own"),district:optionalText(100),upazila:optionalText(100)}),
 teams:z.object({name,popId:optionalId,description:notes}),
 employees:z.object({name,phone:z.string().trim().min(1).max(40),email:z.string().email().nullable().optional(),role:z.enum(["support","technician","billing","sales","admin"]).default("support"),teamId:optionalId,active:bool.default(true)}),
 "issue-types":z.object({name,category:z.enum(["no_internet","slow_speed","billing","line_issue","other"]).default("other"),kind:z.enum(["support","service_request","enquiry"]).default("support"),active:bool.default(true)}),
 followups:z.object({cid:z.string().trim().min(1).max(80),note:z.string().trim().min(1).max(10000),outcome:z.enum(["note","no_answer","callback","promised_payment","interested","not_interested","sms_sent","cancelled"]).default("note"),employeeId:optionalId,occurredAt:datetime.nullable().optional(),nextFollowUpAt:datetime.nullable().optional(),promisedPaymentDate:date.nullable().optional()}),
 invoices:z.object({cid:z.string().trim().min(1).max(80),period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable().optional(),dueDate:date.nullable().optional(),mrc:amount.nullable().optional(),otc:amount.default(0),discount:amount.default(0),notes}),
 payments:z.object({invoiceId:optionalId.refine(Boolean,"Invoice required"),amount:amount.refine(v=>v>0,"Payment must exceed zero"),method:z.enum(["cash","bank","bkash","nagad","other"]).default("cash"),reference:optionalText(),paidAt:datetime.nullable().optional(),employeeId:optionalId,notes})
};
export const operationEntities=Object.keys(schemas);
const tables:Record<string,string>={pops:"pops",teams:"teams",employees:"employees","issue-types":"issue_types",followups:"customer_followups",invoices:"invoices",payments:"payments"};
const paid="(SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id=i.id)";
const reads:Record<string,string>={
 pops:"SELECT * FROM pops",
 teams:"SELECT t.id,t.name,t.pop_id AS popId,t.description,p.name AS popName FROM teams t LEFT JOIN pops p ON p.id=t.pop_id",
 employees:"SELECT e.id,e.name,e.phone,e.email,e.role,e.team_id AS teamId,e.active,t.name AS teamName FROM employees e LEFT JOIN teams t ON t.id=e.team_id",
 "issue-types":"SELECT id,name,category,kind,active FROM issue_types",
 followups:"SELECT f.id,c.cid,c.name AS customerName,f.note,f.outcome,f.employee_id AS employeeId,e.name AS employeeName,f.occurred_at AS occurredAt,f.next_follow_up_at AS nextFollowUpAt,f.promised_payment_date AS promisedPaymentDate FROM customer_followups f JOIN customers c ON c.id=f.customer_id LEFT JOIN employees e ON e.id=f.employee_id",
 invoices:`SELECT i.id,i.invoice_no AS invoiceNo,c.cid,c.name AS customerName,i.period,i.due_date AS dueDate,i.mrc,i.otc,i.discount,i.amount,i.notes,${paid} AS paid,ROUND(i.amount-${paid},2) AS balance,CASE WHEN ${paid}>=i.amount THEN 'paid' WHEN ${paid}>0 THEN 'partial' ELSE 'unpaid' END AS paymentStatus FROM invoices i JOIN customers c ON c.id=i.customer_id`,
 payments:"SELECT pay.id,pay.invoice_id AS invoiceId,i.invoice_no AS invoiceNo,c.cid,pay.amount,pay.method,pay.reference,pay.paid_at AS paidAt,pay.employee_id AS employeeId,e.name AS employeeName,pay.notes FROM payments pay JOIN invoices i ON i.id=pay.invoice_id JOIN customers c ON c.id=i.customer_id LEFT JOIN employees e ON e.id=pay.employee_id"
};
export async function listOperations(entity:string,cid?:string){
 if(!reads[entity])throw new InputError("Unknown operation entity");
 const values:unknown[]=[];let where="";
 if(cid&&["followups","invoices","payments"].includes(entity)){const customer=await resolveCustomer(db,cid);where=" WHERE c.id=?";values.push(customer.id);}
 const order=entity==="teams"?"t.id":entity==="employees"?"e.id":entity==="invoices"?"i.id":entity==="payments"?"pay.id":entity==="followups"?"f.id":"id";
 const [rows]=await db.query<RowDataPacket[]>(reads[entity]+where+` ORDER BY ${order} DESC LIMIT 1000`,values);return rows;
}
export async function operationalDetails(entity:string,key:string){
 if(!["customers","tickets"].includes(entity))throw new InputError("Choose customers or tickets");
 const [rows]=await db.query<RowDataPacket[]>(entity==="customers"?`SELECT c.id,c.cid,c.name,c.phone,c.email,c.address,c.package_id AS packageId,c.next_payment_date AS nextPaymentDate,c.account_status AS accountStatus,${customerOpsColumns} FROM customers c WHERE c.cid=?`:`SELECT t.ticket_no AS ticketNo,c.cid,c.phone,t.category,t.subject,t.description,t.status,t.priority,UNIX_TIMESTAMP(t.created_at) AS createdEpoch,UNIX_TIMESTAMP(t.resolved_at) AS resolvedEpoch,t.source_customer_type AS sourceCustomerType,t.source_customer_name AS sourceCustomerName,${ticketOpsColumns} FROM tickets t LEFT JOIN customers c ON c.id=t.customer_id WHERE t.ticket_no=?`,[key]);
 if(!rows.length)throw new InputError("Record not found",404);
 const [events]=await db.query<RowDataPacket[]>("SELECT id,action,actor_id AS actorId,actor_name AS actorName,note,before_data AS beforeData,after_data AS afterData,occurred_at AS occurredAt FROM activity_events WHERE entity=? AND record_key=? ORDER BY id DESC LIMIT 200",[entity,key]);
 return {record:rows[0],events,...(entity==="customers"?{followups:await listOperations("followups",key),invoices:await listOperations("invoices",key),payments:await listOperations("payments",key)}:{})};
}
export async function writeOperation(entity:string,action:"create"|"update"|"delete",input:Record<string,unknown>){
 if(!operationEntities.includes(entity))throw new InputError("Unknown operation entity");
 const id=action==="create"?null:Number(input?.id);if(action!=="create"&&(!Number.isInteger(id)||Number(id)<=0))throw new InputError("Valid ID required");
 const clean=Object.fromEntries(Object.entries(input||{}).map(([k,v])=>[k,v===""?undefined:v]));
 const parsed=action==="delete"?null:schemas[entity as keyof typeof schemas].safeParse(clean);
 if(parsed&&!parsed.success)throw new InputError(parsed.error.issues.map(i=>`${i.path.join(".")}: ${i.message}`).join("; "));
 const body=(parsed?.success?parsed.data:{}) as Record<string,unknown>;
 return transaction(async connection=>{
  let before:RowDataPacket|undefined;
  if(id){const [rows]=await connection.query<RowDataPacket[]>(`SELECT * FROM ${tables[entity]} WHERE id=? FOR UPDATE`,[id]);if(!rows.length)throw new InputError("Record not found",404);before=rows[0];}
  const reference=async(table:string,value:unknown)=>{if(value==null)return;const [rows]=await connection.query<RowDataPacket[]>(`SELECT id FROM ${table} WHERE id=?`,[value]);if(!rows.length)throw new InputError(`${table} reference not found`);};
  if(action==="delete"){
   if(entity==="invoices"){const [rows]=await connection.query<RowDataPacket[]>("SELECT id FROM payments WHERE invoice_id=? LIMIT 1",[id]);if(rows.length)throw new InputError("Invoice has payments; remove them first",409);}
   if(entity==="issue-types"){const [rows]=await connection.query<RowDataPacket[]>("SELECT id FROM tickets WHERE issue_type_id=? LIMIT 1",[id]);if(rows.length)throw new InputError("Issue type is used; deactivate it instead",409);}
   await connection.execute(`DELETE FROM ${tables[entity]} WHERE id=?`,[id]);await audit(connection,entity,id!,"deleted",before,null);return {id};
  }
  let data:Record<string,unknown>={};
  if(entity==="pops")data={name:body.name,type:body.type,district:body.district,upazila:body.upazila};
  if(entity==="teams"){await reference("pops",body.popId);data={name:body.name,pop_id:body.popId,description:body.description};}
  if(entity==="employees"){await reference("teams",body.teamId);data={name:body.name,phone:body.phone,email:body.email,role:body.role,team_id:body.teamId,active:body.active};}
  if(entity==="issue-types")data={name:body.name,category:body.category,kind:body.kind,active:body.active};
  if(entity==="followups"){const customer=await resolveCustomer(connection,String(body.cid),true);await reference("employees",body.employeeId);data={customer_id:customer.id,note:body.note,outcome:body.outcome,employee_id:body.employeeId,occurred_at:body.occurredAt,next_follow_up_at:body.nextFollowUpAt,promised_payment_date:body.promisedPaymentDate};}
  if(entity==="invoices"){
   const customer=await resolveCustomer(connection,String(body.cid),true);
   const [prices]=await connection.query<RowDataPacket[]>(`SELECT COALESCE(c.agreed_mrc,${monthlyPriceSql()}) AS mrc FROM customers c JOIN packages p ON p.id=c.package_id WHERE c.id=?`,[customer.id]);
   const mrc=Number(body.mrc??prices[0].mrc),otc=Number(body.otc),discount=Number(body.discount),total=Math.round((mrc+otc-discount)*100)/100;
   if(total<0||total>99999999.99)throw new InputError("Discount exceeds charges or total is too large");
   if(id){const [p]=await connection.query<RowDataPacket[]>("SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE invoice_id=?",[id]);if(Number(p[0].paid)>total)throw new InputError("Invoice total is below payments",409);if(Number(p[0].paid)>0&&before?.customer_id!==customer.id)throw new InputError("Cannot reassign an invoice with payments",409);}
   data={invoice_no:before?.invoice_no??`INV-${randomUUID()}`,customer_id:customer.id,period:body.period,due_date:body.dueDate,mrc,otc,discount,amount:total,notes:body.notes};
  }
  if(entity==="payments"){
   if(before&&Number(before.invoice_id)!==Number(body.invoiceId))throw new InputError("Payment invoice cannot be changed",409);
   const [invoices]=await connection.query<RowDataPacket[]>("SELECT id,amount FROM invoices WHERE id=? FOR UPDATE",[body.invoiceId]);if(!invoices.length)throw new InputError("Invoice not found",404);
   const [sum]=await connection.query<RowDataPacket[]>("SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE invoice_id=? AND id<>?",[body.invoiceId,id??0]);
   if(Math.round((Number(sum[0].paid)+Number(body.amount))*100)>Math.round(Number(invoices[0].amount)*100))throw new InputError("Payment exceeds remaining balance",409);
   await reference("employees",body.employeeId);
   const now=new Date(Date.now()+6*3600000).toISOString().slice(0,19).replace("T"," ");
   data={invoice_id:body.invoiceId,amount:body.amount,method:body.method,reference:body.reference,paid_at:body.paidAt??before?.paid_at??now,employee_id:body.employeeId,notes:body.notes};
  }
  const columns=Object.keys(data),values=Object.values(data).map(v=>v==null?null:typeof v==="boolean"?Number(v):v as string|number);
  const sql=id?`UPDATE ${tables[entity]} SET ${columns.map(k=>`${k}=?`).join(",")} WHERE id=?`:`INSERT INTO ${tables[entity]} (${columns.join(",")}) VALUES (${columns.map(()=>"?").join(",")})`;
  const [saved]=await connection.execute<ResultSetHeader>(sql,id?[...values,id]:values);const recordId=id??saved.insertId;
  await audit(connection,entity,recordId,action,before,body,body.employeeId?Number(body.employeeId):null);return {id:recordId};
 });
}
