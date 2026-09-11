const CACHE_VERSION='ntaxer-offline-v3';
const APP_SHELL=[
 './',
 './index.html',
 './app.js',
 './theme.js',
 './styles.css',
 './manifest.webmanifest',
 './calculators.js',
 './coverage.js',
 './engine.js',
 './export.js',
 './schedules.js',
 './law.json',
 './assets/icon.png',
 './assets/nigeria-tax-act-2025-nass.pdf'
];

self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE_VERSION).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ntaxer-offline-')&&key!==CACHE_VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

async function offlineResponse(request){
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return fetch(request);
 const cache=await caches.open(CACHE_VERSION);
 if(request.mode==='navigate'){
  try{
   const response=await fetch(request);
   if(response.ok)await cache.put('./index.html',response.clone());
   return response;
  }catch{
   return (await cache.match('./index.html'))||(await cache.match('./'));
  }
 }
 const cached=await cache.match(request,{ignoreSearch:true});
 const keepCached=url.pathname.endsWith('.pdf')||url.pathname.endsWith('/assets/icon.png');
 if(cached&&keepCached)return cached;
 try{
  const response=await fetch(request);
  if(response.ok)await cache.put(request,response.clone());
  return response;
 }catch{
  return cached||new Response('This resource is unavailable while offline.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
 }
}

self.addEventListener('fetch',event=>{
 if(event.request.method==='GET')event.respondWith(offlineResponse(event.request));
});
