import { RowDataPacket } from "mysql2";
import { db } from "./db";
import { Entity, InputError } from "./manage";
import { CustomerLookup, parseCustomerLookup, phoneVariants, resolveCustomer } from "./customer-lookup";
import { packageColumns, presentPackage, monthlyPriceSql } from "./package-details";

export async function listRecords(entity:Entity, options:{search?:string;limit?:number;offset?:number;status?:string}={}) {
  const limit=options.limit??50,offset=options.offset??0;
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)throw new InputError("Use limit 1–100 and offset >= 0");
  const filters:string[]=[]; const values:unknown[]=[];
  if(options.search) {
    const columns=entity==="customers"?["c.cid","c.name"]:entity==="tickets"?["t.ticket_no","t.subject","c.cid","c.name"]:["p.name"];
    const conditions=columns.map(column=>`${column} LIKE ?`);values.push(...columns.map(()=>`%${options.search}%`));
    if(entity!=="packages"){
      let terms=[options.search];try{terms=phoneVariants(options.search);}catch{if(/^[+\d\s().-]+$/.test(options.search))terms=[options.search.replace(/\D/g,"")];}
      for(const term of terms.filter(Boolean)){conditions.push(`REGEXP_REPLACE(c.phone,'[^0-9]','') LIKE ?`);values.push(`%${term}%`);}
    }
    filters.push(`(${conditions.join(" OR ")})`);
  }
  if(options.status && entity!=="packages") {filters.push(entity==="customers"?"c.account_status=?":"t.status=?");values.push(options.status);}
  const from=entity==="customers"?"customers c JOIN packages p ON p.id=c.package_id":entity==="tickets"?"tickets t LEFT JOIN customers c ON c.id=t.customer_id":"packages p";
  const select=entity==="customers"?`c.cid,c.name,c.phone,c.email,c.address,c.package_id AS packageId,c.next_payment_date AS nextPaymentDate,c.account_status AS accountStatus,p.name AS packageName,p.speed_mbps AS speedMbps,p.price AS packagePrice,${packageColumns()},COALESCE(c.agreed_mrc,${monthlyPriceSql()}) AS packageMonthlyTotal`:entity==="tickets"?"t.id,t.ticket_no AS ticketNo,t.category,t.subject,t.description,t.status,t.priority,t.created_at AS createdAt,t.updated_at AS updatedAt,c.cid,c.phone,COALESCE(c.name,'Unlinked customer') AS customerName":`p.id,p.name,p.speed_mbps AS speedMbps,p.price,${packageColumns()}`;
  const where=filters.length?` WHERE ${filters.join(" AND ")}`:"";
  const [count]=await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM ${from}${where}`,values);
  const [items]=await db.query<RowDataPacket[]>(`SELECT ${select} FROM ${from}${where} ORDER BY ${entity==="tickets"?"t.id":entity==="customers"?"c.id":"p.id"} DESC LIMIT ? OFFSET ?`,[...values,limit,offset]);
  return {items:entity === "packages"?items.map(presentPackage):items,total:Number(count[0].total),limit,offset};
}
export async function getCustomer(input:string|CustomerLookup) {
  const lookup=parseCustomerLookup(input);
  const resolved=await resolveCustomer(db,lookup);
  const cid=resolved.cid;
  const [customers]=await db.query<RowDataPacket[]>(`SELECT c.id,c.cid,c.name,c.phone,c.email,c.address,c.package_id AS packageId,c.next_payment_date AS nextPaymentDate,c.account_status AS accountStatus,p.name AS packageName,p.speed_mbps AS speedMbps,p.price AS packagePrice,${packageColumns()},COALESCE(c.agreed_mrc,${monthlyPriceSql()}) AS packageMonthlyTotal FROM customers c JOIN packages p ON p.id=c.package_id WHERE c.cid=?`,[cid]);
  if(!customers.length)throw new InputError("Customer not found",404);
  const [tickets]=await db.query<RowDataPacket[]>("SELECT t.id,t.ticket_no AS ticketNo,t.category,t.subject,t.description,t.status,t.priority,t.created_at AS createdAt,t.updated_at AS updatedAt,(SELECT COUNT(*) FROM ticket_notes n WHERE n.ticket_id=t.id) AS noteCount FROM tickets t LEFT JOIN customers c ON c.id=t.customer_id WHERE c.cid=? ORDER BY t.id DESC LIMIT 10",[cid]);
  return {customer:customers[0],tickets};
}
export async function getTicket(ticketNo:string) {
  const [tickets]=await db.query<RowDataPacket[]>("SELECT t.id,t.ticket_no AS ticketNo,t.category,t.subject,t.description,t.status,t.priority,t.created_at AS createdAt,t.updated_at AS updatedAt,t.resolved_at AS resolvedAt,c.cid,c.phone,COALESCE(c.name,'Unlinked customer') AS customerName FROM tickets t LEFT JOIN customers c ON c.id=t.customer_id WHERE t.ticket_no=?",[ticketNo]);
  if(!tickets.length)throw new InputError("Ticket not found",404);
  const [notes]=await db.query<RowDataPacket[]>("SELECT n.id,n.note,n.created_at AS createdAt FROM ticket_notes n JOIN tickets t ON t.id=n.ticket_id WHERE t.ticket_no=? ORDER BY n.id",[ticketNo]);
  return {ticket:tickets[0],notes};
}
export async function getPackage(id:number) {
  const [rows]=await db.query<RowDataPacket[]>(`SELECT p.id,p.name,p.speed_mbps AS speedMbps,p.price,${packageColumns()},(SELECT COUNT(*) FROM customers c WHERE c.package_id=p.id) AS customerCount FROM packages p WHERE p.id=?`,[id]);
  if(!rows.length)throw new InputError("Package not found",404);return presentPackage(rows[0]);
}
