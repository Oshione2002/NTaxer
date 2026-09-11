import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../dist/service-worker.js',import.meta.url),'utf8');
const scope='https://ntaxer.example/';
const handlers={};
const stores=new Map();
const keyFor=(input,{ignoreSearch=false}={})=>{
 const url=new URL(typeof input==='string'?input:input.url,scope);
 if(ignoreSearch)url.search='';
 return url.href;
};
const cacheFor=name=>{
 if(!stores.has(name))stores.set(name,new Map());
 const store=stores.get(name);
 return {
  async addAll(paths){for(const path of paths)store.set(keyFor(path),new Response(`cached:${path}`));},
  async match(input,options){return store.get(keyFor(input,options));},
  async put(input,response){store.set(keyFor(input),response);}
 };
};
const context={
 URL,Request,Response,Promise,console,
 fetch:async()=>{throw new TypeError('offline');},
 caches:{open:async name=>cacheFor(name),keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name)},
 self:{
  location:new URL(scope),registration:{scope},clients:{claim:async()=>{}},skipWaiting:async()=>{},
  addEventListener(type,handler){handlers[type]=handler;}
 }
};
vm.runInNewContext(source,context,{filename:'service-worker.js'});

test('offline cache contains the complete NTaxer application',async()=>{
 let pending;
 handlers.install({waitUntil(value){pending=value;}});
 await pending;
 const cached=[...stores.values()][0];
 for(const path of ['index.html','app.js','styles.css','law.json','assets/icon.png','assets/nigeria-tax-act-2025-nass.pdf']){
  assert.ok(cached.has(new URL(path,scope).href),`${path} is not cached`);
 }
});

test('offline navigation and versioned assets use the cache',async()=>{
 let navigation;
 handlers.fetch({request:{method:'GET',mode:'navigate',url:`${scope}calculator/paye`},respondWith(value){navigation=value;}});
 const page=await navigation;
 assert.match(await page.text(),/cached:\.\/index\.html/);
 let asset;
 handlers.fetch({request:{method:'GET',mode:'same-origin',url:`${scope}app.js?v=2`},respondWith(value){asset=value;}});
 assert.match(await (await asset).text(),/cached:\.\/app\.js/);
});
