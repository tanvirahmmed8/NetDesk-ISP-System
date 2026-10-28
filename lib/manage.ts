import { randomInt } from "node:crypto";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { transaction } from "./db";
import { z } from "zod";
import { InputError } from "./errors";
import { parseCustomerLookup, resolveCustomer } from "./customer-lookup";
import { packageDefaults, presentPackage, packageColumns } from "./package-details";
import { packageExtraFields } from "./package-schema";
import { customerExtraFields, ticketExtraFields, date } from "./ops-schema";
import { saveCustomerMetadata, prepareTicketMetadata } from "./ops-metadata";
import { audit } from "./audit";
export { InputError } from "./errors";

export const entities = ["customers", "packages", "tickets"] as const;
export type Entity = typeof entities[number];
const numeric=z.union([z.number(),z.string().regex(/^\d+(\.\d+)?$/)]).transform(Number);
const idValue=numeric.pipe(z.number().int().positive());
const cidValue=z.string().trim().min(1).max(30);
const ticketValue=z.string().trim().min(1).max(80);
const customerSchema=z.object({cid:cidValue,name:z.string().trim().min(1).max(120),phone:z.string().trim().min(1).max(30),email:z.union([z.string().email(),z.literal(""),z.null()]).optional(),address:z.string().max(2000).nullable().optional(),packageId:idValue,nextPaymentDate:date.nullable().optional(),accountStatus:z.enum(["active","suspended","inactive"]).default("active"),...customerExtraFields});
const packageSchema=z.object({name:z.string().trim().min(1).max(100),speedMbps:idValue,price:numeric.pipe(z.number().min(0).max(99999999.99)),...packageExtraFields});
const ticketSchema=z.object({cid:z.string().trim().max(80).optional(),phone:z.string().trim().max(80).optional(),category:z.enum(["no_internet","slow_speed","billing","line_issue","other"]),subject:z.string().trim().min(1).max(180),description:z.string().trim().min(1).max(10000),priority:z.enum(["low","medium","high","urgent"]).default("medium"),status:z.enum(["open","in_progress","resolved","closed"]).default("open"),...ticketExtraFields}).refine(body=>!!(body.cid||body.phone||(body.allowUnlinked&&body.reporterName)),"Provide CID/phone, or explicitly allow an unlinked ticket with a reporter name");
const text = (v: unknown, name: string, max = 180) => {
  if (typeof v !== "string" || !v.trim() || v.trim().length > max) throw new InputError(`${name} is required (maximum ${max} characters)`);
  return v.trim();
};
const choice = (v: unknown, options: string[], name: string) => {
  if (!options.includes(String(v))) throw new InputError(`Invalid ${name}: ${options.join(", ")}`);
  return String(v);
};
const positive = (v: unknown, name: string) => {
  const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new InputError(`${name} must be a positive integer`); return n;
};

