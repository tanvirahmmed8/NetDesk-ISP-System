import { PoolConnection, RowDataPacket } from "mysql2/promise";
import { InputError } from "./errors";
export const customerColumnMap:Record<string,string>={district:"district",upazila:"upazila",popId:"pop_id",customerType:"customer_type",registrationStatus:"registration_status",registrationDate:"registration_date",agreedMrc:"agreed_mrc",agreedOtc:"agreed_otc",paymentStatus:"payment_status"};
export const ticketColumnMap:Record<string,string>={source:"source",issueTypeId:"issue_type_id",ticketKind:"ticket_kind",assignedTeamId:"assigned_team_id",assignedMemberId:"assigned_member_id",createdById:"created_by_id",assignedById:"assigned_by_id",forwardedById:"forwarded_by_id",resolvedById:"resolved_by_id",expectedResolutionAt:"expected_resolution_at",reporterName:"reporter_name",reporterPhone:"reporter_phone",reporterRole:"reporter_role"};
export async function saveCustomerMetadata(connection:PoolConnection,id:number,body:Record<string,unknown>){
 const entries=Object.entries(customerColumnMap).filter(([key])=>body[key]!==undefined);
 if(body.popId!=null){const [rows]=await connection.query<RowDataPacket[]>("SELECT id FROM pops WHERE id=?",[body.popId]);if(!rows.length)throw new InputError("POP not found");}
 if(entries.length)await connection.execute(`UPDATE customers SET ${entries.map(([,column])=>`${column}=?`).join(",")} WHERE id=?`,[...entries.map(([key])=>body[key] as string|number|null),id]);
}
export async function prepareTicketMetadata(connection:Pick<PoolConnection,"query">,body:Record<string,unknown>,before?:RowDataPacket,historical=false){
 const values:Record<string,string|number|null>={};
 for(const[key,column]of Object.entries(ticketColumnMap))values[column]=(body[key]===undefined?before?.[column]??null:body[key]) as string|number|null;
 values.source??="manual";values.ticket_kind??="support";values.reporter_role??="reporter";
 let category:string|undefined;
 if(values.issue_type_id){const[types]=await connection.query<RowDataPacket[]>("SELECT category,kind,active FROM issue_types WHERE id=?",[values.issue_type_id]);if(!types.length)throw new InputError("Issue type not found");if(!types[0].active&&values.issue_type_id!==before?.issue_type_id)throw new InputError("Issue type is inactive");category=types[0].category;values.ticket_kind=types[0].kind;}
 if(values.assigned_team_id){const[teams]=await connection.query<RowDataPacket[]>("SELECT id FROM teams WHERE id=?",[values.assigned_team_id]);if(!teams.length)throw new InputError("Team not found");}
 for(const column of ["assigned_member_id","created_by_id","assigned_by_id","forwarded_by_id","resolved_by_id"]){
  if(!values[column])continue;const[employees]=await connection.query<RowDataPacket[]>("SELECT id,team_id,active FROM employees WHERE id=?",[values[column]]);if(!employees.length)throw new InputError("Employee reference not found");
  const changed=!before||values.assigned_member_id!==before.assigned_member_id||values.assigned_team_id!==before.assigned_team_id;
  if(!historical&&changed&&column==="assigned_member_id"){if(!employees[0].active)throw new InputError("Assigned employee is inactive");if(employees[0].team_id&&values.assigned_team_id&&employees[0].team_id!==values.assigned_team_id)throw new InputError("Assigned employee belongs to a different team");}
 }
 return {values,category};
}
