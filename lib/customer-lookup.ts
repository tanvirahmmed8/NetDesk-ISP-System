import { PoolConnection, RowDataPacket } from "mysql2/promise";
import { InputError } from "./errors";
import { normalizePhone, phoneVariants } from "./phone";
export { normalizePhone, phoneVariants } from "./phone";

export type CustomerLookup={cid?:string;phone?:string;search?:string};
export function parseCustomerLookup(input:string|CustomerLookup):CustomerLookup {
  const body=typeof input==="string"?{search:input}:input;
  if(!body||typeof body!=="object")throw new InputError("Provide CID or phone");
  const lookup:CustomerLookup={};
  for(const field of ["cid","phone","search"] as const){
    const value=body[field];if(value===undefined)continue;
    if(typeof value!=="string"||!value.trim()||value.trim().length>80)throw new InputError(`Invalid ${field}`);
    lookup[field]=value.trim();
  }
  if(!lookup.cid&&!lookup.phone&&!lookup.search)throw new InputError("Provide CID or phone");
  if(lookup.search&&(lookup.cid||lookup.phone))throw new InputError("Use search alone, or cid/phone parameters");
  if(lookup.phone)normalizePhone(lookup.phone);
  return lookup;
}

export async function resolveCustomer(connection:Pick<PoolConnection,"query">,input:string|CustomerLookup,lock=false) {
  const lookup=parseCustomerLookup(input),identifier=lookup.cid||lookup.search;
  const suffix=lock?" FOR UPDATE":"";
  if(identifier){
    const [rows]=await connection.query<(RowDataPacket&{id:number;cid:string;phone:string})[]>(`SELECT c.id,c.cid,c.phone FROM customers c WHERE c.cid=? LIMIT 1${suffix}`,[identifier]);
    if(rows.length){
      if(lookup.phone&&normalizePhone(rows[0].phone)!==normalizePhone(lookup.phone))throw new InputError("CID and phone refer to different customers",409);
      return rows[0];
    }
    if(lookup.phone)throw new InputError("Customer not found",404);
  }
  let variants:string[];
  try{variants=phoneVariants(lookup.phone||identifier||"");}catch(error){if(lookup.phone)throw error;throw new InputError("Customer not found",404);}
  const [rows]=await connection.query<(RowDataPacket&{id:number;cid:string;phone:string})[]>(`SELECT c.id,c.cid,c.phone FROM customers c WHERE REGEXP_REPLACE(c.phone,'[^0-9]','') IN (${variants.map(()=>"?").join(",")}) LIMIT 2${suffix}`,variants);
  if(!rows.length)throw new InputError("Customer not found",404);
  if(rows.length>1)throw new InputError("Multiple customers share this phone number. Use a CID to select one.",409);
  return rows[0];
}
