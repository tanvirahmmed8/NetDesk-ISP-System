"use client";
import { FormEvent, useEffect, useState } from "react";
import { packageDefaults, packagePricing } from "@/lib/package-details";
import { customerOpsFields, ticketOpsFields } from "@/lib/ops-config";
import { OperationsAccess, OperationsFields, OpsRow } from "./OperationsWorkspace";

type RecordData = Record<string, unknown>;
type Entity = "customers" | "packages" | "tickets";
const fields: Record<Entity,string[]> = {
  customers:["cid","name","phone","email","address","packageId","nextPaymentDate","accountStatus"],
  packages:["name","speedMbps","price","unlimited","serviceHours","connectionType","publicIpCount","otcCharge","supportHours","vatPercent","vatIncluded"],
  tickets:["cid","phone","category","subject","description","priority","status"],
};
const examples: Record<Entity,string[]> = {
  customers:["DEMO-20001","Demo Customer","01700123456","demo@example.com","Dhaka","1","2026-12-01","active"],
  packages:["CONFIDENT+","200","2000","true","24","fiber_optics","0","0","24/7","5","false"],
  tickets:["","01711234567","no_internet","No connection","Connection unavailable","high","open"],
};
const enums: Record<string,string[]> = {unlimited:["true","false"],vatIncluded:["true","false"],connectionType:["fiber_optics","wireless","ethernet","other"],accountStatus:["active","suspended","inactive"],category:["no_internet","slow_speed","billing","line_issue","other"],priority:["low","medium","high","urgent"],status:["open","in_progress","resolved","closed"]};
const labels:Record<string,string>={price:"Monthly price (BDT)",speedMbps:"Speed (Mbps)",serviceHours:"Service hours per day",publicIpCount:"Public IP count",otcCharge:"One-time charge / OTC (BDT)",supportHours:"Customer care hours",vatPercent:"VAT (%)",vatIncluded:"VAT included in listed price?",unlimited:"Unlimited usage?"};
const label = (s:string) => labels[s]||s.replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase());

export function parseCsv(input:string) {
  const records:string[][]=[]; let row:string[]=[]; let value=""; let quoted=false;
  const source=input.replace(/^\uFEFF/,"");
  for(let i=0;i<source.length;i++) {
    const c=source[i];
    if(c==='"') { if(quoted && source[i+1]==='"') {value+='"';i++;} else if(quoted || value==='') quoted=!quoted; else throw new Error("Invalid quote in CSV"); }
    else if(c==="," && !quoted) {row.push(value);value="";}
    else if((c==="\n" || c==="\r") && !quoted) {if(c==="\r" && source[i+1]==="\n") i++; row.push(value); if(row.some(x=>x.trim()))records.push(row);row=[];value="";}
    else value+=c;
  }
  if(quoted)throw new Error("Unclosed quote in CSV");
  row.push(value);if(row.some(x=>x.trim()))records.push(row);
  if(records.length<2)throw new Error("CSV must contain headers and at least one data row");
  const headers=records.shift()!.map(x=>x.trim());
  if(headers.some(x=>!x)||new Set(headers).size!==headers.length)throw new Error("Headers must be unique and non-empty");
  return {headers,rows:records.map((record,index)=>{if(record.length!==headers.length)throw new Error(`Row ${index+2}: incorrect column count`);return Object.fromEntries(headers.map((h,i)=>[h,record[i].trim()]));})};
}

