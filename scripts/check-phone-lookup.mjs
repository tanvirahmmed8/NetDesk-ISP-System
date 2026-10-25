import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

// Load the pure lookup helpers without opening a database connection.
const require=createRequire(import.meta.url),cache=new Map();
function load(file) {
  const absolute=path.resolve(file);if(cache.has(absolute))return cache.get(absolute).exports;
  const module={exports:{}};cache.set(absolute,module);
  const compiled=ts.transpileModule(fs.readFileSync(absolute,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  new Function("require","module","exports",compiled)(name=>name.startsWith(".")?load(path.resolve(path.dirname(absolute),name+".ts")):require(name),module,module.exports);
  return module.exports;
}
const {normalizePhone,phoneVariants,customerMatchesSearch}=load("lib/phone.ts");
const {resolveCustomer,parseCustomerLookup}=load("lib/customer-lookup.ts");
for(const phone of ["01711-234567","01711 234567","+8801711234567","008801711234567","1711234567"]){assert.equal(normalizePhone(phone),"01711234567");assert.ok(phoneVariants(phone).includes("8801711234567"));}
assert.throws(()=>normalizePhone("not-a-number"));assert.throws(()=>parseCustomerLookup({phone:""}));assert.throws(()=>parseCustomerLookup({}));assert.throws(()=>parseCustomerLookup({search:"123",cid:"CID-1"}));
const record={id:1,cid:"CID-10021",phone:"01711-234567",name:"Arif"};
for(const search of ["01711234567","+8801711234567","01711","arif","CID-10021"])assert.equal(customerMatchesSearch(record,search),true,search);
assert.equal(customerMatchesSearch(record,"01999999999"),false);
function connection(results){const calls=[];return {calls,async query(sql,values){calls.push({sql,values});return [results.shift()||[],[]];}};}
const byCid=connection([[record]]);assert.equal((await resolveCustomer(byCid,{cid:record.cid})).cid,record.cid);assert.equal(byCid.calls.length,1);
const byPhone=connection([[record]]);assert.equal((await resolveCustomer(byPhone,{phone:"+8801711234567"})).cid,record.cid);assert.ok(byPhone.calls[0].values.includes("01711234567"));
const legacy=connection([[],[record]]);assert.equal((await resolveCustomer(legacy,{cid:"01711234567"})).cid,record.cid);assert.equal(legacy.calls.length,2);
const locked=connection([[record]]);await resolveCustomer(locked,{phone:record.phone},true);assert.ok(locked.calls[0].sql.endsWith("FOR UPDATE"));
await assert.rejects(()=>resolveCustomer(connection([[record,{...record,id:2,cid:"CID-2"}]]),{phone:record.phone}),error=>error.status===409);
await assert.rejects(()=>resolveCustomer(connection([[record]]),{cid:record.cid,phone:"01999999999"}),error=>error.status===409);
await assert.rejects(()=>resolveCustomer(connection([[]]),{phone:record.phone}),error=>error.status===404);
console.log("PASS: phone normalization, UI search, CID priority, legacy phone fallback, locked lookup, duplicate/mismatched phone guards and not-found handling.");
