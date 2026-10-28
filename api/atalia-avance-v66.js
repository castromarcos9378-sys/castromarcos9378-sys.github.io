// Atalía V6.6 — SOLO LECTURA. Endpoint privado, sin cambios al Libro Maestro.
const ExcelJS=require('exceljs');
const FILE='/Atalía Villa/atalia_villas_base_maestra_cubicaciones_v34_ajustada.xlsx';
const WEIGHTS=Object.freeze({'PLATEA':18,'NIVEL 1':25,'NIVEL 2':25,'ESCALERAS':4,'ANTEPECHOS':3,'ACABADOS':20});
const number=v=>{const n=Number(String(v??'').replace('%','').replace(',','.'));return Number.isFinite(n)?n:0};
async function getWorkbook(){
 const {FIELD_ATALIA_APP_KEY:key,FIELD_ATALIA_APP_SECRET:secret,FIELD_ATALIA_REFRESH_TOKEN:refresh}=process.env;
 if(!key||!secret||!refresh)throw new Error('CREDENTIALS_MISSING');
 const token=await fetch('https://api.dropboxapi.com/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh,client_id:key,client_secret:secret})});
 if(!token.ok)throw new Error('DROPBOX_AUTH_'+token.status);
 const {access_token}=await token.json();
 const response=await fetch('https://content.dropboxapi.com/2/files/download',{method:'POST',headers:{Authorization:'Bearer '+access_token,'Dropbox-API-Arg':JSON.stringify({path:FILE})}});
 if(!response.ok)throw new Error('DROPBOX_FILE_'+response.status);
 const book=new ExcelJS.Workbook();
 await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
 return book;
}
function compute(sheet){
 const items=new Map(),ids=new Set(),byVilla=new Map(),allVillas=new Set();
 let header=0;
 sheet.eachRow((r,index)=>{if(r.getCell(1).text.trim()==='ID Registro'&&r.getCell(2).text.trim()==='Villa')header=index});
 if(!header)throw new Error('HEADERS_MISSING');
 sheet.eachRow((r,index)=>{
  if(index<=header)return;
  const id=r.getCell(1).text.trim(),villa=r.getCell(2).text.trim(),tipo=r.getCell(3).text.trim(),act=r.getCell(4).text.trim().toUpperCase(),sub=r.getCell(5).text.trim(),contr=r.getCell(6).text.trim().toUpperCase();
  if(!/^\d+$/.test(id)||!/^\d+$/.test(villa)||!['B','C'].includes(tipo)||!(act in WEIGHTS))return;
  if(ids.has(id))return;ids.add(id);allVillas.add(villa);
  const w=WEIGHTS[act],raw=r.getCell(12).value,progress=typeof raw==='number'&&raw<=1?raw*100:number(r.getCell(12).text);
  const key=villa+'|'+act;const slot=items.get(key)||{villa,actividad:act,cap:w,general:0,ecm:0};
  slot.general+=progress;if(contr==='ECM')slot.ecm+=progress;items.set(key,slot);
  if(!byVilla.has(villa))byVilla.set(villa,[]);
  byVilla.get(villa).push({id,actividad:act,subactividad:sub,contratista:contr,porcentaje:progress,estado:r.getCell(9).text.trim()});
 });
 let total=0,ecm=0;
 for(const x of items.values()){total+=Math.min(x.general,x.cap);ecm+=Math.min(x.ecm,x.cap);}
 if(!byVilla.has('117'))throw new Error('VILLA_117_NOT_FOUND');
 return {universe:52,recordedVillas:allVillas.size,rows:ids.size,weightsSum:95,general:Number((total/52).toFixed(2)),ecm:Number((ecm/52).toFixed(2)),villa117:byVilla.get('117')};
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
 // Never expose operational metrics or workbook data without explicit authorization.
 const access=process.env.ATALIA_AVANCE_READ_TOKEN;
 if(!access||req.headers.authorization!=='Bearer '+access)return res.status(401).json({ok:false,error:'UNAUTHORIZED'});
 try{const wb=await getWorkbook();const sheet=wb.getWorksheet('Registro de Obra');if(!sheet)throw new Error('REGISTRO_MISSING');
 return res.status(200).json({ok:true,updatedAt:new Date().toISOString(),source:'Dropbox Libro Maestro',...compute(sheet)});
 }catch(e){console.error('atalia-avance-v66',String(e.message));return res.status(503).json({ok:false,error:'UPSTREAM_UNAVAILABLE'});}
};
