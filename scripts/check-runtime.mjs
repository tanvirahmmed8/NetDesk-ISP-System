import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
const port=Number(process.env.RUNTIME_TEST_PORT||3019);
const base=`http://127.0.0.1:${port}`;
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
  console.log('PASS: standalone runtime login, JS/CSS assets and API authentication.');
}finally {
  child.kill();await stopped;
}
