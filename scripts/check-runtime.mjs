import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import http from 'node:http';
const port=Number(process.env.RUNTIME_TEST_PORT||3019);
const base=`http://127.0.0.1:${port}`;
// node:http preserves an explicit Host header for reverse-proxy simulation.
const rootResponse=headers=>new Promise((resolve,reject)=>{
  const req=http.get(base+'/',{headers},response=>{
    response.resume();resolve({status:response.statusCode,location:response.headers.location});
  });
  req.on('error',reject);
});
const child=spawn(process.execPath,['server.js'],{
  cwd:path.resolve('.netdesk-runtime'),
  env:{...process.env,PORT:String(port),HOSTNAME:'127.0.0.1',NODE_ENV:'production'},
  stdio:['ignore','pipe','pipe'],
});
let logs='';
child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);
const stopped=new Promise(resolve=>child.once('exit',resolve));
child.on('error',error=>logs+=error.message);
try {
  let response;
  for(let i=0;i<100;i++) {
    if(child.exitCode!==null)throw new Error(logs);
    try {response=await fetch(base+'/login');if(response.ok)break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(response?.status,200,logs);
  const html=await response.text();assert.match(html,/NetDesk/);
  const assets=[...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map(match=>match[1]);
  assert.ok(assets.length>0,'No static assets in login page');
  for(const asset of assets)assert.equal((await fetch(new URL(asset,base))).status,200,asset);
  assert.equal((await fetch(base+'/api/analytics')).status,401,'Runtime must preserve API authentication');
  const proxied=await rootResponse({host:'netdesk.tanvirsoft.com','x-forwarded-proto':'https','x-forwarded-host':'attacker.example'});
  assert.equal(proxied.status,307);
  assert.equal(proxied.location,'https://netdesk.tanvirsoft.com/login','Public redirect must not use the internal listener or an untrusted forwarded host');
  const local=await rootResponse({host:`localhost:${port}`});
  assert.equal(local.status,307);
  assert.equal(local.location,process.env.NETDESK_PUBLIC_URL?new URL('/login',process.env.NETDESK_PUBLIC_URL).href:`http://localhost:${port}/login`);
  console.log('PASS: runtime login/assets/API auth and proxied/local login redirects.');
}finally {
  child.kill();await stopped;
}