export async function manage(entity: Entity, action: "create" | "update" | "delete", body: Record<string, unknown>) {
  const nullable=new Set(["district","upazila","popId","registrationDate","agreedMrc","agreedOtc","issueTypeId","assignedTeamId","assignedMemberId","createdById","assignedById","forwardedById","resolvedById","expectedResolutionAt","reporterName","reporterPhone","nextPaymentDate"]);
  body=Object.fromEntries(Object.entries(body).map(([key,value])=>[key,value===""&&(key in customerExtraFields||key in ticketExtraFields||key==="nextPaymentDate")?(nullable.has(key)?null:undefined):value]));
  if(entity === "packages")body=Object.fromEntries(Object.entries(body).filter(([key,value])=>!(key in packageExtraFields && value === "")));
  const identifier=entity === "customers"?z.object({cid:cidValue}):entity === "packages"?z.object({id:idValue}):z.object({ticketNo:ticketValue});
  const fields=entity === "customers"?customerSchema:entity === "packages"?packageSchema:ticketSchema;
  const schema=action === "delete"?identifier:action === "update"?fields.and(identifier):fields;
  const parsed=schema.safeParse(body);
  if(!parsed.success){const issue=parsed.error.issues[0];throw new InputError(`${issue.path.join(".") || "body"}: ${issue.message}`);}
  body=parsed.data;
  if(entity === "tickets" && action !== "delete"&&(body.cid||body.phone))parseCustomerLookup({...(body.cid?{cid:String(body.cid)}:{}),...(body.phone?{phone:String(body.phone)}:{})});
  return transaction(async connection => {
    if (entity === "packages") {
      const id = action === "create" ? null : positive(body.id, "Package ID");
      let savedFeatures:Record<string,unknown>={...packageDefaults};
      if (id) {
        const [rows] = await connection.query<RowDataPacket[]>(`SELECT p.id,p.price,${packageColumns()} FROM packages p WHERE p.id=? FOR UPDATE`, [id]);
        if (!rows.length) throw new InputError("Package not found", 404);
        savedFeatures=presentPackage(rows[0]);
      }
      if (action === "delete") {
        const [customers] = await connection.query<RowDataPacket[]>("SELECT id FROM customers WHERE package_id=? LIMIT 1", [id]);
        if (customers.length) throw new InputError("Move customers to another package before deleting this package", 409);
        await connection.execute("DELETE FROM packages WHERE id=?", [id]); return { id };
      }
      const name = text(body.name, "Name", 100), speed = positive(body.speedMbps, "Speed");
      const price = Number(body.price);
      if (body.price === "" || body.price == null || !Number.isFinite(price) || price < 0 || price > 99999999.99) throw new InputError("Invalid package price");
      const features={...savedFeatures,...Object.fromEntries(Object.entries(body).filter(([,value])=>value!==undefined))};
      const values=[name,speed,price,features.unlimited?1:0,Number(features.serviceHours),String(features.connectionType),Number(features.publicIpCount),Number(features.otcCharge),String(features.supportHours),Number(features.vatPercent),features.vatIncluded?1:0];
      const [result] = await connection.execute<ResultSetHeader>(action === "create" ? "INSERT INTO packages (name,speed_mbps,price,unlimited,service_hours,connection_type,public_ip_count,otc_charge,support_hours,vat_percent,vat_included) VALUES (?,?,?,?,?,?,?,?,?,?,?)" : "UPDATE packages SET name=?,speed_mbps=?,price=?,unlimited=?,service_hours=?,connection_type=?,public_ip_count=?,otc_charge=?,support_hours=?,vat_percent=?,vat_included=? WHERE id=?", action === "create" ? values : [...values,id]);
      return { id: id ?? result.insertId };
    }
    if (entity === "customers") {
      const cid = text(body.cid, "CID", 30);
      let before:RowDataPacket|undefined;
      if (action !== "create") {
        const [rows] = await connection.query<RowDataPacket[]>("SELECT * FROM customers WHERE cid=? FOR UPDATE", [cid]);
        if (!rows.length) throw new InputError("Customer not found", 404);
        before=rows[0];
      }
      if (action === "delete") {const[invoices]=await connection.query<RowDataPacket[]>("SELECT id FROM invoices WHERE customer_id=? LIMIT 1",[before!.id]);if(invoices.length)throw new InputError("Customer has invoices; keep billing history and mark inactive instead",409);await connection.execute("DELETE FROM customers WHERE cid=?", [cid]);await audit(connection,"customers",cid,"deleted",before,null);return { cid }; }
      const name = text(body.name,"Name",120), phone = text(body.phone,"Phone",30);
      const email = body.email ? text(body.email,"Email",150) : null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError("Invalid email address");
      const due = body.nextPaymentDate===undefined?before?.next_payment_date??null:body.nextPaymentDate as string|null;
      const packageId = positive(body.packageId,"Package ID");
      const [packages] = await connection.query<RowDataPacket[]>("SELECT id FROM packages WHERE id=? FOR UPDATE",[packageId]);
      if (!packages.length) throw new InputError("Package not found");
      const status = choice(body.accountStatus || "active",["active","suspended","inactive"],"account status");
      const values = [name,phone,email,body.address ? text(body.address,"Address",2000) : null,packageId,due,status,cid];
      const [saved]=await connection.execute<ResultSetHeader>(action === "create" ? "INSERT INTO customers (name,phone,email,address,package_id,next_payment_date,account_status,cid) VALUES (?,?,?,?,?,?,?,?)" : "UPDATE customers SET name=?,phone=?,email=?,address=?,package_id=?,next_payment_date=?,account_status=? WHERE cid=?",values);
      await saveCustomerMetadata(connection,before?.id??saved.insertId,body);
      await audit(connection,"customers",cid,action,before,body);
      return { cid, ...(action === "create"?{id:saved.insertId}:{}) };
    }
    // Keep legacy/imported references unchanged. New references are six-digit
    // random numbers, with the UNIQUE constraint plus retries handling clashes.
    let ticketNo=action==="create"?String(randomInt(100000,1000000)):text(body.ticketNo,"Ticket number",80);
    let before:RowDataPacket|undefined;
    if(action!=="create"){
      const [rows]=await connection.query<RowDataPacket[]>("SELECT * FROM tickets WHERE ticket_no=? FOR UPDATE",[ticketNo]);
      if(!rows.length)throw new InputError("Ticket not found",404);before=rows[0];
    }
    if(action==="delete"){await connection.execute("DELETE FROM tickets WHERE ticket_no=?",[ticketNo]);await audit(connection,"tickets",ticketNo,"deleted",before,null);return {ticketNo};}
    const customer=body.cid||body.phone?await resolveCustomer(connection,{...(body.cid?{cid:String(body.cid)}:{}),...(body.phone?{phone:String(body.phone)}:{})},true):null;
    const metadata=await prepareTicketMetadata(connection,body,before);
    const category=metadata.category??choice(body.category,["no_internet","slow_speed","billing","line_issue","other"],"category");
    const subject=text(body.subject,"Subject"),description=text(body.description,"Description",10000);
    const priority=choice(body.priority||"medium",["low","medium","high","urgent"],"priority");
    const status=choice(body.status||"open",["open","in_progress","resolved","closed"],"status");
    if(customer&&["open","in_progress"].includes(status)){
      const [existing]=await connection.query<RowDataPacket[]>("SELECT id,ticket_no FROM tickets WHERE customer_id=? AND category=? AND issue_type_id <=> ? AND status IN ('open','in_progress') AND id<>? LIMIT 1 FOR UPDATE",[customer.id,category,metadata.values.issue_type_id,before?.id??0]);
      if(existing.length&&action==="create"){
        await connection.execute("INSERT INTO ticket_notes(ticket_id,note) VALUES(?,?)",[existing[0].id,description]);
        await connection.execute("UPDATE tickets SET updated_at=CURRENT_TIMESTAMP WHERE id=?",[existing[0].id]);
        await audit(connection,"tickets",existing[0].ticket_no,"complaint_note",null,{note:description},null,null,description);
        return {ticketNo:existing[0].ticket_no,action:"note_added"};
      }
      if(existing.length)throw new InputError("An unresolved ticket already exists for this issue type",409);
    }
    const values=[customer?.id??null,category,subject,description,priority,status,status,status,ticketNo];
    const resolution="CASE WHEN ?='resolved' THEN COALESCE(resolved_at,CURRENT_TIMESTAMP) WHEN ?='closed' THEN resolved_at ELSE NULL END";
    let saved:ResultSetHeader|undefined;
    for(let attempt=0;attempt<10;attempt++){
      try{
        const [result]=await connection.execute<ResultSetHeader>(action==="create"?"INSERT INTO tickets(customer_id,category,subject,description,priority,status,resolved_at,ticket_no) VALUES(?,?,?,?,?,?,IF(?='resolved',CURRENT_TIMESTAMP,NULL),?)":`UPDATE tickets SET customer_id=?,category=?,subject=?,description=?,priority=?,status=?,resolved_at=${resolution} WHERE ticket_no=?`,action==="create"?[...values.slice(0,7),ticketNo]:values);
        saved=result;break;
      }catch(error){
        if(action==="create"&&(error as {code?:string}).code==="ER_DUP_ENTRY"&&attempt<9){ticketNo=String(randomInt(100000,1000000));continue;}
        throw error;
      }
    }
    if(!saved)throw new InputError('Unable to allocate a ticket number; retry.',409);
    const columns=Object.keys(metadata.values);
    await connection.execute(`UPDATE tickets SET ${columns.map(key=>`${key}=?`).join(",")} WHERE id=?`,[...Object.values(metadata.values),before?.id??saved.insertId]);
    await audit(connection,"tickets",ticketNo,action,before,body,body.resolvedById?Number(body.resolvedById):body.createdById?Number(body.createdById):null);
    return {ticketNo,action:action==="create"?"created":"updated"};

  });
}

export function errorMessage(error: unknown) {
  const code = (error as {code?:string})?.code;
  if (code === "ER_DUP_ENTRY") return "This identifier is already in use";
  if (code === "ER_DATA_TOO_LONG") return "One or more values exceed the allowed length";
  return error instanceof InputError ? error.message : "Unable to save data. Check the database connection.";
}
