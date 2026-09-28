'use strict';
// La activación se hace una sola vez desde la PWA de empresa; ningún token Dropbox llega al iPhone.
const {COOKIE,lookupDevice,setNoStore,checkOrigin,deny,parseDevices}=require('./_device_auth');
module.exports=function delegatedActivate(req,res){
  setNoStore(res);
  if(!checkOrigin(req))return deny(res,403,'Origen no autorizado');
  if(req.method!=='POST')return deny(res,405,'Método no permitido');
  if(!parseDevices())return deny(res,503,'Acceso delegado todavía no configurado');
  if(Number(req.headers['content-length']||0)>2048)return deny(res,413,'Solicitud demasiado grande');
  const token=String(req.body?.activationToken||'');
  const device=lookupDevice(token);
  if(!device)return deny(res,401,'Código inválido o revocado');
  // HttpOnly: el código no queda expuesto al JavaScript del teléfono tras activarse.
  res.setHeader('Set-Cookie',COOKIE+'='+token.toLowerCase()+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000');
  return res.status(200).json({active:true,project:device.project,device:device.id});
};
