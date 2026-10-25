import { InputError } from "./errors";
export function normalizePhone(value:string) {
  if(!/^[+\d\s().-]+$/.test(value))throw new InputError("Invalid phone number");
  let digits=value.replace(/\D/g,"").replace(/^00/,"");
  if(digits.length===13&&digits.startsWith("880"))digits=digits.slice(2);
  if(digits.length===10&&digits.startsWith("1"))digits=`0${digits}`;
  if(digits.length<7||digits.length>15)throw new InputError("Phone must contain 7–15 digits");
  return digits;
}
export function phoneVariants(value:string) {
  const digits=normalizePhone(value);
  return digits.length===11&&digits.startsWith("01")?[digits,`88${digits}`,`0088${digits}`,digits.slice(1)]:[digits,`00${digits}`];
}
export function customerMatchesSearch(customer:{cid?:string;name?:string;phone?:string},input:string) {
  const query=input.trim().toLowerCase();
  if(!query)return true;
  if([customer.cid,customer.name,customer.phone].some(value=>value?.toLowerCase().includes(query)))return true;
  if(!/^[+\d\s().-]+$/.test(query)||!customer.phone)return false;
  let needle=query.replace(/\D/g,"");let stored=customer.phone.replace(/\D/g,"");
  try{needle=normalizePhone(query);}catch{/* Partial phone search. */}
  try{stored=normalizePhone(customer.phone);}catch{/* Match legacy formatting. */}
  return !!needle&&stored.includes(needle);
}
