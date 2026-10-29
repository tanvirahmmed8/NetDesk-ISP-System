import fs from 'node:fs/promises';
import path from 'node:path';
// Only package the standalone runtime, never local reports or environment files.
const source=path.resolve('.next/standalone'),destination=path.resolve('.netdesk-runtime');
await fs.access(path.join(source,'server.js'));
await fs.mkdir(destination); // Refuse to reuse an existing staging directory.
await fs.cp(source,destination,{recursive:true,filter:entry=>{
  const relative=path.relative(source,entry),parts=relative.split(path.sep);
  return !parts.some(part=>part.startsWith('.env')||part==='.git'||part==='.data')
    && parts[0]!=='data' && relative!==path.join('.next','cache')
    && !relative.startsWith(path.join('.next','cache')+path.sep);
}});
await fs.cp('.next/static',path.join(destination,'.next/static'),{recursive:true});
try {await fs.access('public');await fs.cp('public',path.join(destination,'public'),{recursive:true});}
catch(error){if(error.code!=='ENOENT')throw error;}
await fs.copyFile('scripts/prune-releases.mjs',path.join(destination,'prune-releases.mjs'));
await fs.access(path.join(destination,'.next/BUILD_ID'));
console.log('Standalone runtime staged without .env, local reports or build cache.');
