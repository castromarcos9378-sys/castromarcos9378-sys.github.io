'use strict';
/* Identity is verified server-side on EVERY privileged request. The app cannot choose an author. */
const crypto=require('node:crypto');
const store=require('./field-dropbox');
const COOKIE='__Host-field_session',MAX_AGE=12*3600;
const PEOPLE=Object.freeze({
 'jose-reynoso':{id:'jose-reynoso',name:'Ing. José Reynoso',project:'atalia'},
 'andres-mora':{id:'andres-mora',name:'Arq. Andrés Mora',project:'daos'}
});
function person(id){const who=PEOPLE[id];if(!who)throw Object.assign(Error('Usuario no autorizado'),{status:403});return who;}
function userPath(who){return store.projectConfig(who.project).root+'/CONTROL_ACCESO_MOVIL/'+who.id+'.json';}
function secureConfig(){
 const key=process.env.FIELD_SESSION_SECRET;
 if(!key||Buffer.byteLength(key)<48)throw Object.assign(Error('Servidor de acceso no configurado'),{status:503});
 return key;
}
function timeSafe(a,b){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function sha(s){return crypto.createHash('sha256').update(s).digest('hex');}
function checkOrigin(req){
 const origin=req.headers.origin;
 if(!origin)return false;
 const host=String(req.headers['x-forwarded-host']||req.headers.host||'').toLowerCase();
 try{const u=new URL(origin);return u.protocol==='https:'&&u.host.toLowerCase()===host;}catch{return false;}
}
function cookieFrom(req){
 const cookies=String(req.headers.cookie||'').split(';').map(x=>x.trim());
 const match=cookies.find(x=>x.startsWith(COOKIE+'='));return match?match.slice(COOKIE.length+1):'';
}
function setCookie(res,value,age=MAX_AGE){
 res.setHeader('Set-Cookie',COOKIE+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+age);
}
function encode(obj){return Buffer.from(JSON.stringify(obj)).toString('base64url');}
function sign(payload){const body=encode(payload);return body+'.'+crypto.createHmac('sha256',secureConfig()).update(body).digest('base64url');}
function decode(signed){
 const [body,signature,extra]=String(signed||'').split('.');
 if(!body||!signature||extra||body.length>1600)return null;
 const expected=crypto.createHmac('sha256',secureConfig()).update(body).digest('base64url');
 if(!timeSafe(signature,expected))return null;
 try{const p=JSON.parse(Buffer.from(body,'base64url').toString());if(p.exp<=Math.floor(Date.now()/1000)||!PEOPLE[p.sub]||p.project!==PEOPLE[p.sub].project)return null;return p;}catch{return null;}
}
async function getProfile(who){
 const path=userPath(who);
 // Distinguish missing metadata from a failed download. Dropbox uses HTTP 409
 // for both; treating every 409 as "not activated" produced contradictory flows.
 let meta;
 try{meta=await store.metadata(who.project,path);}
 catch(e){
  if(e.status===409&&String(e.detail||'').includes('not_found'))return null;
  console.error('field profile: metadata unavailable; status '+(e.status||500));
  throw Object.assign(Error('No se pudo verificar el perfil de acceso'),{status:503});
 }
 if(meta['.tag']!=='file')throw Object.assign(Error('El perfil no es un archivo'),{status:503});
 let bytes;
 try{bytes=await store.download(who.project,path);}
 catch(e){
  console.error('field profile: metadata exists but download failed; status '+(e.status||500));
  throw Object.assign(Error('El perfil existe, pero no se pudo leer desde Dropbox'),{status:503});
 }
 let profile;
 try{profile=JSON.parse(bytes.toString('utf8'));}
 catch{throw Object.assign(Error('El perfil no tiene un formato válido'),{status:503});}
 if(profile.id!==who.id||profile.project!==who.project||profile.name!==who.name)
  throw Object.assign(Error('Identidad de perfil inconsistente'),{status:503});
 return {profile,rev:meta.rev};
}
async function assertSession(req,project){
 const session=decode(cookieFrom(req));
 if(!session||session.project!==project)throw Object.assign(Error('Inicia sesión para continuar'),{status:401});
 const who=person(session.sub),data=await getProfile(who);
 if(!data||!data.profile.enabled||data.profile.generation!==session.gen||
    (process.env.FIELD_DISABLED_USERS||'').split(',').map(x=>x.trim()).includes(who.id))
   throw Object.assign(Error('Acceso revocado'),{status:401});
 return who;
}
async function activate(req,res,body){
 if(!checkOrigin(req))throw Object.assign(Error('Origen no autorizado'),{status:403});
 const who=person(body.userId),password=String(body.password||''),invite=String(body.invitation||'');
 if(password.length<10||password.length>128||invite.length<24||invite.length>256)
   throw Object.assign(Error('Elige una contraseña de al menos 10 caracteres e introduce el código de invitación'),{status:400});
 let invites;try{invites=JSON.parse(process.env.FIELD_INVITES_JSON||'null');}catch{invites=null;}
 const digest=invites?.[who.id];
 if(!digest||!/^[a-f0-9]{64}$/i.test(digest)||!timeSafe(sha(invite),digest))
  throw Object.assign(Error('La invitación no es válida'),{status:403});
 const existing=await getProfile(who);
 if(existing)throw Object.assign(Error('La cuenta ya está activada'),{status:409});
 const salt=crypto.randomBytes(24).toString('hex');
 const hashed=crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');
 const profile={id:who.id,name:who.name,project:who.project,password:{scheme:'scrypt-n16384',salt,hash:hashed},
  enabled:true,generation:crypto.randomUUID(),failed:0,lockUntil:0,created:new Date().toISOString()};
 // Do not treat every Dropbox 409 as an already existing account: parent
 // directory problems and file conflicts share that HTTP status.
 try{await store.ensureFolder(who.project,store.projectConfig(who.project).root+'/CONTROL_ACCESO_MOVIL');}
 catch(e){
  console.error('field activate: ensure profile folder failed; Dropbox status '+(e.status||500));
  throw Object.assign(Error('No se pudo preparar la carpeta de acceso en Dropbox'),{status:503});
 }
 try{await store.upload(who.project,userPath(who),Buffer.from(JSON.stringify(profile)));}
 catch(e){
  if(e.status===409){
   const current=await getProfile(who);
   if(current)throw Object.assign(Error('La cuenta ya está activada'),{status:409});
   console.error('field activate: Dropbox upload conflict without readable profile');
   throw Object.assign(Error('Dropbox rechazó crear el perfil. No se creó la cuenta; revisa la conexión y los permisos de Dropbox'),{status:503});
  }
  throw e;
 }
 // Do not issue a valid cookie before the newly created profile is readable.
 const confirmed=await getProfile(who);
 if(!confirmed||confirmed.profile.generation!==profile.generation){
  console.error('field activate: profile upload succeeded but read-back differs');
  throw Object.assign(Error('Dropbox no confirmó la nueva cuenta. No vuelvas a registrarte hasta revisar el acceso'),{status:503});
 }
 const token=sign({sub:who.id,project:who.project,gen:profile.generation,exp:Math.floor(Date.now()/1000)+MAX_AGE});
 setCookie(res,token);return {active:true,name:who.name,project:who.project};
}
async function login(req,res,body){
 if(!checkOrigin(req))throw Object.assign(Error('Origen no autorizado'),{status:403});
 const who=person(body.userId),password=String(body.password||'');
 if(password.length>128)throw Object.assign(Error('Credenciales inválidas'),{status:401});
 const current=await getProfile(who);
 if(!current||!current.profile.enabled)throw Object.assign(Error('Credenciales inválidas'),{status:401});
 const p=current.profile;
 if(p.lockUntil>Date.now())throw Object.assign(Error('Acceso pausado temporalmente por intentos fallidos'),{status:429});
 const actual=crypto.scryptSync(password,p.password.salt,64,{N:16384,r:8,p:1});
 const expected=Buffer.from(p.password.hash,'hex');
 if(expected.length!==actual.length||!crypto.timingSafeEqual(actual,expected)){
  p.failed=Number(p.failed||0)+1;
  if(p.failed>=5){p.failed=0;p.lockUntil=Date.now()+15*60*1000;}
  try{await store.upload(who.project,userPath(who),Buffer.from(JSON.stringify(p)),current.rev);}catch(e){if(e.status!==409)throw e;}
  throw Object.assign(Error('Credenciales inválidas'),{status:401});
 }
 if((process.env.FIELD_DISABLED_USERS||'').split(',').includes(who.id))throw Object.assign(Error('Acceso revocado'),{status:401});
 if(p.failed||p.lockUntil){p.failed=0;p.lockUntil=0;await store.upload(who.project,userPath(who),Buffer.from(JSON.stringify(p)),current.rev);}
 const token=sign({sub:who.id,project:who.project,gen:p.generation,exp:Math.floor(Date.now()/1000)+MAX_AGE});
 setCookie(res,token);return {active:true,name:who.name,project:who.project};
}
/**
 * A Jose-only, single-use recovery using the already issued invitation.
 * Never deletes a profile or changes workbook/field records.
 * Successful recovery invalidates every old session via generation rotation.
 */
async function recoverJose(req,res,body){
 if(!checkOrigin(req))throw Object.assign(Error('Origen no autorizado'),{status:403});
 const who=person(body.userId);
 if(who.id!=='jose-reynoso'||who.project!=='atalia')
  throw Object.assign(Error('Recuperación no autorizada'),{status:403});
 const password=String(body.password||''),invite=String(body.invitation||'');
 if(password.length<10||password.length>128||invite.length<24||invite.length>256)
  throw Object.assign(Error('Introduce la invitación y una contraseña de entre 10 y 128 caracteres'),{status:400});
 if((process.env.FIELD_DISABLED_USERS||'').split(',').map(x=>x.trim()).includes(who.id))
  throw Object.assign(Error('Acceso revocado por el administrador'),{status:403});
 let invites;try{invites=JSON.parse(process.env.FIELD_INVITES_JSON||'null');}catch{invites=null;}
 const digest=invites?.[who.id];
 if(!digest||!/^[a-f0-9]{64}$/i.test(digest)||!timeSafe(sha(invite),digest))
  throw Object.assign(Error('La invitación no es válida'),{status:403});
 const current=await getProfile(who);
 if(!current)throw Object.assign(Error('Primero debes activar tu cuenta'),{status:409});
 const p=current.profile;
 // A given invitation can reset the account at most once, even if Vercel
 // still contains its digest. The revision precondition blocks racing resets.
 if(p.usedRecoveryInvitationDigest===digest)
  throw Object.assign(Error('Esta invitación ya se utilizó para recuperar el acceso'),{status:409});
 const salt=crypto.randomBytes(24).toString('hex');
 const hash=crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');
 const next={...p,password:{scheme:'scrypt-n16384',salt,hash},enabled:true,
  generation:crypto.randomUUID(),failed:0,lockUntil:0,
  usedRecoveryInvitationDigest:digest,passwordRecoveredAt:new Date().toISOString()};
 try{await store.upload(who.project,userPath(who),Buffer.from(JSON.stringify(next)),current.rev);}
 catch(e){
  if(e.status===409){
   // Conflict is not proof of a concurrent edit. Distinguish a changed revision
   // from a malformed path or another upstream write failure.
   const upstream=String(e.detail||'');
   const currentAgain=await getProfile(who);
   if(currentAgain&&currentAgain.rev!==current.rev)
    throw Object.assign(Error('Otra operación cambió la cuenta. Actualiza la página'),{status:409});
   console.error('field recover: Dropbox write rejected; category '+
    (upstream.includes('malformed_path')?'malformed_path':
     upstream.includes('conflict')?'conflict':
     upstream.includes('not_found')?'not_found':'other'));
   throw Object.assign(Error('Dropbox rechazó guardar el perfil. El administrador debe revisar el registro del servidor'),{status:503});
  }
  throw e;
 }
 const token=sign({sub:who.id,project:who.project,gen:next.generation,exp:Math.floor(Date.now()/1000)+MAX_AGE});
 setCookie(res,token);
 return {active:true,name:who.name,project:who.project};
}
function logout(res){setCookie(res,'',0);return {active:false};}
module.exports={COOKIE,PEOPLE,person,checkOrigin,activate,login,recoverJose,logout,assertSession};
