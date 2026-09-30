// Solo interfaz pública de la aplicación; nunca se guardan respuestas de autenticación ni registros.
const CACHE='atalia-personal-shell-v1-20260928', PREFIX='atalia-personal-shell-';
const SHELL=['./index.html','./manifest.webmanifest','../atalia-icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);if(url.origin!==self.location.origin||url.pathname.includes('/api/'))return;
 if(req.mode==='navigate')event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match('./index.html')));
 else event.respondWith(caches.match(req).then(match=>match||fetch(req)));
});
