import { z } from 'zod';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { transaction } from './db';
import { InputError } from './errors';
import { audit } from './audit';

export async function manageTicketNote(action:'create'|'update'|'delete',input:unknown,actorName:string|null=null){
 const schema=z.object({ticketNo:z.string().trim().min(1).max(80),...(action!=='create'?{id:z.number().int().positive()}:{}),...(action!=='delete'?{note:z.string().trim().min(1).max(10000)}:{})});
 const parsed=schema.safeParse(input);if(!parsed.success)throw new InputError(parsed.error.issues[0]?.message||'Invalid note');
 const args=parsed.data as {ticketNo:string;id?:number;note?:string};
 return transaction(async connection=>{
  const [tickets]=await connection.query<RowDataPacket[]>('SELECT id FROM tickets WHERE ticket_no=? FOR UPDATE',[args.ticketNo]);
  if(!tickets.length)throw new InputError('Ticket not found',404);
  let noteId=args.id,before:unknown=null;
  if(action==='create'){
   const [insert]=await connection.execute<ResultSetHeader>('INSERT INTO ticket_notes(ticket_id,note) VALUES(?,?)',[tickets[0].id,args.note]);noteId=insert.insertId;
  }else{
   const [notes]=await connection.query<RowDataPacket[]>('SELECT id,note FROM ticket_notes WHERE id=? AND ticket_id=? FOR UPDATE',[args.id,tickets[0].id]);
   if(!notes.length)throw new InputError('Note not found on this ticket',404);before=notes[0];
   await connection.execute(action==='update'?'UPDATE ticket_notes SET note=? WHERE id=? AND ticket_id=?':'DELETE FROM ticket_notes WHERE id=? AND ticket_id=?',action==='update'?[args.note,args.id,tickets[0].id]:[args.id,tickets[0].id]);
  }
  await connection.execute('UPDATE tickets SET updated_at=CURRENT_TIMESTAMP WHERE id=?',[tickets[0].id]);
  await audit(connection,'tickets',args.ticketNo,`${action}_note`,before,{id:noteId,note:args.note??null},null,actorName);
  return {ticketNo:args.ticketNo,id:noteId,action};
 });
}
