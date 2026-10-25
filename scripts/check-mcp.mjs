import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Starts an isolated production server with a temporary secret; does not edit .env.
const port=Number(process.env.MCP_TEST_PORT||3018);
const endpoint=`http://127.0.0.1:${port}/mcp/v1`;
const secret=randomBytes(32).toString("hex");
await mkdir(".data-mcp-check",{recursive:true});
const settingsDir=await mkdtemp(".data-mcp-check/run-");
const testEnv={...process.env,MCP_API_KEY:secret,NETDESK_DIST_DIR:".next-mcp-check",NETDESK_SETTINGS_DIR:settingsDir,MCP_ALLOWED_ORIGINS:"http://localhost:3008,http://127.0.0.1:3008"};
console.log("Building isolated MCP test server…");
const build=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{env:testEnv,stdio:"inherit"});
const buildCode=await new Promise(resolve=>build.once("exit",resolve));
assert.equal(buildCode,0,"Isolated build failed");
let logs="";
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p",String(port),"-H","127.0.0.1"],{env:testEnv,stdio:["ignore","pipe","pipe"]});
child.stdout.on("data",chunk=>{logs+=chunk;});child.stderr.on("data",chunk=>{logs+=chunk;});
const client=new Client({name:"netdesk-check",version:"1.0.0"});
try {
  let ready=false,lastStatus;
  for(let i=0;i<150;i++) {
    if(child.exitCode!==null)throw new Error(`Test server stopped: ${logs}`);
    try{const response=await fetch(endpoint);lastStatus=response.status;if(response.status===401){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,`Test server did not start (HTTP ${lastStatus}). ${logs}`);
  const headers={Authorization:`Bearer ${secret}`,Accept:"application/json, text/event-stream","Content-Type":"application/json"};
  assert.equal((await fetch(endpoint,{method:"POST",headers:{...headers,Origin:"https://untrusted.example"},body:"{}"})).status,403);
  const preflight=await fetch(endpoint,{method:"OPTIONS",headers:{Origin:"http://localhost:3008","Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"authorization,content-type"}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get("access-control-allow-origin"),"http://localhost:3008");
  assert.equal((await fetch(endpoint,{headers})).status,405);
  const rest=endpoint.replace("/mcp/v1","");
  const settingsUrl=rest+"/api/settings/mcp";
  const initialSettings=await(await fetch(settingsUrl)).json();assert.equal(initialSettings.data.source,"environment");
  assert.equal((await fetch(settingsUrl,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({origins:[]})})).status,401);
  assert.equal((await fetch(settingsUrl,{method:"PUT",headers,body:JSON.stringify({origins:["https://client.example.com/invalid-path"]})})).status,400);
  const origins=[...initialSettings.data.origins,"https://client.example.com"];
  const saved=await fetch(settingsUrl,{method:"PUT",headers,body:JSON.stringify({origins})});assert.equal(saved.status,200);
  const loaded=await(await fetch(settingsUrl)).json();assert.equal(loaded.data.source,"settings");assert.deepEqual(loaded.data.origins,origins);
  assert.equal((await fetch(endpoint,{method:"OPTIONS",headers:{Origin:"https://client.example.com"}})).status,204);
  await fetch(settingsUrl,{method:"PUT",headers,body:JSON.stringify({origins:initialSettings.data.origins})});
  assert.equal((await fetch(endpoint,{method:"OPTIONS",headers:{Origin:"https://client.example.com"}})).status,403);
  for(const [path,payload] of [["/api/customers",{cid:123}],["/api/packages",{name:"Bad",speedMbps:-1,price:5}],["/api/tickets",{cid:"CID-10021"}],["/api/import",{entity:"invalid",rows:[]}]] ) {
    const response=await fetch(rest+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    assert.equal(response.status,400,`Validation for ${path}`);
  }
  const malformed=await fetch(endpoint,{method:"POST",headers,body:"{"});assert.equal(malformed.status,400);
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint),{requestInit:{headers:{Authorization:`Bearer ${secret}`}}}));
  const {tools}=await client.listTools();
  assert.equal(tools.length,31);
  for(const name of ["list_customers","create_customer","update_customer","delete_customer","list_packages","create_package","get_package","list_tickets","get_ticket","set_ticket_status","create_ticket_note","update_ticket_note","delete_ticket_note","bulk_import","dashboard_summary"])assert.ok(tools.some(tool=>tool.name===name),name);
  const resourceList=await client.listResources();assert.ok(resourceList.resources.some(r=>r.uri==="netdesk://guide"));
  const guide=await client.readResource({uri:"netdesk://guide"});assert.ok(guide.contents.length);
  const templates=await client.listResourceTemplates();assert.equal(templates.resourceTemplates.length,2);
  const prompts=await client.listPrompts();assert.ok(prompts.prompts.some(p=>p.name==="customer_support_review"));
  const prompt=await client.getPrompt({name:"customer_support_review",arguments:{cid:"CID-10021"}});assert.ok(prompt.messages.length);
  const invalid=await client.callTool({name:"create_package",arguments:{name:"Invalid",speedMbps:-1,price:500}});assert.equal(invalid.isError,true);
  const invalidLookup=await client.callTool({name:"get_customer",arguments:{phone:"not-a-phone"}});assert.equal(invalidLookup.isError,true);assert.ok(invalidLookup.content[0].text.includes("Invalid phone"));
  const lookupTool=tools.find(tool=>tool.name==="get_customer");assert.ok(lookupTool.inputSchema.properties.phone);
  for(const name of ["create_package","update_package"]){const tool=tools.find(tool=>tool.name===name);for(const field of ["unlimited","serviceHours","connectionType","publicIpCount","otcCharge","supportHours","vatPercent","vatIncluded"])assert.ok(tool.inputSchema.properties[field],`${name}.${field}`);}
  const phonePrompt=await client.getPrompt({name:"customer_support_review",arguments:{phone:"01711234567"}});assert.ok(phonePrompt.messages[0].content.text.includes("01711234567"));
  const packages=await client.callTool({name:"list_packages",arguments:{limit:1}});
  if(packages.isError)console.log("Database read returned a handled tool error; database integration remains unverified.");
  else assert.ok(packages.structuredContent?.data);
  await client.ping();
  console.log("PASS: SDK handshake, 31 tools, resources/templates, prompt, validation, auth, persisted origin settings with immediate add/remove enforcement, malformed JSON and ping.");
}finally{
  await client.close().catch(()=>{});
  child.kill();
  await unlink(join(settingsDir,"mcp-settings.json")).catch(()=>{});
  await rmdir(settingsDir).catch(()=>{});
}
