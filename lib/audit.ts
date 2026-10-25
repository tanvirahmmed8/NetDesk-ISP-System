import { PoolConnection } from "mysql2/promise";
export async function audit(connection:PoolConnection,entity:string,key:string|number,action:string,before:unknown,after:unknown,actorId:number|null=null,actorName:string|null=null,note:string|null=null,occurredAt?:string) {
 if(actorId&&!actorName){const [rows]=await connection.query<import("mysql2").RowDataPacket[]>("SELECT name FROM employees WHERE id=?",[actorId]);actorName=rows[0]?.name??null;}
 await connection.execute("INSERT INTO activity_events(entity,record_key,action,before_data,after_data,actor_id,actor_name,note,occurred_at) VALUES(?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP))",[entity,String(key),action,before==null?null:JSON.stringify(before),after==null?null:JSON.stringify(after),actorId,actorName,note,occurredAt??null]);
}