export default function DataManager({entity,records,packages,onRefresh,accessKey="",onKeyChange=()=>{}}:{entity:Entity;records:RecordData[];packages:RecordData[];onRefresh:()=>Promise<void>;accessKey?:string;onKeyChange?:(key:string)=>void}) {
  const key=entity==="customers"?"cid":entity==="tickets"?"ticketNo":"id";
  const [selected,setSelected]=useState(""); const [editing,setEditing]=useState(false);
  const [form,setForm]=useState<RecordData>({}); const [mode,setMode]=useState<"create"|"update">("create");
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  const [pending,setPending]=useState<RecordData[]>([]); const [results,setResults]=useState<{row:number;success:boolean;message?:string;action?:string}[]>([]);
  const [notes,setNotes]=useState<{note:string;createdAt:string}[]|null>(null);
  const [showOps,setShowOps]=useState(false);
  const [references,setReferences]=useState<Record<string,OpsRow[]>>({});
  const [events,setEvents]=useState<OpsRow[]>([]);
  const advancedFields=entity==="customers"?customerOpsFields:entity==="tickets"?ticketOpsFields:[];
  useEffect(()=>{setReferences({});setEvents([]);setShowOps(false);if(!accessKey){setReferences({});setEvents([]);setShowOps(false);return;}let active=true;Promise.all(["pops","teams","employees","issue-types"].map(async name=>{const r=await fetch(`/api/operations?entity=${name}`,{headers:{Authorization:`Bearer ${accessKey}`}});const j=await r.json();if(!r.ok)throw new Error(j.message||j.error);return [name,j.data] as const;})).then(entries=>{if(active)setReferences(Object.fromEntries(entries));}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[accessKey]);
  const current=records.find(row=>String(row[key])===selected);
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setMessage("");try{await action();}catch(error){setMessage(error instanceof Error?error.message:"Request failed");}finally{setBusy(false);}};
  async function save(event:FormEvent) { event.preventDefault();await run(async()=>{
    const response=await fetch(`/api/manage/${entity}`,{method:mode==="create"?"POST":"PUT",headers:{"Content-Type":"application/json",...(accessKey?{Authorization:`Bearer ${accessKey}`}:{})},body:JSON.stringify({...Object.fromEntries([...fields[entity],...(showOps?advancedFields.map(field=>field.key):[])].filter(field=>form[field]!==undefined).map(field=>[field,form[field]])),...(mode==="update"?{[key]:form[key]}:{})})});
    const json=await response.json();if(!response.ok)throw new Error(json.message||json.error);setMessage(json.data?.action==="note_added"?"Complaint added to the existing ticket as a note":json.message);setEditing(false);await onRefresh();
  }); }
  function open(nextMode:"create"|"update") {
    void run(async()=>{
      setMode(nextMode);setNotes(null);setEvents([]);
      let nextForm=nextMode==="update"?{...(entity==="packages"?packageDefaults:{}),...current}:{...Object.fromEntries(fields[entity].map(field=>[field,enums[field]?.[0]??(field==="packageId"?packages[0]?.id??"":"")])),...(entity==="packages"?packageDefaults:{})};
      if(nextMode==="update"&&accessKey&&entity!=="packages"){
        const response=await fetch(`/api/operations?detail=1&entity=${entity}&key=${encodeURIComponent(String(current?.[key]))}`,{headers:{Authorization:`Bearer ${accessKey}`}});
        const json=await response.json();if(!response.ok)throw new Error(json.message||json.error);nextForm={...nextForm,...json.data.record};setEvents(json.data.events);setShowOps(true);
      }
      setForm(nextForm);setEditing(true);
    });
  }
  async function remove() {
    if(!current || !window.confirm(entity==="customers"?`Delete ${selected}? All this customer's tickets and notes will also be deleted. This cannot be undone.`:`Delete ${selected}? This cannot be undone.`))return;
    await run(async()=>{const response=await fetch(`/api/manage/${entity}`,{method:"DELETE",headers:{"Content-Type":"application/json",...(accessKey?{Authorization:`Bearer ${accessKey}`}:{})},body:JSON.stringify({[key]:current[key]})});const json=await response.json();if(!response.ok)throw new Error(json.message);setMessage(json.message);setSelected("");setNotes(null);await onRefresh();});
  }
  async function readFile(file:File|undefined) {if(!file)return;setPending([]);setResults([]);await run(async()=>{
    if(file.size>2*1024*1024)throw new Error("CSV must be smaller than 2 MB");
    const parsed=parseCsv(await file.text());const missing=fields[entity].filter(field=>!(entity==="tickets"&&["cid","phone"].includes(field))&&!(entity==="packages"&&field in packageDefaults)&&!parsed.headers.includes(field));
    if(entity==="tickets"&&!parsed.headers.includes("cid")&&!parsed.headers.includes("phone"))missing.push("cid or phone");
    if(missing.length)throw new Error(`Missing columns: ${missing.join(", ")}`);
    if(parsed.rows.length>500)throw new Error("Maximum 500 rows per upload");setPending(parsed.rows);setMessage(`${parsed.rows.length} rows ready. Review the preview, then import.`);
  });}
  function download() {const blob=new Blob([fields[entity].join(",")+"\r\n"+examples[entity].join(",")+"\r\n"],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${entity}-template.csv`;a.click();URL.revokeObjectURL(url);}
  return <div className="manager">
    {entity!=="packages"&&<details className="ops-unlock"><summary>Operational fields & activity (key required)</summary><OperationsAccess value={accessKey} onChange={onKeyChange}/></details>}
    <div className="manager-actions"><button disabled={busy} onClick={()=>open("create")}>+ Create {entity.slice(0,-1)}</button><select aria-label={`Select ${entity} to manage`} value={selected} onChange={e=>{setSelected(e.target.value);setNotes(null);setEditing(false);}}><option value="">Select a record to edit / delete</option>{records.map(row=><option key={String(row[key])} value={String(row[key])}>{String(row[key])} — {String(row.name??row.subject??"")}{row.phone?` · ${String(row.phone)}`:""}</option>)}</select><button disabled={!current||busy} onClick={()=>open("update")}>View / Edit</button><button className="danger" disabled={!current||busy} onClick={remove}>Delete</button>{entity==="tickets"&&<button disabled={!current||busy} onClick={()=>run(async()=>{const response=await fetch(`/api/tickets?ticketNo=${encodeURIComponent(selected)}`);const json=await response.json();if(!response.ok)throw new Error(json.message);setNotes(json.data.notes);})}>View notes</button>}</div>
    {message&&<p role="status" className="manager-message">{message}</p>}
    {editing&&<form onSubmit={save} className="manager-editor"><h3>{mode==="create"?"Create":"Edit"} {entity.slice(0,-1)}</h3>{entity==="tickets"&&<p>Identify the customer using CID or phone. If both are provided, they must match the same customer.</p>}<div className="form-grid">{fields[entity].map(field=><label key={field}>{label(field)}{field==="packageId"?<select required value={String(form[field]??"")} onChange={e=>setForm({...form,[field]:e.target.value})}><option value="">Choose package</option>{packages.map(pkg=><option key={String(pkg.id)} value={String(pkg.id)}>{String(pkg.name)} — {String(pkg.speedMbps)} Mbps — ৳{String(pkg.price)}</option>)}</select>:enums[field]?<select value={String(form[field]??"")} onChange={e=>setForm({...form,[field]:e.target.value})}>{enums[field].map(v=><option key={v} value={v}>{["unlimited","vatIncluded"].includes(field)?v==="true"?"Yes":"No":v.replaceAll("_"," ")}</option>)}</select>:field==="description"||field==="address"?<textarea required={field==="description"} value={String(form[field]??"")} onChange={e=>setForm({...form,[field]:e.target.value})}/>:<input required={field!=="email"&&field!=="address"&&field!=="nextPaymentDate"&&!(entity==="tickets"&&["cid","phone"].includes(field))} readOnly={mode==="update"&&entity==="customers"&&field==="cid"} type={field==="nextPaymentDate"?"date":field==="email"?"email":["price","speedMbps","serviceHours","publicIpCount","otcCharge","vatPercent"].includes(field)?"number":"text"} min={["price","otcCharge","vatPercent","publicIpCount"].includes(field)?0:1} max={field==="serviceHours"?24:field==="vatPercent"?100:field==="publicIpCount"?1000:undefined} step={["price","otcCharge","vatPercent"].includes(field)?"0.01":undefined} value={String(form[field]??"")} onChange={e=>setForm({...form,[field]:e.target.value})}/>}</label>)}</div>{advancedFields.length>0&&<><label className="ops-checkbox"><input type="checkbox" disabled={!accessKey} checked={showOps} onChange={e=>setShowOps(e.target.checked)}/> Edit operational details</label>{showOps&&<OperationsFields fields={advancedFields} form={form} onChange={setForm} lookups={references}/>}</>}{entity==="packages"&&<p className="package-form-summary">Monthly total: ৳{packagePricing({price:Number(form.price||0),vatPercent:Number(form.vatPercent||0),vatIncluded:String(form.vatIncluded)}).monthlyTotal.toLocaleString()} · OTC: ৳{Number(form.otcCharge||0).toLocaleString()} one-time. VAT inclusion controls whether VAT is added to the listed monthly price.</p>}<div className="manager-actions"><button disabled={busy}>Save</button><button type="button" onClick={()=>setEditing(false)}>Cancel</button></div></form>}
    {notes&&<div className="notes-panel"><h3>Ticket notes</h3>{notes.length?notes.map((note,index)=><p key={index}><small>{note.createdAt}</small><br/>{note.note}</p>):<p>No notes yet.</p>}</div>}
    {events.length>0&&accessKey&&<div className="ops-timeline"><h3>Activity history</h3>{events.map(event=><article key={String(event.id)}><b>{String(event.action).replaceAll("_"," ")}</b><small>{String(event.occurredAt)} · {String(event.actorName||"Recorded action")}</small>{event.note!=null&&<p>{String(event.note)}</p>}<details><summary>Changes</summary><pre>{JSON.stringify({before:event.beforeData,after:event.afterData},null,2)}</pre></details></article>)}</div>}
    <details className="bulk-panel"><summary>Bulk upload {entity} (CSV)</summary><p>Download the template, fill in your data, and upload a CSV. Maximum 500 rows / 2 MB. Existing identifiers are rejected; tickets in an unresolved category become notes. Successful rows are saved even if other rows fail.</p><div className="manager-actions"><button onClick={download}>Download template</button><input type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>{void readFile(e.target.files?.[0]);e.target.value="";}}/></div>{pending.length>0&&<><div className="import-preview"><pre>{JSON.stringify(pending.slice(0,3),null,2)}</pre></div><button disabled={busy} onClick={()=>run(async()=>{const response=await fetch("/api/import",{method:"POST",headers:{"Content-Type":"application/json",...(accessKey?{Authorization:`Bearer ${accessKey}`}:{})},body:JSON.stringify({entity,rows:pending})});const json=await response.json();if(!response.ok)throw new Error(json.message);setResults(json.data.results);setPending([]);setMessage(`${json.data.imported} imported, ${json.data.failed} failed`);await onRefresh();})}>{busy?"Importing…":`Import ${pending.length} rows`}</button></>}{results.length>0&&<ul className="import-results">{results.map(row=><li key={row.row}>Row {row.row}: {row.success?row.action==="note_added"?"Note added":"Imported":row.message}</li>)}</ul>}</details>
  </div>;
}
