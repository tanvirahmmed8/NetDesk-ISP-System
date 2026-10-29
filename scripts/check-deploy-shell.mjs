import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

if(process.platform!=='linux') {
  console.log('SKIP: mocked deployment/rollback shell test runs on Linux CI.');
}else {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'netdesk-shell-test-'));
  const script=path.resolve('scripts/deploy.sh');
  const prune=path.resolve('scripts/prune-releases.mjs');
  const id=n=>String(n).repeat(40)+'-123-1';
  try {
    for(const scenario of ['success','health-failure','low-disk','bad-checksum']) {
      const home=path.join(temp,scenario),bin=path.join(home,'bin');
      const deploy=path.join(home,'.netdesk-deploy'),root=path.join(deploy,'releases');
      const site=path.join(home,'htdocs/netdesk.tanvirsoft.com');
      const previous=path.join(root,id(1)),old=path.join(root,id(2)),candidate=path.join(root,id(3));
      const payload=path.join(home,'payload'),archive=path.join(deploy,'incoming',id(3)+'.tgz');
      for(const folder of [bin,site,path.join(previous,'.next'),old,path.dirname(archive),path.join(payload,'.next')])await fs.mkdir(folder,{recursive:true});
      await fs.writeFile(path.join(site,'.env'),'DEMO_FIXTURE=1');
      await fs.writeFile(path.join(previous,'.next/BUILD_ID'),'previous');
      await fs.writeFile(path.join(payload,'.next/BUILD_ID'),'new');
      await fs.writeFile(path.join(payload,'server.js'),'// fixture, not executed');
      await fs.copyFile(prune,path.join(payload,'prune-releases.mjs'));
      const tar=spawnSync('tar',['-czf',archive,'-C',payload,'.']);assert.equal(tar.status,0);
      const state=path.join(home,'state.json');
      await fs.writeFile(state,JSON.stringify({cwd:previous,starts:[]}));
      const mock=path.join(home,'pm2.mjs');
      await fs.writeFile(mock,`import fs from 'node:fs';
const file=process.env.MOCK_PM2_STATE,s=JSON.parse(fs.readFileSync(file)),a=process.argv.slice(2);
if(a[0]==='jlist'){console.log(JSON.stringify(s.cwd?[{name:'netdesk',pm2_env:{pm_cwd:s.cwd,status:'online'}}]:[]));}
else{if(a[0]==='delete')s.cwd=null;if(a[0]==='start'){s.cwd=a[a.indexOf('--cwd')+1];s.starts.push({args:a,port:process.env.PORT,host:process.env.HOSTNAME});}fs.writeFileSync(file,JSON.stringify(s));}
`);
      const commands={
        id:'printf "%s\\n" tanvirsoft-netdesk',
        pm2:`exec "${process.execPath}" "${mock}" "$@"`,
        curl:scenario==='health-failure'?'exit 1':'printf "%s\\n" NetDesk',
        sleep:'exit 0',
        df:`printf 'Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 999999 0 ${scenario==='low-disk'?'1':'999999'} 0%% /\\n'`,
      };
      for(const [name,body] of Object.entries(commands))await fs.writeFile(path.join(bin,name),'#!/bin/sh\n'+body+'\n',{mode:0o700});
      const digest=createHash('sha256').update(await fs.readFile(archive)).digest('hex');
      const result=spawnSync('bash',[script,id(3),'10',scenario==='bad-checksum'?'0'.repeat(64):digest],{
        env:{...process.env,HOME:home,PATH:bin+':'+process.env.PATH,MOCK_PM2_STATE:state},encoding:'utf8',timeout:20000,
      });
      const final=JSON.parse(await fs.readFile(state,'utf8'));
      await fs.access(previous);await fs.access(path.join(site,'.env'));
      await assert.rejects(fs.access(archive));
      if(scenario==='success') {
        assert.equal(result.status,0,result.stderr);
        assert.equal(final.cwd,candidate);await fs.access(candidate);
        await assert.rejects(fs.access(old));
        assert.equal(final.starts[0].port,'3008');
        assert.equal(final.starts[0].host,'127.0.0.1');
        assert.ok(final.starts[0].args.some(a=>a.startsWith('--node-args=--env-file=')));
      }else {
        assert.notEqual(result.status,0,scenario);
        assert.equal(final.cwd,previous,scenario);
        await fs.access(old);await assert.rejects(fs.access(candidate));
        if(scenario==='health-failure')assert.equal(final.starts.at(-1).args[1],'npm','Legacy rollback must use npm');
        else assert.equal(final.starts.length,0,'Preflight failures must not restart PM2');
      }
    }
    console.log('PASS: Linux deploy success, legacy rollback, low disk and checksum failures; failed runtime/upload cleanup.');
  }finally {await fs.rm(temp,{recursive:true,force:true});}
}
