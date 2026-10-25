import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { InputError } from "./manage";

const settingsPath=path.join(process.cwd(),process.env.NETDESK_SETTINGS_DIR || ".data","mcp-settings.json");
export function normalizeOrigins(value:unknown):string[] {
  if(!Array.isArray(value) || value.length>100)throw new InputError("Provide an array of up to 100 origins");
  return [...new Set(value.map(item=>{
    if(typeof item!=="string" || item.length>2048)throw new InputError("Each origin must be an HTTP or HTTPS URL");
    let url:URL;try{url=new URL(item.trim());}catch{throw new InputError(`Invalid origin: ${item}`);}
    if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname)||url.hostname.includes("*"))throw new InputError("Origins need protocol + domain + optional port, without paths, credentials or wildcards");
    return url.origin;
  }))];
}
export async function readMcpSettings() {
  try {
    const saved=JSON.parse(await fs.readFile(settingsPath,"utf8"));
    return {origins:normalizeOrigins(saved.origins),source:"settings" as const};
  }catch(error){
    if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
    const configured=process.env.MCP_ALLOWED_ORIGINS;
    return {origins:normalizeOrigins((configured??"http://localhost:3008,http://127.0.0.1:3008").split(",").map(s=>s.trim()).filter(Boolean)),source:configured===undefined?"default" as const:"environment" as const};
  }
}
export async function saveMcpSettings(origins:unknown) {
  const normalized=normalizeOrigins(origins);
  await fs.mkdir(path.dirname(settingsPath),{recursive:true});
  const temporary=`${settingsPath}.${randomUUID()}.tmp`;
  try {await fs.writeFile(temporary,JSON.stringify({origins:normalized},null,2),{mode:0o600});await fs.rename(temporary,settingsPath);}
  finally{await fs.unlink(temporary).catch(()=>{});}
  return {origins:normalized,source:"settings" as const};
}
export function requireMcpKey(request:Request):Response|undefined {
  const key=process.env.MCP_API_KEY;
  if(!key||key.length<32)return Response.json({error:"Set MCP_API_KEY to a secret of at least 32 characters before using MCP"},{status:503});
  const expected=Buffer.from(`Bearer ${key}`),actual=Buffer.from(request.headers.get("authorization")||"");
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return Response.json({error:"Invalid or missing bearer token"},{status:401,headers:{"WWW-Authenticate":"Bearer"}});
}
