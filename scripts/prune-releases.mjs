import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function pruneReleases(root, protectedPaths, log=console.log) {
  const canonical=await fs.realpath(root);
  if(canonical!==path.resolve(root)||path.basename(canonical)!=='releases')throw new Error('Unsafe releases directory');
  const protectedSet=new Set();
  for(const item of protectedPaths)protectedSet.add(await fs.realpath(item));
  if(![...protectedSet].some(item=>path.dirname(item)===canonical))throw new Error('No protected release within root');
  for(const entry of await fs.readdir(canonical,{withFileTypes:true})) {
    if(!entry.isDirectory()||! /^[a-f0-9]{40}-\d+-\d+$/.test(entry.name))continue;
    const candidate=path.join(canonical,entry.name);
    if(protectedSet.has(candidate))continue;
    if(await fs.realpath(candidate)!==candidate||path.dirname(candidate)!==canonical)throw new Error('Unsafe cleanup target');
    await fs.rm(candidate,{recursive:true});
    log(`Removed inactive deployment release: ${candidate}`);
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.length<5)throw new Error('Pass releases root, active release, previous release');
  await pruneReleases(process.argv[2],process.argv.slice(3));
}
