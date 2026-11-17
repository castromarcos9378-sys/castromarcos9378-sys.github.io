'use strict';
// API de lectura numérica: no entrega filas, identidades, fechas, precios ni archivos XLSX.
const {unzipSync,strFromU8}=require('fflate');
const {DOMParser}=require('@xmldom/xmldom');
const dbx=require('../server/field-dropbox');
const WEIGHTS={'PLATEA':18,'NIVEL 1':25,'NIVEL 2':25,'ESCALERAS':4,'ANTEPECHOS':3,'ACABADOS':20};
const STAGES=Object.keys(WEIGHTS);
let cache=null,cacheTime=0;
function xml(bytes){return new DOMParser({onError(){}}).parseFromString(strFromU8(bytes),'application/xml')}
function nodes(el,tag){return Array.from(el.getElementsByTagName(tag))}
function val(c,strings){if(!c)return null;const t=c.getAttribute('t'),raw=c.getElementsByTagName('v')[0]?.textContent??'';
 if(t==='s')return strings[Number(raw)]||'';
 if(t==='inlineStr')return c.getElementsByTagName('is')[0]?.textContent||'';
 return raw===''?null:(Number.isFinite(Number(raw))?Number(raw):raw)}
function rows(doc,strings){return nodes(doc,'row').map(r=>{const cells={};for(const c of nodes(r,'c')){
 const col=(c.getAttribute('r')||'').match(/^[A-Z]+/)?.[0];if(col)cells[col]=val(c,strings)}return cells})}
const pct=n=>Math.round(n*100)/100;
const cap=(n,max)=>Math.max(0,Math.min(max,n));
function calculate(buffer){
 const chunks=unzipSync(new Uint8Array(buffer));
 const strings=chunks['xl/sharedStrings.xml']?nodes(xml(chunks['xl/sharedStrings.xml']),'si').map(n=>n.textContent||''):[];
 const reg=rows(xml(chunks['xl/worksheets/sheet1.xml']),strings);
 const summ=rows(xml(chunks['xl/worksheets/sheet3.xml']),strings);
 if(reg[0]?.A!=='ID Registro'||summ[2]?.A!=='Villa')throw Error('WORKBOOK_SCHEMA');
 const entries=summ.slice(3,55).map(r=>({id:String(r.A),type:String(r.B||'').trim().toUpperCase()}));
 if(entries.length!==52||new Set(entries.map(x=>x.id)).size!==52||entries.some(x=>!/^\d+$/.test(x.id)||!['B','C'].includes(x.type)))throw Error('VILLA_UNIVERSE');
 const agg=new Map(entries.map(e=>[e.id,{type:e.type,total:0,ecm:0,prior:0,stages:Object.fromEntries(STAGES.map(s=>[s,{ecm:0,prior:0}]))}]));
 const ids=new Set();
 for(const r of reg.slice(1)){
  const id=Number(r.A),v=String(r.B),a=String(r.D||'').trim().toUpperCase(),owner=String(r.F||'').trim().toUpperCase(),raw=Number(r.L);
  if(!agg.has(v)||!Number.isInteger(id)||id<=0)continue;
  ids.add(id);
  if(!Number.isFinite(raw)||raw<0||raw>1)continue;
  const t=agg.get(v);t.total+=raw;
  if(owner==='ECM')t.ecm+=raw;
  if(owner==='CONTRATISTA ANTERIOR')t.prior+=raw;
  if(t.stages[a]){
   if(owner==='ECM')t.stages[a].ecm+=raw*100;
   if(owner==='CONTRATISTA ANTERIOR')t.stages[a].prior+=raw*100;
  }
 }
 if(!ids.has(240)||!ids.has(290)||ids.size<300)throw Error('RECORD_VALIDATION');
 const villaValues={}, typeStats={B:{villas:0,progressSum:0},C:{villas:0,progressSum:0}};
 let total=0,ecm=0,doneScope=0,totalScope=0;
 for(const [id,r] of agg){
  const general=cap(r.total,1),own=cap(r.ecm,1);
  const stages={};
  for(const [a,weight] of Object.entries(WEIGHTS)){
   const prior=cap(r.stages[a].prior,weight),ecmVal=cap(r.stages[a].ecm,weight);
   const combined=cap(prior+ecmVal,weight);
   stages[a]={weight,completed:pct(combined),ecm:pct(ecmVal),historical:pct(prior)};
   const remaining=weight-prior;
   if(remaining>1e-6){totalScope+=remaining;doneScope+=cap(r.stages[a].ecm,remaining)}
  }
  villaValues[id]={type:r.type,general:pct(general*100),ecm:pct(own*100),stages};
  total+=general;ecm+=own;typeStats[r.type].villas++;typeStats[r.type].progressSum+=general*100;
 }
 if(villaValues['117'].general<79)throw Error('VILLA_117_INCOMPLETE');
 const typeCounts=Object.fromEntries(Object.entries(typeStats).map(([type,x])=>[type,{count:x.villas,general:pct(x.progressSum/x.villas)}]));
 if(typeCounts.B.count!==20||typeCounts.C.count!==32)throw Error('VILLA_TYPES_UNEXPECTED');
 return {ok:true,source:'Libro Maestro Dropbox',universe:52,general:pct(total/52*100),ecm:pct(ecm/52*100),ecmScope:pct(doneScope/totalScope*100),types:typeCounts,rows:ids.size,queriedAt:new Date().toISOString(),villas:villaValues};
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
  const bytes=await dbx.download('atalia',dbx.projectConfig('atalia').book);
  const data=calculate(bytes);cache=data;cacheTime=Date.now();
  return res.status(200).json(data);
 }catch(e){console.error('atalia-control-progress',String(e.message));return res.status(503).json({ok:false,error:'SOURCE_NOT_READY'})}
};