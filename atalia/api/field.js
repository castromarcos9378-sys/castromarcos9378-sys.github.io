'use strict';
const crypto=require('node:crypto');
const auth=require('../server/field-auth');
const dbx=require('../server/field-dropbox');
const books=require('../server/field-book');
const MAX_JSON=180000;
function fail(message,status=400){throw Object.assign(Error(message),{status});}
function respond(res,status,json){return res.status(status).json(json);}
function limitBody(req){
 const length=Number(req.headers['content-length']||0);
 if(length>MAX_JSON)fail('Petición demasiado grande',413);
 if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))fail('Se requiere JSON');
 return typeof req.body==='object'&&req.body&&!Array.isArray(req.body)?req.body:fail('Petición JSON inválida');
}
function validId(project,id){
 return typeof id==='string'&&id.length<=100&&
 (project==='atalia'?/^ATALIA-[a-z0-9_-]{12,80}$/i:/^(?:DAOS-)?[a-f0-9-]{30,48}$/i).test(id);
}
function paths(project){
 const root=dbx.projectConfig(project).root;
 return {root,book:dbx.projectConfig(project).book,
  photos:root+'/FOTOS_CAMPO_DELEGADO',manifests:root+'/REGISTROS_CAMPO_DELEGADOS',
  backups:root+'/RESPALDOS_REGISTRO_DELEGADO'};
}
function manifestPath(who,id){return paths(who.project).manifests+'/'+id+'.json';}
async function maybeManifest(who,id){
 try{const path=manifestPath(who,id);const [m,bytes]=await Promise.all([dbx.metadata(who.project,path),dbx.download(who.project,path)]);
 return {manifest:JSON.parse(bytes.toString('utf8')),rev:m.rev};}
 catch(e){if(e.status===409)return null;throw e;}
}
function photoExt(type){return type==='image/png'?'.png':type==='image/jpeg'?'.jpg':type==='image/webp'?'.webp':null;}
function safePhoto(who,data){
 if(!validId(who.project,data.recordId)||!/^[a-zA-Z0-9_-]{8,96}$/.test(String(data.photoId||''))||
   !photoExt(data.type)||!Number.isInteger(data.size)||data.size<1000||data.size>18*1024*1024)
 fail('Identificador, tamaño o formato de foto incorrecto');
 const p=paths(who.project),folder=p.photos+'/'+data.recordId,
  path=folder+'/'+data.photoId+photoExt(data.type);
 return {path,folder};
}
async function ticket(who,body){
 const {folder,path}=safePhoto(who,body),p=paths(who.project);
 await dbx.ensureFolder(who.project,p.photos);await dbx.ensureFolder(who.project,folder);
 const result=await dbx.uploadTicket(who.project,path);
 if(!result?.link)fail('No se obtuvo enlace temporal de carga',503);
 return {uploadUrl:result.link,path,expiresInSeconds:900};
}
async function verifyPhotos(who,r,photos){
 if(!Array.isArray(photos)||photos.length>10)fail('Cantidad de fotos no admitida');
 const unique=new Set(),checked=[];
 for(const p of photos){
  const canonical=safePhoto(who,{recordId:r.id,photoId:p.id,type:p.type,size:p.size});
  if(p.path!==canonical.path||unique.has(p.path))fail('La evidencia no pertenece a este registro');
  unique.add(p.path);
  const meta=await dbx.metadata(who.project,p.path);
  if(meta['.tag']!=='file'||Number(meta.size)!==p.size)fail('La fotografía aún no está confirmada en el servidor',409);
  checked.push({id:p.id,path:p.path,size:p.size,type:p.type,contentHash:meta.content_hash||''});
 }
 return checked;
}
async function liveReference(who){
 const book=dbx.projectConfig(who.project).book;
 const meta=await dbx.metadata(who.project,book),buffer=await dbx.download(who.project,book);
 const {info}=books.readBook(buffer,who.project);
 return {...books.publicReference(info,meta.name),bookRevision:meta.rev};
}
async function updateManifest(who,id,expectedRev,manifest){
 return dbx.upload(who.project,manifestPath(who,id),Buffer.from(JSON.stringify(manifest)),expectedRev);
}
async function commit(who,body){
 const r=body.record;
 if(!r||!validId(who.project,r.id)||r.project!==(who.project==='atalia'?'ATALIA':'DAOS'))
 fail('Registro o proyecto inválido');
 const p=paths(who.project);
 let current=await maybeManifest(who,r.id);
 const stableRecord={...r,registradoPor:who.name,registradorId:who.id,project:r.project};
 // Stable canonical payload guards against reusing an id with a different record.
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify({
  id:r.id,villa:r.villa,tipo:r.tipo,actividad:r.actividad,subactividad:r.subactividad,
  estado:r.estado,fechaInicio:r.fechaInicio,fechaFin:r.fechaFin||'',observacion:r.observacion||'',registrador:who.id
 })).digest('hex');
 if(current){
  if(current.manifest.fingerprint!==fingerprint||current.manifest.who!==who.id)
    fail('Este identificador pertenece a otro registro',409);
  if(current.manifest.state==='confirmed')return {status:'confirmed',id:r.id,author:who.name,duplicate:true};
 }else{
  // Create this one-time idempotency marker only after the current Excel and all photos are validated.
  const [meta,bytes]=await Promise.all([dbx.metadata(who.project,p.book),dbx.download(who.project,p.book)]);
  const {info}=books.readBook(bytes,who.project);
  if(info.ids.has(r.id))return {status:'confirmed',id:r.id,author:who.name,duplicate:true};
  books.validated(stableRecord,info);
  const photos=await verifyPhotos(who,r,body.photos||[]);
  const manifest={version:1,id:r.id,project:who.project,who:who.id,fingerprint,
     record:stableRecord,photos,state:'pending',created:new Date().toISOString()};
  await dbx.ensureFolder(who.project,p.manifests);
  try{const created=await dbx.upload(who.project,manifestPath(who,r.id),Buffer.from(JSON.stringify(manifest)));
      current={manifest,rev:created.rev};}
  catch(e){if(e.status!==409)throw e;
    current=await maybeManifest(who,r.id);
    if(!current||current.manifest.who!==who.id||current.manifest.fingerprint!==fingerprint)
      fail('Conflicto al confirmar registro',409);
  }
 }
 // Recovery-safe: every retry re-reads and verifies the latest book before any write.
 await dbx.ensureFolder(who.project,p.backups);
 for(let attempt=0;attempt<3;attempt++){
  const [meta,bytes]=await Promise.all([dbx.metadata(who.project,p.book),dbx.download(who.project,p.book)]);
  const {info}=books.readBook(bytes,who.project);
  if(info.ids.has(r.id)){
   const final={...current.manifest,state:'confirmed',confirmed:new Date().toISOString()};
   try{await updateManifest(who,r.id,current.rev,final);}catch(e){if(e.status!==409)throw e;}
   return {status:'confirmed',id:r.id,author:who.name,duplicate:true};
  }
  books.validated(stableRecord,info);
  // Require photos still present even when an earlier request was interrupted.
  for(const photo of current.manifest.photos||[]){
   const m=await dbx.metadata(who.project,photo.path);
   if(m['.tag']!=='file'||Number(m.size)!==photo.size)fail('Evidencia no verificada; se conservó el borrador',409);
  }
  const mutation=books.write(bytes,who.project,stableRecord,who);
  const stamp=new Date().toISOString().replace(/[^\d]/g,'').slice(0,17);
  // A complete pre-write backup is required; abort on any backup error.
  await dbx.upload(who.project,p.backups+'/PRE_SYNC_'+stamp+'_'+r.id+'.xlsx',bytes);
  try{await dbx.upload(who.project,p.book,mutation.bytes,meta.rev);}
  catch(e){if(e.status===409)continue;throw e;}
  const confirmed=books.readBook(await dbx.download(who.project,p.book),who.project);
  if(!confirmed.info.ids.has(r.id))fail('No se pudo confirmar el registro después de escribir',503);
  const final={...current.manifest,state:'confirmed',confirmed:new Date().toISOString()};
  try{await updateManifest(who,r.id,current.rev,final);}catch(e){if(e.status!==409)throw e;}
  return {status:'confirmed',id:r.id,author:who.name,duplicate:false};
 }
 fail('Otro dispositivo modificó el Libro Maestro. Vuelve a sincronizar; no se perdió el registro.',409);
}
async function status(who,id){
 if(!validId(who.project,id))fail('ID no válido');
 const found=await maybeManifest(who,id);
 if(!found)return {state:'not-received'};
 if(found.manifest.who!==who.id)fail('Este registro no pertenece a tu cuenta',403);
 if(found.manifest.state==='confirmed')return {state:'confirmed',author:who.name};
 const bytes=await dbx.download(who.project,paths(who.project).book);
 return {state:books.readBook(bytes,who.project).info.ids.has(id)?'confirmed':'pending',author:who.name};
}
module.exports=async function field(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('Pragma','no-cache');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 try{
  const op=String(req.query?.op||'');
  const method=req.method;
  if(['activate','login','commit','photo-ticket','logout'].includes(op)){
   if(method!=='POST')fail('Método incorrecto',405);
   if(!auth.checkOrigin(req))fail('Origen no permitido',403);
  }else if(method!=='GET')fail('Método incorrecto',405);
  if(op==='activate')return respond(res,200,await auth.activate(req,res,limitBody(req)));
  if(op==='login')return respond(res,200,await auth.login(req,res,limitBody(req)));
  if(op==='logout')return respond(res,200,auth.logout(res));
  const project=String(req.query?.project||'');
  dbx.projectConfig(project);
  const who=await auth.assertSession(req,project);
  if(op==='me')return respond(res,200,{active:true,id:who.id,name:who.name,project:who.project});
  if(op==='reference')return respond(res,200,await liveReference(who));
  if(op==='photo-ticket')return respond(res,200,await ticket(who,limitBody(req)));
  if(op==='commit')return respond(res,200,await commit(who,limitBody(req)));
  if(op==='status')return respond(res,200,await status(who,String(req.query?.id||'')));
  fail('Operación no encontrada',404);
 }catch(e){
  const status=Number(e.status)||500;
  // Do not leak Dropbox internals, server secrets, stack traces, user hashes or private paths.
  if(status>=500)console.error('field '+String(req.query?.op||'')+': '+String(e.message).slice(0,160));
  return respond(res,status>=400&&status<=599?status:500,
    {error:status>=500?'Servicio temporalmente no disponible':e.message});
 }
};
