'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
function inlineScripts(html){return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(m=>!/(?:application\/json|text\/plain)/i.test(m[1])).map(m=>m[2]).filter(x=>x.trim())}
for(const path of ['atalia/index.html','index.html','atalia/delegado/index.html','delegado/index.html']){
 test('Validar JavaScript del aplicativo '+path,()=>{
   const scripts=inlineScripts(read(path));assert(scripts.length>0);
   scripts.forEach(x=>new vm.Script(x,{filename:path}));
 });
}
for(const [path,prefix] of [['atalia/sw.js','atalia-registro-'],['sw.js','daos-registro-'],['atalia/delegado/sw.js','atalia-personal-shell-'],['delegado/sw.js','daos-personal-shell-']]){
 test('Service Worker no borra la caché de otros proyectos: '+path,async()=>{
   const listeners={},removed=[],others=prefix.startsWith('atalia')?'daos-registro-previous':'atalia-registro-previous';
   const old=prefix+'previous';
   const self={location:{origin:'https://obra.example'},addEventListener:(name,fn)=>listeners[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}};
   const caches={keys:async()=>[old,others],delete:async key=>{removed.push(key);return true},open:async()=>({addAll:async()=>{},put:async()=>{}}),match:async()=>null};
   const context={self,caches,URL,fetch:async()=>({ok:true,clone(){return this}})};
   vm.runInNewContext(read(path),context,{filename:path});
   let promise;listeners.activate({waitUntil:x=>promise=x});await promise;
   assert.deepEqual(removed,[old]);
   const privatePaths=prefix.startsWith('atalia')?['/atalia/api/delegated-status','/atalia/delegado/api/session']:['/api/session','/delegado/api/session'];
   for(const subpath of privatePaths){let intercepted=false;listeners.fetch({request:{method:'GET',url:'https://obra.example'+subpath,mode:'navigate'},respondWith:()=>{intercepted=true}});assert.equal(intercepted,false)}
 });
}
for(const path of ['atalia/manifest.webmanifest','manifest.webmanifest','atalia/delegado/manifest.webmanifest','delegado/manifest.webmanifest']){
 test('La PWA conserva identidad y alcance instalados: '+path,()=>{
   const manifest=JSON.parse(read(path));assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');assert.match(manifest.start_url,/index\.html/);
 });
}
test('Los nuevos registros ATALÍA mantienen histórico y avance separado',()=>{
 const app=read('atalia/index.html');assert.match(app,/CONEXIONES EXTERNAS'\s*,\s*\['Potable'\]/);
 assert.match(app,/LEGACY_CONFLICTS/);assert.match(app,/REGISTRADOR_ACTUAL=\{id:'marcos-castro'/);
 assert.match(app,/Object\.prototype\.hasOwnProperty\.call\(source\.activityWeights/);
 assert.match(app,/\[6,7\]\.includes\(catalog\.length\)/);assert.match(app,/configureInPlaceUpdates/);
 assert.ok(!app.includes("['CONEXIONES EXTERNAS',['COMPLETA','Potable']]"));
});
test('DAOS instala sin cuenta Dropbox en la pantalla de actualización',()=>{
 const app=read('index.html');assert.match(app,/configureInPlaceUpdates/);
 assert.match(app,/V10\.2/);
});

test('Los accesos iPhone de terceros no comparten credenciales ni envían datos sin servidor',()=>{for(const path of ['atalia/delegado/index.html','delegado/index.html']){const html=read(path);assert.doesNotMatch(html,/refreshToken|dropboxAuth|api\.dropboxapi\.com/);assert.match(html,/sincronización|sincronizaci[oó]n/i);}});
