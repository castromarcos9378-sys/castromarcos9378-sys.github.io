'use strict';
const {lookupDevice,tokenFromRequest,setNoStore,checkOrigin,deny,parseDevices} = require('../server/device-auth');
module.exports = function delegatedStatus(req,res) {
  setNoStore(res);
  if(!checkOrigin(req)) return deny(res,403,'Origen no autorizado');
  if(req.method!=='GET') return deny(res,405,'Método no permitido');
  if(!parseDevices()) return deny(res,503,'Acceso delegado todavía no configurado');
  const device=lookupDevice(tokenFromRequest(req));
  if(!device) return deny(res,401,'Dispositivo no autorizado o revocado');
  return res.status(200).json({
    active:true, device:device.id, project:device.project, 
    syncReady:false,
    message:'iPhone identificado. La sincronización delegada está pendiente de habilitación.'
  });
};
