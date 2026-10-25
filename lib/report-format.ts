import { InputError } from "./errors";
export type ReportKind="customers"|"tickets";
export const reportMappings:Record<ReportKind,Record<string,string>>={
 customers:{cid:"Customer ID",name:"Name",phone:"Mobile No.",address:"Address",district:"District",upazila:"Upazilla",popName:"POP",popType:"PoP Type",registrationDate:"Entry Date",remarks:"Remarks",packageName:"Package",agreedMrc:"MRC",agreedOtc:"OTC",paymentStatus:"Payment Status"},
 tickets:{ticketNo:"Ticket NO",source:"Ticket Source",subject:"Subject",lastNote:"Last Note",teamName:"Assigned(Team)",priority:"Priority",status:"Status",cid:"Customer ID",customerName:"Customer Name",reporterName:"Name",reporterPhone:"Mobile No.",description:"Message",popName:"POP Name",packageName:"Package",otherInfo:"Other Info",createdAt:"Entry Date Time",createdByName:"Create By",assignedMemberName:"Assigned(Member)",assignedByName:"Assigned By",forwardedByName:"Forwarded By",customerType:"Catagory",resolvedByName:"Resolved By",resolvedAt:"Resolved Date",firstWorkMessage:"First WP Message",lastWorkMessage:"Last WP Message",lastActivityText:"Last Activity"}
};
export function csvRecords(input:string){
 const records:{cells:string[];line:number}[]=[];let cells:string[]=[],value="",quoted=false,line=1,start=1,closed=false;
 const source=input.replace(/^\uFEFF/,"");
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(c==='"'){if(quoted&&source[i+1]==='"'){value+='"';i++;}else if(quoted){quoted=false;closed=true;}else if(!value){quoted=true;}else throw new InputError(`Invalid CSV quote at line ${line}`);}
  else if(!quoted&&(c===","||c==="\r"||c==="\n")){
   cells.push(value);value="";closed=false;
   if(c!==","){if(c==="\r"&&source[i+1]==="\n")i++;if(cells.some(v=>v.trim()))records.push({cells,line:start});cells=[];line++;start=line;}
  }else{if(closed&&!/\s/.test(c))throw new InputError(`Unexpected text after quote at line ${line}`);if(!closed)value+=c;if(c==="\n")line++;}
 }
 if(quoted)throw new InputError("Unclosed CSV quote");cells.push(value);if(cells.some(v=>v.trim()))records.push({cells,line:start});return records;
}
export function parseReport(csv:string,kind:ReportKind,mapping?:Record<string,string>){
 if(typeof csv!=="string"||Buffer.byteLength(csv)>2*1024*1024)throw new InputError("CSV must be at most 2 MB");
 const records=csvRecords(csv);
 const headerIndex=records.findIndex(row=>row.cells.some(cell=>cell.trim()===(kind==="customers"?"Customer ID":"Ticket NO")));
 if(headerIndex<0)throw new InputError("Report header not found. Expected Customer ID or Ticket NO.");
 const headers=records[headerIndex].cells.map((value,index)=>value.trim()||`__column_${index}`);
 if(new Set(headers).size!==headers.length)throw new InputError("Duplicate named CSV columns");
 const map=mapping??reportMappings[kind];
 const rows=records.slice(headerIndex+1).filter(row=>row.cells.some(cell=>cell.trim())).map(row=>{
  if(row.cells.length!==headers.length)throw new InputError(`CSV column count mismatch at line ${row.line}`);
  const original=Object.fromEntries(headers.map((header,index)=>[header,row.cells[index].trim()]));
  const payload=Object.fromEntries(Object.keys(reportMappings[kind]).map(field=>[field,original[map[field]]||""]));
  return {rowNumber:row.line,original,payload};
 });
 if(!rows.length||rows.length>500)throw new InputError("Report must contain 1–500 rows");
 return {headers,mapping:map,rows};
}
export function reportDate(input:unknown,format:"MDY"|"DMY",withTime=false){
 if(input==null||String(input).trim()==="")return null;
 const value=String(input).trim();let y:number,m:number,d:number,h=0,min=0,sec=0;
 const iso=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
 const local=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
 if(iso){const values=iso.map(Number);y=values[1];m=values[2];d=values[3];h=values[4]||0;min=values[5]||0;sec=values[6]||0;}else if(local){const values=local.map(Number);y=values[3];m=values[format==="MDY"?1:2];d=values[format==="MDY"?2:1];h=values[4]||0;min=values[5]||0;sec=values[6]||0;}else throw new InputError(`Invalid date: ${value}`);
 const stamp=new Date(Date.UTC(y,m-1,d,h,min,sec));
 if(stamp.getUTCFullYear()!==y||stamp.getUTCMonth()!==m-1||stamp.getUTCDate()!==d||h>23||min>59||sec>59)throw new InputError(`Invalid date: ${value}`);
 const date=stamp.toISOString().slice(0,10);return withTime?`${date} ${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}`:date;
}
export function ticketSource(value:string){const source=value.trim().toLowerCase();return ({"revechat-whatapp":"whatsapp","revechat-whatsapp":"whatsapp","revechat-messanger":"messenger","revechat-messenger":"messenger","revechat-web":"web",mail:"email"} as Record<string,string>)[source]||source||"manual";}
