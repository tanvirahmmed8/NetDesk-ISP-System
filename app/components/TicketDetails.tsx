"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, X } from 'lucide-react';
import { readApiResponse } from '@/lib/api-response';

type Note={id:number;note:string;createdAt:string};
type Detail={id:number;ticketNo:string;subject:string;description:string;category:string;priority:string;status:string;cid:string|null;customerName:string;phone?:string;createdAt:string;updatedAt?:string;resolvedAt?:string|null};
const label=(value:string)=>value.replaceAll('_',' ');
const stamp=(value:string)=>value.replace('T',' ').slice(0,19);
export default function TicketDetails({ticketNo,onClose,onRefresh,onCustomer}:{ticketNo:string;onClose:()=>void;onRefresh:()=>Promise<void>;onCustomer:(cid:string)=>void}){
 const [ticket,setTicket]=useState<Detail|null>(null),[notes,setNotes]=useState<Note[]>([]),[draft,setDraft]=useState(''),[editingId,setEditingId]=useState<number|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const dialog=useRef<HTMLDivElement>(null),closeButton=useRef<HTMLButtonElement>(null);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  const json=await readApiResponse(await fetch(`/api/tickets?ticketNo=${encodeURIComponent(ticketNo)}`,{cache:'no-store',signal}));
  if(!signal?.aborted){setTicket(json.data.ticket);setNotes(json.data.notes);}
 },[ticketNo]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setTicket(null);setNotes([]);setDraft('');setEditingId(null);setMessage('');
  refresh(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Unable to load ticket');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[refresh]);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;closeButton.current?.focus();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!busy){onClose();return;}
   if(event.key==='Tab'){
    const targets=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),input:not(:disabled),a[href]')||[]);const first=targets[0],last=targets[targets.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',onKey);return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=overflow;previous?.focus();};
 },[onClose,busy]);
 async function write(method:'POST'|'PUT'|'DELETE',body:Record<string,unknown>){
  setBusy(true);setError('');setMessage('');
  try{
   const result=await readApiResponse(await fetch(`/api/tickets/${encodeURIComponent(ticketNo)}/notes`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
   setDraft('');setEditingId(null);setMessage(result.message||'Saved');
   try{await Promise.all([refresh(),onRefresh()]);}catch{setError('The note was saved, but refresh failed. Close and reopen the ticket; do not submit it again.');}
  }catch(e){setError(e instanceof Error?e.message:'Unable to save note');}finally{setBusy(false);}
 }
 function submit(event:FormEvent){event.preventDefault();if(!draft.trim())return;void write(editingId?'PUT':'POST',{note:draft,...(editingId?{id:editingId}:{})});}
 return <div className="ticket-detail-backdrop" onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}><div ref={dialog} className="ticket-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="ticket-detail-title">
  <div className="ticket-detail-heading"><div><p className="eyebrow">SUPPORT TICKET</p><h2 id="ticket-detail-title">{ticket?`Ticket #${ticket.id}`:'Ticket details'}</h2></div><button ref={closeButton} disabled={busy} onClick={onClose} aria-label="Close ticket details"><X size={21}/></button></div>
  {error&&<p className="ticket-detail-error" role="alert">{error}</p>}{message&&<p className="ticket-detail-success" role="status">{message}</p>}
  {loading?<p className="ticket-detail-loading">Loading ticket…</p>:ticket&&<>
   <div className="ticket-detail-summary"><div><span className={`status ${ticket.status}`}>{label(ticket.status)}</span><span className={`priority ${ticket.priority}`}>{ticket.priority}</span><h3>{ticket.subject}</h3><p>{ticket.customerName}{ticket.cid?` · ${ticket.cid}`:''}{ticket.phone?` · ${ticket.phone}`:''}</p></div>{ticket.cid&&<button onClick={()=>onCustomer(ticket.cid!)}>View customer</button>}</div>
   <dl className="ticket-detail-meta"><div><dt>Category</dt><dd>{label(ticket.category)}</dd></div><div><dt>Created</dt><dd>{stamp(ticket.createdAt)}</dd></div>{ticket.updatedAt&&<div><dt>Last updated</dt><dd>{stamp(ticket.updatedAt)}</dd></div>}{ticket.resolvedAt&&<div><dt>Resolved</dt><dd>{stamp(ticket.resolvedAt)}</dd></div>}</dl>
   <section className="ticket-detail-description"><h3>Complaint / description</h3><p>{ticket.description}</p><small>The original description is separate from notes. Adding a note does not replace it.</small></section>
   <details className="ticket-detail-reference"><summary>API reference</summary><code>{ticket.ticketNo}</code><p>Existing references are preserved. New tickets receive a six-digit numeric reference.</p></details>
   <section className="ticket-detail-notes"><h3>Notes <span>{notes.length}</span></h3>{notes.length?notes.map(note=><article key={note.id}><div className="ticket-note-top"><time>{stamp(note.createdAt)}</time><div><button disabled={busy} onClick={()=>{setEditingId(note.id);setDraft(note.note);setMessage('');}}>Edit</button><button disabled={busy} onClick={()=>{if(window.confirm('Delete this note? Activity history will be retained.'))void write('DELETE',{id:note.id});}}>Delete</button></div></div><p>{note.note}</p></article>):<p className="ticket-no-notes">No notes yet. Your imported follow-up text is in the description above.</p>}</section>
   <form className="ticket-note-form" onSubmit={submit}><label htmlFor="ticket-note"><MessageSquarePlus size={17}/>{editingId?'Edit note':'Add a note'}</label><textarea id="ticket-note" required maxLength={10000} rows={4} placeholder="Write an update, contact result or resolution note…" disabled={busy} value={draft} onChange={e=>setDraft(e.target.value)}/><div><small>{draft.length.toLocaleString()}/10,000 characters</small>{editingId&&<button type="button" disabled={busy} onClick={()=>{setEditingId(null);setDraft('');}}>Cancel edit</button>}<button className="ticket-note-submit" disabled={busy||!draft.trim()}>{busy?'Saving…':editingId?'Save note':'Add note'}</button></div></form>
  </>}
 </div></div>;
}
