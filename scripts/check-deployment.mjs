import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pruneReleases} from './prune-releases.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'netdesk-deploy-test-'));
const id=n=>String(n).repeat(40)+'-123-1';
try {
  const root=path.join(temp,'releases'),outside=path.join(temp,'outside');
  await fs.mkdir(root);await fs.mkdir(outside);
  await fs.writeFile(path.join(outside,'keep'),'private settings');
  for(const n of [1,2,3])await fs.mkdir(path.join(root,id(n)));
  const active=path.join(root,id(1)),previous=path.join(root,id(2)),stale=path.join(root,id(3));
  await fs.mkdir(path.join(root,'not-a-managed-release'));
  await fs.symlink(outside,path.join(stale,'.data'),process.platform==='win32'?'junction':'dir');
  await pruneReleases(root,[active,previous],()=>{});
  await fs.access(active);await fs.access(previous);await fs.access(path.join(outside,'keep'));
  await fs.access(path.join(root,'not-a-managed-release'));
  await assert.rejects(fs.access(stale));
  await assert.rejects(pruneReleases(temp,[active,previous]));
  await assert.rejects(pruneReleases(root,[path.join(root,'missing'),previous]));
  await fs.symlink(outside,path.join(root,id(4)),process.platform==='win32'?'junction':'dir');
  await pruneReleases(root,[active,previous],()=>{});
  await fs.access(path.join(outside,'keep'));
  const staging=path.join(temp,'package');
  await fs.mkdir(path.join(staging,'.next/standalone/.next/cache'),{recursive:true});
  await fs.mkdir(path.join(staging,'.next/static'),{recursive:true});
  await fs.mkdir(path.join(staging,'scripts'));
  await fs.copyFile('scripts/prune-releases.mjs',path.join(staging,'scripts/prune-releases.mjs'));
  await fs.writeFile(path.join(staging,'.next/standalone/server.js'),'// fixture');
  await fs.writeFile(path.join(staging,'.next/standalone/.next/BUILD_ID'),'fixture');
  await fs.writeFile(path.join(staging,'.next/standalone/.env'),'DO_NOT_SHIP=secret');
  await fs.mkdir(path.join(staging,'.next/standalone/data'));
  await fs.writeFile(path.join(staging,'.next/standalone/data/private.csv'),'private');
  await fs.writeFile(path.join(staging,'.next/static/app.css'),'body{}');
  const pack=spawnSync(process.execPath,[path.resolve('scripts/package-runtime.mjs')],{cwd:staging,encoding:'utf8'});
  assert.equal(pack.status,0,pack.stderr);
  const output=path.join(staging,'.netdesk-runtime');
  for(const item of ['server.js','.next/BUILD_ID','.next/static/app.css','prune-releases.mjs'])await fs.access(path.join(output,item));
  for(const item of ['.env','data','.next/cache'])await assert.rejects(fs.access(path.join(output,item)));
  console.log('PASS: active/previous preserved; old release removed; settings symlinks safe; runtime excludes secrets/reports/cache.');
}finally{
  // Only this test-owned temporary directory, never the real deployment root.
  await fs.rm(temp,{recursive:true,force:true});
}
