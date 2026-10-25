// Creates temporary demo records and removes only those records afterwards.
import assert from "node:assert/strict";
import fs from "node:fs";
if(fs.existsSync(".env"))process.loadEnvFile(".env");
const base = process.env.TEST_BASE_URL || "http://localhost:3008";
const stamp = Date.now().toString();
const cid = `CHECK-${stamp}`;
const phone=`017${stamp.slice(-8)}`;
let packageId;
let ticketNo;
const importedPackageIds=[];
async function api(path, method="GET", body) {
  const response = await fetch(base+path,{method,headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.MCP_API_KEY}`},...(body?{body:JSON.stringify(body)}:{})});
  const json = await response.json();return {status:response.status,...json};
}
try {
  const featureFields={unlimited:true,serviceHours:24,connectionType:"fiber_optics",publicIpCount:1,otcCharge:1000,supportHours:"24/7",vatPercent:5,vatIncluded:false};
  const pkg = await api("/api/packages","POST",{name:`Check ${stamp}`,speedMbps:25,price:500,...featureFields});
  assert.equal(pkg.success,true,pkg.message);packageId=pkg.data.id;
  let saved=(await api("/api/packages")).data.find(row=>row.id===packageId);
  for(const [field,value] of Object.entries(featureFields))assert.equal(saved[field],value,field);
  assert.equal(saved.monthlyTotal,525);assert.equal(saved.vatAmount,25);
  assert.equal((await api("/api/packages","PUT",{id:packageId,name:`Check ${stamp}`,speedMbps:30,price:600})).success,true);
  saved=(await api("/api/packages")).data.find(row=>row.id===packageId);
  assert.equal(saved.publicIpCount,1);assert.equal(saved.otcCharge,1000);assert.equal(saved.vatPercent,5);assert.equal(saved.monthlyTotal,630);
  for(const invalid of [{serviceHours:25},{vatPercent:-1},{publicIpCount:0.5}])assert.equal((await api("/api/packages","POST",{name:"Invalid",speedMbps:10,price:100,...invalid})).status,400);
  const packageImport=await api("/api/import","POST",{entity:"packages",rows:[{name:`Check import ${stamp}`,speedMbps:"250",price:"2500",unlimited:"true",serviceHours:"24",connectionType:"fiber_optics",publicIpCount:"1",otcCharge:"0",supportHours:"24/7",vatPercent:"5",vatIncluded:"false"}]});
  assert.equal(packageImport.data.imported,1);importedPackageIds.push(packageImport.data.results[0].id);
  const importedPlan=(await api("/api/packages")).data.find(row=>row.id===importedPackageIds[0]);assert.equal(importedPlan.monthlyTotal,2625);assert.equal(importedPlan.otcCharge,0);
  const customer={cid,name:"Temporary check",phone:`${phone.slice(0,5)}-${phone.slice(5)}`,packageId,nextPaymentDate:"2026-12-01",accountStatus:"active"};
  assert.equal((await api("/api/manage/customers","POST",customer)).success,true);
  assert.equal((await api("/api/customers","PUT",{...customer,name:"Updated check"})).success,true);
  assert.equal((await api(`/api/customers?cid=${cid}`)).data.customer.name,"Updated check");
  const customerDetails=(await api(`/api/customers?cid=${cid}`)).data.customer;assert.equal(Number(customerDetails.packageMonthlyTotal),630);assert.equal(Number(customerDetails.publicIpCount),1);
  const analytics=await api("/api/analytics?days=7");assert.equal(analytics.success,true,analytics.message);assert.ok(analytics.data.customers.monthlyValue>=630);
  assert.equal((await api(`/api/customers?phone=${phone}`)).data.customer.cid,cid);
  assert.equal((await api(`/api/customers?phone=${encodeURIComponent('+88'+phone)}`)).data.customer.cid,cid);
  assert.equal((await api(`/api/customers?cid=${phone}`)).data.customer.cid,cid);
  assert.equal((await api(`/api/customers?search=${phone}`)).data.customer.cid,cid);
  assert.equal((await api("/api/packages","DELETE",{id:packageId})).status,409);
  const complaint={phone,category:"other",subject:"Check",description:"Check complaint",priority:"medium",status:"open"};
  const ticket=await api("/api/manage/tickets","POST",complaint);assert.equal(ticket.success,true,ticket.message);ticketNo=ticket.data.ticketNo;
  const imported=await api("/api/import","POST",{entity:"tickets",rows:[{...complaint,description:"Repeat complaint"},{...complaint,cid:"missing-customer"}]});
  assert.equal(imported.data.imported,1);assert.equal(imported.data.failed,1);assert.equal(imported.data.results[0].action,"note_added");
  assert.equal((await api(`/api/tickets?ticketNo=${ticketNo}`)).data.notes.length,1);
  assert.equal((await api("/api/tickets","PUT",{...complaint,ticketNo,status:"resolved",subject:"Updated complaint"})).success,true);
  assert.equal((await api(`/api/tickets?ticketNo=${ticketNo}`)).data.ticket.status,"resolved");
  assert.equal((await api("/api/tickets","DELETE",{ticketNo})).success,true);ticketNo=undefined;
  assert.equal((await api("/api/customers","DELETE",{cid})).success,true);
  assert.equal((await api("/api/packages","PUT",{id:packageId,name:`Check ${stamp}`,speedMbps:30,price:630,vatIncluded:true})).success,true);
  saved=(await api("/api/packages")).data.find(row=>row.id===packageId);assert.equal(saved.monthlyTotal,630);assert.equal(saved.vatAmount,30);
  assert.equal((await api("/api/packages","DELETE",{id:packageId})).success,true);packageId=undefined;
  console.log("PASS: CRUD, package benefits, VAT-inclusive/exclusive pricing, preserved legacy updates, CSV fields, analytics, delete guards, phone lookup and duplicate notes.");
} finally {
  if(ticketNo)await api("/api/tickets","DELETE",{ticketNo});
  await api("/api/customers","DELETE",{cid});
  if(packageId)await api("/api/packages","DELETE",{id:packageId});
  for(const id of importedPackageIds)await api("/api/packages","DELETE",{id});
}
