import { RowDataPacket } from "mysql2";
import { transaction } from "./db";
import { entities, Entity, errorMessage, InputError, manage } from "./manage";
import { audit } from "./audit";

export async function setTicketStatus(ticketNo:unknown,status:unknown) {
  if(typeof ticketNo!=="string" || !ticketNo.trim())throw new InputError("ticketNo is required");
  if(!["open","in_progress","resolved","closed"].includes(String(status)))throw new InputError("Invalid status");
  return transaction(async connection=>{
    const [rows]=await connection.query<RowDataPacket[]>("SELECT customer_id FROM tickets WHERE ticket_no=?",[ticketNo]);
    if(!rows.length)throw new InputError("Ticket not found",404);
    if(rows[0].customer_id)await connection.query("SELECT id FROM customers WHERE id=? FOR UPDATE",[rows[0].customer_id]);
    const [tickets]=await connection.query<RowDataPacket[]>("SELECT * FROM tickets WHERE ticket_no=? FOR UPDATE",[ticketNo]);
    if(!tickets.length)throw new InputError("Ticket not found",404);
    if(tickets[0].customer_id&&["open","in_progress"].includes(String(status))) {
      const [duplicates]=await connection.query<RowDataPacket[]>("SELECT id FROM tickets WHERE customer_id=? AND category=? AND issue_type_id <=> ? AND status IN ('open','in_progress') AND id<>? LIMIT 1 FOR UPDATE",[tickets[0].customer_id,tickets[0].category,tickets[0].issue_type_id,tickets[0].id]);
      if(duplicates.length)throw new InputError("An unresolved ticket already exists in this category",409);
    }
    await connection.execute("UPDATE tickets SET status=?,resolved_at=CASE WHEN ?='resolved' THEN COALESCE(resolved_at,CURRENT_TIMESTAMP) WHEN ?='closed' THEN resolved_at ELSE NULL END WHERE ticket_no=?",[String(status),String(status),String(status),ticketNo]);
    await audit(connection,"tickets",ticketNo,"status_changed",{status:tickets[0].status},{status});
    return {ticketNo,status};
  });
}

export async function importRows(entity:unknown,rows:unknown) {
  if(!entities.includes(entity as Entity) || !Array.isArray(rows) || !rows.length || rows.length>500)throw new InputError("Provide an entity and 1–500 rows");
  const results=[];
  for(let i=0;i<rows.length;i++) {
    try {
      if(!rows[i] || typeof rows[i]!=="object" || Array.isArray(rows[i]))throw new InputError("Row must be an object");
      results.push({row:i+2,success:true,...await manage(entity as Entity,"create",rows[i])});
    }catch(error){results.push({row:i+2,success:false,message:errorMessage(error)});}
  }
  return {imported:results.filter(r=>r.success).length,failed:results.filter(r=>!r.success).length,results};
}
