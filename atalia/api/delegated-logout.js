'use strict';
const {COOKIE,setNoStore,checkOrigin,deny}=require('../server/device-auth');
module.exports=function delegatedLogout(req,res){
 setNoStore(res);
 if(!checkOrigin(req))return deny(res,403,'Origen no autorizado');
 if(req.method!=='POST')return deny(res,405,'Método no permitido');
 res.setHeader('Set-Cookie',COOKIE+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');
 return res.status(200).json({signedOut:true,note:'Cerrar sesión no revoca la autorización; el administrador debe desactivar la credencial.'});
};
