'use strict';
// Atalia V6.6: public numeric progress ONLY; never returns the workbook or Dropbox credentials.
const {unzipSync,strFromU8}=require('fflate');
const {DOMParser}=require('@xmldom/xmldom');
const dbx=require('../server/field-dropbox');
let cache=null,cacheTime=0;
function xml(content){return new DOMParser({onError() {}}).parseFromString(strFromU8(content),'application/xml')}
function all(n,tag){return Array.from(n.getElementsByTagName(tag))}
function val(c,shared){if(!c)return null;const t=c.getAttribute('t'),raw=c.getElementsByTagName('v')[0]?.textContent??'';
 if(t==='s')return shared[Number(raw)]||'';
 if(t==='inlineStr')return c.getElementsByTagName('is')[0]?.textContent||'';
 return raw===''?null:(Number.isFinite(Number(raw))?Number(raw):raw);
}
function sheetRows(doc,shared){
 const out=[];for(const r of all(doc,'row')){const cells={};
 for(const c of all(r,'c')){const col=(c.getAttribute('r')||'').match(/^[A-Z]+/)?.[0];if(col)cells[col]=val(c,shared)}
 out.push(cells)}return out;
}
function progress(buffer){
 const parts=unzipSync(new Uint8Array(buffer));
 const shared=parts['xl/sharedStrings.xml']?all(xml(parts['xl/sharedStrings.xml']),'si').map(n=>n.textContent||''):[];
 const registry=sheetRows(xml(parts['xl/worksheets/sheet1.xml']),shared);
 const summary=sheetRows(xml(parts['xl/worksheets/sheet3.xml']),shared);
 if(registry[0]?.A!=='ID Registro'||summary[2]?.A!=='Villa')throw Error('WORKBOOK_SCHEMA');
 const villas=summary.slice(3,55).map(r=>Number(r.A));
 if(villas.length!==52||villas.some(v=>!Number.isInteger(v)))throw Error('VILLA_UNIVERSE');
 const byVilla=new Map(villas.map(v=>[v,{total:0,ecm:0,old:0}]));
 const recordIds=new Set();
 for(const r of registry.slice(1)){
  const villa=Number(r.B),fraction=Number(r.L);
  if(!byVilla.has(villa)||!Number.isFinite(fraction)||fraction<0||fraction>1)continue;
  if(!Number.isInteger(Number(r.A)))continue;
  const v=byVilla.get(villa);v.total+=fraction;
  if(String(r.F).trim().toUpperCase()==='ECM')v.ecm+=fraction;
  if(String(r.F).trim().toUpperCase()==='CONTRATISTA ANTERIOR')v.old+=fraction;
  recordIds.add(Number(r.A));
 }
 if(!recordIds.has(240)||!recordIds.has(290))throw Error('REQUIRED_RECORDS_MISSING');
 const cap=n=>Math.max(0,Math.min(1,n));
 const pct=n=>Math.round(n*10000)/100;
 const total=pct(villas.reduce((s,v)=>s+cap(byVilla.get(v).total),0)/52);
 const ecm=pct(villas.reduce((s,v)=>s+cap(byVilla.get(v).ecm),0)/52);
 const result={ok:true,universe:52,source:'Libro Maestro Dropbox',general:total,ecm,
  rows:recordIds.size,updatedAt:new Date().toISOString(),
  villas:Object.fromEntries(villas.map(v=>[v,{general:pct(cap(byVilla.get(v).total)),ecm:pct(cap(byVilla.get(v).ecm))}]))};
 if(result.villas['117'].general<79)throw Error('VILLA_117_INCOMPLETE');
 return result;
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','public, max-age=30');
 res.setHeader('Access-Control-Allow-Origin','*');
 res.setHeader('Access-Control-Allow-Headers','Accept, Content-Type');
 res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'METHOD'});
 try{
  if(cache&&Date.now()-cacheTime<30000)return res.status(200).json(cache);
  const buffer=await dbx.download('atalia',dbx.projectConfig('atalia').book);
  const payload=progress(buffer);cache=payload;cacheTime=Date.now();
  return res.status(200).json(payload);
 }catch(e){console.error('atalia-progress-reader',String(e.message));return res.status(503).json({ok:false,error:'SOURCE_NOT_READY'})}
};
