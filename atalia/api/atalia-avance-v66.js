// Atalía V6.6 — SOLO LECTURA. Endpoint privado, sin cambios al Libro Maestro.
const ExcelJS=require('exceljs');
const FILE='id:en9YUE7n3L8AAAAAAAACZQ';
const WEIGHTS=Object.freeze({'PLATEA':18,'NIVEL 1':25,'NIVEL 2':25,'ESCALERAS':4,'ANTEPECHOS':3,'ACABADOS':20});
const cellText=c=>{const v=c.value;return String(v&&typeof v==='object'&&'result' in v?v.result??'':c.text??'').trim()};
const number=v=>{const n=Number(String(v??'').replace('%','').replace(',','.'));return Number.isFinite(n)?n:0};
async function getWorkbook(){
let access_token = process.env.ATALIA_V66_TEST_ACCESS_TOKEN;

if (!access_token) {
  const {
    FIELD_ATALIA_APP_KEY: key,
    FIELD_ATALIA_APP_SECRET: secret,
    FIELD_ATALIA_REFRESH_TOKEN: refresh
  } = process.env;

  if (!key || !secret || !refresh) {
    throw new Error('CREDENTIALS_MISSING');
  }

  const token = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: key,
      client_secret: secret
    })
  });

  if (!token.ok) {
    throw new Error('DROPBOX_AUTH_' + token.status);
  }

  ({ access_token } = await token.json());
}
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
 if(!header)header=0;
 sheet.eachRow((r,index)=>{
  if(index<=header)return;
  const id=cellText(r.getCell(1)),villa=cellText(r.getCell(2)),tipo=cellText(r.getCell(3)),act=cellText(r.getCell(4)).toUpperCase(),sub=cellText(r.getCell(5)),contr=cellText(r.getCell(6)).toUpperCase();
  if(!/^\d+$/.test(id)||!/^\d+$/.test(villa)||!['B','C'].includes(tipo)||!(act in WEIGHTS))return;
  if(ids.has(id))return;ids.add(id);allVillas.add(villa);
  const w=WEIGHTS[act]/100,raw=r.getCell(12).value,cached=raw&&typeof raw==='object'?'result' in raw?raw.result:null:raw,progress=typeof cached==='number'?cached:number(r.getCell(12).text)/100;
  const key=villa+'|'+act;const slot=items.get(key)||{villa,actividad:act,cap:w,general:0,ecm:0};
  slot.general+=progress;if(contr==='ECM')slot.ecm+=progress;items.set(key,slot);
  if(!byVilla.has(villa))byVilla.set(villa,[]);
  byVilla.get(villa).push({id,actividad:act,subactividad:sub,contratista:contr,porcentaje:progress,estado:cellText(r.getCell(9))});
 });
 const byTotal=new Map(),byEcm=new Map();
 for(const x of items.values()){byTotal.set(x.villa,(byTotal.get(x.villa)||0)+x.general);byEcm.set(x.villa,(byEcm.get(x.villa)||0)+x.ecm);}
 const total=[...byTotal.values()].reduce((sum,v)=>sum+Math.min(1,v),0);
 const ecm=[...byEcm.values()].reduce((sum,v)=>sum+Math.min(1,v),0);
 if(!byVilla.has('117'))throw new Error('VILLA_117_NOT_FOUND');
 return {universe:52,recordedVillas:allVillas.size,rows:ids.size,weightsSum:95,general:Number((total/52*100).toFixed(2)),ecm:Number((ecm/52*100).toFixed(2)),villa117:byVilla.get('117')};
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('Access-Control-Allow-Origin','*');
 res.setHeader('Access-Control-Allow-Headers','Authorization, Accept, Content-Type');
 res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
 // Never expose operational metrics or workbook data without explicit authorization.
 const access=process.env.ATALIA_AVANCE_READ_TOKEN;
 if(!access||req.headers.authorization!=='Bearer '+access)return res.status(401).json({ok:false,error:'UNAUTHORIZED'});
 try{const wb=await getWorkbook();const sheet=wb.getWorksheet('Registro de Obra');if(!sheet)throw new Error('REGISTRO_MISSING');
 return res.status(200).json({ok:true,updatedAt:new Date().toISOString(),source:'Dropbox Libro Maestro',...compute(sheet)});
 }catch(e){console.error('atalia-avance-v66',String(e.message));return res.status(503).json({ok:false,error:'UPSTREAM_UNAVAILABLE'});}
};
