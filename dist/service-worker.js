const CACHE_VERSION='ntaxer-offline-v72';
const APP_SHELL=[
 './',
 './index.html',
 './app.js',
 './app-v27.js',
 './ai.js',
 './theme.js',
 './styles.css',
 './styles-v39.css',
 './ai.css',
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
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  const oldCaches=keys.filter(key=>key.startsWith('ntaxer-offline-')&&key!==CACHE_VERSION);
  const upgrading=oldCaches.length>0;
  await Promise.all(oldCaches.map(key=>caches.delete(key)));
  await self.clients.claim();

  // Existing installed apps may still be running an older cached app.js.
  // After a real version upgrade, reload open app windows once so the
  // newly activated service worker and latest UI take effect immediately.
  if(upgrading){
   const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
   await Promise.all(clients.map(client=>{
    if(!client.url.startsWith(self.location.origin))return Promise.resolve();
    return client.navigate(client.url).catch(()=>null);
   }));
  }
 })());
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


self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
