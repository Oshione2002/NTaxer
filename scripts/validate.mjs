import {readFile,readdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {CALCULATORS} from '../dist/calculators.js';
const root=new URL('../',import.meta.url);
for(const file of ['app.js','engine.js','calculators.js','schedules.js','coverage.js']){
 const proc=spawnSync(process.execPath,['--check',new URL('dist/'+file,root).pathname],{encoding:'utf8'});assert.equal(proc.status,0,proc.stderr);
}
const html=await readFile(new URL('dist/index.html',root),'utf8');
for(const [,asset] of html.matchAll(/(?:src|href)="([^"#][^"]*)"/g))if(!/^https?:/.test(asset))assert.ok((await stat(new URL('dist/'+asset,root))).isFile(),`Missing asset ${asset}`);
const law=JSON.parse(await readFile(new URL('dist/law.json',root),'utf8'));
assert.deepEqual(law.sections.map(s=>s.number),Array.from({length:202},(_,i)=>i+1));assert.equal(law.schedules.length,14);assert.equal(law.pages.length,215);
for(const s of law.sections){assert.ok(s.text.length>10,`Section ${s.number} missing text`);assert.ok(s.page>=11&&s.page<=130);}
for(const s of law.schedules)assert.ok(s.page&&s.page<=215);
for(const c of CALCULATORS){assert.ok(c.refs.every(n=>law.sections.some(s=>s.number===n)),`Bad reference in ${c.id}`);assert.equal(new Set(c.fields.filter(f=>f.key).map(f=>f.key)).size,c.fields.filter(f=>f.key).length,`Duplicate fields in ${c.id}`);}
for(const file of ['vercel.json','dist/manifest.webmanifest'])JSON.parse(await readFile(new URL(file,root),'utf8'));
const vercel=JSON.parse(await readFile(new URL('vercel.json',root),'utf8'));assert.equal(vercel.outputDirectory,'dist');
console.log(`Validated ${CALCULATORS.length} calculators, 202 law sections, 14 schedules, assets, JavaScript syntax and Vercel configuration.`);
