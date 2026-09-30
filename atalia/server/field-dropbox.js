'use strict';
/** Dropbox only runs on the server. No caller-provided endpoint or Dropbox path is accepted. */
const crypto=require('node:crypto');
const CONFIG=Object.freeze({
 atalia:{root:'/Atalía Villa',book:'/Atalía Villa/ATALIA_VILLAS_BASE_MAESTRA_CUBICACIONES_V34_AJUSTADA.xlsx',
   env:'FIELD_ATALIA',allowUsers:['jose-reynoso']},
 daos:{root:'/Daos Villas',book:'/Daos Villas/DAOS_LIBRO_OBRA_LEVANTAMIENTO_V07.xlsx',
   env:'FIELD_DAOS',allowUsers:['andres-mora']}
});
const cache=new Map();
function projectConfig(project){const c=CONFIG[project];if(!c)throw Object.assign(Error('Proyecto no autorizado'),{status:403});return c}
async function accessToken(project){
 const p=projectConfig(project),cached=cache.get(project);
 if(cached&&cached.until>Date.now()+60000)return cached.token;
 const key=process.env[p.env+'_APP_KEY'],secret=process.env[p.env+'_APP_SECRET'],
 refresh=process.env[p.env+'_REFRESH_TOKEN'];
 if(!(key&&secret&&refresh))throw Object.assign(Error('Conexión segura no configurada'),{status:503});
 const response=await fetch('https://api.dropbox.com/oauth2/token',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh,client_id:key,client_secret:secret})});
 if(!response.ok)throw Object.assign(Error('El servidor no pudo renovar el acceso seguro'),{status:503});
 const json=await response.json();cache.set(project,{token:json.access_token,until:Date.now()+Math.max(300,Number(json.expires_in)||3600)*1000});
 return json.access_token;
}
function assertPath(project,path){const root=projectConfig(project).root;
 if(typeof path!=='string'||path!==root&&!path.startsWith(root+'/')||path.includes('..')||/[\r\n]/.test(path))
 throw Object.assign(Error('Ruta fuera del proyecto'),{status:403});
 return path;
}
// Dropbox requires ASCII-escaped JSON inside Dropbox-API-Arg HTTP headers.
function headerJson(obj){
 return JSON.stringify(obj).replace(/[\u007f-\uffff]/g,
  ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'));
}
function dbxError(status,body){const e=Error('Dropbox no confirmó la operación ('+status+')');e.status=status===409?409:status>=500?503:502;e.detail=String(body||'').slice(0,600);return e}
async function rpc(project,endpoint,arg){const token=await accessToken(project);
 const response=await fetch('https://api.dropboxapi.com/2/'+endpoint,{method:'POST',
 headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(arg)});
 if(!response.ok)throw dbxError(response.status,await response.text());return response.json();
}
async function metadata(project,path){return rpc(project,'files/get_metadata',{path:assertPath(project,path)});}
async function download(project,path){
 const token=await accessToken(project),r=await fetch('https://content.dropboxapi.com/2/files/download',{
 method:'POST',headers:{Authorization:'Bearer '+token,'Dropbox-API-Arg':JSON.stringify({path:assertPath(project,path)})}});
 if(!r.ok)throw dbxError(r.status,await r.text());return Buffer.from(await r.arrayBuffer());
}
async function upload(project,path,data,revision){
 const token=await accessToken(project),bytes=Buffer.isBuffer(data)?data:Buffer.from(data);
 if(bytes.length>120*1024*1024)throw Object.assign(Error('Archivo demasiado grande'),{status:413});
 const mode=revision?{'.tag':'update',update:revision}:'add';
 const arg={path:assertPath(project,path),mode,autorename:false,mute:true,strict_conflict:true};
 const r=await fetch('https://content.dropboxapi.com/2/files/upload',{method:'POST',
 headers:{Authorization:'Bearer '+token,'Dropbox-API-Arg':headerJson(arg),'Content-Type':'application/octet-stream'},body:bytes});
 if(!r.ok)throw dbxError(r.status,await r.text());return r.json();
}
async function ensureFolder(project,path){
 try{const m=await metadata(project,path);if(m['.tag']!=='folder')throw Error('Se esperaba carpeta');}
 catch(err){if(err.status!==409)throw err;await rpc(project,'files/create_folder_v2',{path:assertPath(project,path),autorename:false});}
}
async function uploadTicket(project,path){
 return rpc(project,'files/get_temporary_upload_link',{
  commit_info:{path:assertPath(project,path),mode:'add',autorename:false,mute:true,strict_conflict:true},duration:900
 });
}
async function list(project,path){
 let r=await rpc(project,'files/list_folder',{path:assertPath(project,path),recursive:false,include_deleted:false,limit:1000});
 let entries=[...(r.entries||[])],pages=0;
 while(r.has_more&&++pages<5){r=await rpc(project,'files/list_folder/continue',{cursor:r.cursor});entries.push(...(r.entries||[]))}
 if(r.has_more)throw Error('Demasiados elementos en la carpeta de control');
 return entries;
}
function contentHash(data){
 const input=Buffer.from(data),hashes=[];
 for(let offset=0;offset<input.length;offset+=4*1024*1024)hashes.push(crypto.createHash('sha256').update(input.subarray(offset,offset+4*1024*1024)).digest());
 return crypto.createHash('sha256').update(Buffer.concat(hashes)).digest('hex');
}
module.exports={projectConfig,assertPath,rpc,metadata,download,upload,ensureFolder,uploadTicket,list,contentHash};
