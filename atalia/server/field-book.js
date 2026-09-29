'use strict';
/* OOXML: modify only the register sheet, audit column and Excel calculation mode.
   Other sheets, styles, formulas, relationships and photos are preserved byte-for-byte in the ZIP. */
const {unzipSync,zipSync}=require('fflate');
const {DOMParser,XMLSerializer}=require('@xmldom/xmldom');
const M='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const textDecoder=new TextDecoder(),textEncoder=new TextEncoder();
function err(message,status=422){throw Object.assign(Error(message),{status});}
const lower=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
function children(parent,name){return Array.from(parent?.childNodes||[]).filter(x=>x.nodeType===1&&(!name||x.localName===name));}
function descendants(parent,name){return Array.from(parent?.getElementsByTagNameNS?.(M,name)||[]);}
function xml(buf){const p=new DOMParser();
 const doc=p.parseFromString(textDecoder.decode(buf),'application/xml');
 if(doc.getElementsByTagName('parsererror').length)err('XML del Libro Maestro inválido');
 return doc;}
function unzip(buf){try{return unzipSync(new Uint8Array(buf));}catch{err('El Libro Maestro no es un XLSX válido');}}
function file(z,name){if(!z[name])err('Falta componente XLSX: '+name);return xml(z[name]);}
function save(z,name,doc){z[name]=textEncoder.encode(new XMLSerializer().serializeToString(doc));}
function sheetsFrom(z){
 const book=file(z,'xl/workbook.xml'),rels=file(z,'xl/_rels/workbook.xml.rels');
 const map={};for(const r of children(rels.documentElement,'Relationship'))map[r.getAttribute('Id')]=r.getAttribute('Target');
 const out={};
 for(const sh of descendants(book,'sheet')){
  const target=map[sh.getAttributeNS(R,'id')];if(!target)continue;
  const path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
  if(z[path])out[lower(sh.getAttribute('name'))]={path,doc:file(z,path)};
 }
 return {out,book};
}
function strings(z){
 if(!z['xl/sharedStrings.xml'])return [];
 const doc=file(z,'xl/sharedStrings.xml');
 return descendants(doc,'si').map(node=>descendants(node,'t').map(t=>t.textContent||'').join(''));
}
function col(ref){const m=/^[A-Z]+/i.exec(ref||'');if(!m)return 0;return Array.from(m[0].toUpperCase()).reduce((n,x)=>n*26+x.charCodeAt(0)-64,0);}
function colName(n){let s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
function rowMap(row,shared){
 const out=new Map();
 for(const c of children(row,'c')){
  let v=children(c,'v')[0]?.textContent||'',is=children(c,'is')[0];
  if(c.getAttribute('t')==='s')v=shared[Number(v)]??'';
  else if(c.getAttribute('t')==='inlineStr')v=descendants(is,'t').map(t=>t.textContent||'').join('');
  out.set(col(c.getAttribute('r')),v);
 }
 return out;
}
function dataRows(doc,shared,headNo){
 return descendants(doc,'row').filter(row=>Number(row.getAttribute('r'))>headNo).map(row=>({no:Number(row.getAttribute('r')),row,values:rowMap(row,shared)}));
}
function findSheet(sheets,name){const sh=sheets[lower(name)];if(!sh)err('Falta la hoja '+name);return sh.doc;}
function cellsAsRecord(row,head){const o={};for(const [name,colNo] of Object.entries(head))o[name]=row.values.get(colNo)||'';return o;}
function header(doc,shared,required){
 for(const row of descendants(doc,'row')){
  const vals=rowMap(row,shared),all=[...vals.entries()],map={};
  all.forEach(([colNo,value])=>{if(value)map[lower(value)]=colNo;});
  if(required.every(s=>map[lower(s)]))return {no:Number(row.getAttribute('r')),map,row};
 }
 err('Cabecera del Libro Maestro no reconocida');
}
function dateISO(v){
 if(!v)return '';
 const serial=Number(v);
 if(Number.isFinite(serial)&&serial>1000)return new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000).toISOString().slice(0,10);
 return /^\d{4}-\d\d-\d\d/.test(String(v))?String(v).slice(0,10):'';
}
function dateSerial(s){return Math.round((Date.parse(s+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000);}
function books(z){
 const {out,book}=sheetsFrom(z),ss=strings(z);
 return {z,sheets:out,book,ss};
}
function ataliaInfo(b){
 const v={};const sum=findSheet(b.sheets,'Resumen');
 const head=header(sum,b.ss,['Villa','Tipo']);
 for(const row of dataRows(sum,b.ss,head.no)){
  const r=cellsAsRecord(row,head.map),n=Number(r.villa),type=String(r.tipo||'').trim();
  if(((n>=7&&n<=24)||(n>=107&&n<=140))&&/^[BC]$/.test(type))v[n]=type;
 }
 if(Object.keys(v).length!==52)err('Atalía: estructura de 52 villas no verificada');
 const cat=findSheet(b.sheets,'Catálogos'),h=header(cat,b.ss,['ACTIVIDADES','PORCENTAJE ACTIVIDAD','SUBACTIVIDAD']);
 const activities={},subWeights={},subs={};
 for(const row of dataRows(cat,b.ss,h.no)){
  const vals=row.values,a=String(vals.get(5)||'').trim(),w=Number(vals.get(6)||0),
   ra=String(vals.get(17)||'').trim(),s=String(vals.get(18)||'').trim(),
   kind=String(vals.get(16)||'').trim().toUpperCase(),sw=Number(vals.get(19)||0);
  if(a&&Number.isFinite(w)&&['PLATEA','NIVEL 1','NIVEL 2','ESCALERAS','ANTEPECHOS','ACABADOS','CONEXIONES EXTERNAS'].includes(a))activities[a]=w;
  if(ra&&s&&kind!=='HISTÓRICO'&&!(ra==='CONEXIONES EXTERNAS'&&s==='Sanitaria')&&
    ['PLATEA','NIVEL 1','NIVEL 2','ESCALERAS','ANTEPECHOS','ACABADOS','CONEXIONES EXTERNAS'].includes(ra)){
    (subs[ra]??=[]);if(!subs[ra].includes(s))subs[ra].push(s);
    (subWeights[ra]??={})[s]=Number.isFinite(sw)?sw:0;
  }
 }
 const catalog=Object.keys(activities).map(a=>[a,a==='CONEXIONES EXTERNAS'?[...(subs[a]||[])]:['COMPLETA',...(subs[a]||[])]]);
 if(catalog.length!==7||!subs['CONEXIONES EXTERNAS']?.includes('Potable')||
    subs['CONEXIONES EXTERNAS'].includes('Sanitaria'))err('Atalía: hace falta cargar la Base Maestra V34 aprobada');
 const sh=findSheet(b.sheets,'Registro de Obra');
 const rh=header(sh,b.ss,['ID Registro','Villa','Tipo de Villa','Actividad General','Subactividad','Estado','Observaciones']);
 const history=new Map(),all=dataRows(sh,b.ss,rh.no);
 const ids=new Set(),max={id:0,no:rh.no};
 for(const row of all){
  const r=cellsAsRecord(row,rh.map),id=Number(r['id registro']),n=Number(r.villa),a=String(r['actividad general']||'').trim(),s=String(r.subactividad||'').trim();
  if(!Number.isInteger(id)||id<=0)continue;
  max.id=Math.max(id,max.id);max.no=Math.max(row.no,max.no);
  const match=String(r.observaciones||'').match(/Registro m[oó]vil\s*[·:-]\s*(ATALIA-[a-z0-9_-]+)/i);if(match)ids.add(match[1]);
  if(!v[n]||!a||!s)continue;
  const key=n+'|'+a+'|'+s,cur=history.get(key);
  if(!cur||id>=cur.id)history.set(key,{id,estado:r.estado||'',origen:r.contratista||'',contratista:r.contratista||'',
    observacion:r.observaciones||'',fechaInicio:dateISO(r['fecha inicio']),fechaFin:dateISO(r['fecha terminación'])});
 }
 return {project:'atalia',villas:v,catalog,activityWeights:activities,subWeights,history:[...history],rows:all.length,ids,max,
  sheetName:'Registro de Obra',head:rh,logRows:all};
}
function daosInfo(b){
 const v={},stageSummary={};const villaSheet=findSheet(b.sheets,'VILLAS'),vh=header(villaSheet,b.ss,['Villa','Tipo','Actividad']);
 for(const row of dataRows(villaSheet,b.ss,vh.no)){
  const r=cellsAsRecord(row,vh.map),n=Number(r.villa);if(!Number.isInteger(n)||n<1||n>49||!r.tipo)continue;
  v[n]=String(r.tipo).trim();const stages={};
  for(const a of ['Trabajos preliminares','Cimentaciones','1er Nivel','2do Nivel','Cubierta','Acabados']){
   const k=lower(a)==='trabajos preliminares'?'preliminares':lower(a);
   stages[a]=r[k]||'Sin dato';
  }
  stageSummary[n]={actividadActual:r.actividad||'',stages};
 }
 if(Object.keys(v).length!==45||[3,35,36,47].some(n=>v[n]))err('DAOS: estructura de 45 villas no verificada');
 const cats=findSheet(b.sheets,'CATALOGO'),ch=header(cats,b.ss,['Actividad','Subactividad']),groups=[];
 for(const row of dataRows(cats,b.ss,ch.no)){
  const r=cellsAsRecord(row,ch.map),a=String(r.actividad||'').trim(),s=String(r.subactividad||'').trim();
  if(!a||!s)continue;let g=groups.find(x=>x[0]===a);if(!g){g=[a,[]];groups.push(g);}if(!g[1].includes(s))g[1].push(s);
 }
 if(groups.length!==7||groups.reduce((n,g)=>n+g[1].length,0)!==33)err('DAOS: el catálogo no coincide con V07');
 const log=findSheet(b.sheets,'LIBRO DE OBRA'),lh=header(log,b.ss,['ID','Tipo','Villa','Actividad','Subactividad','Estado','Referencia','Origen','Vigente']);
 const history=new Map(),rows=dataRows(log,b.ss,lh.no),ids=new Set(),max={id:0,no:lh.no};
 for(const row of rows){
  const r=cellsAsRecord(row,lh.map),id=Number(r.id),n=Number(r.villa),a=String(r.actividad||'').trim(),s=String(r.subactividad||'').trim();
  if(!Number.isInteger(id)||id<=0)continue;max.id=Math.max(id,max.id);max.no=Math.max(row.no,max.no);
  const marker=String(r.referencia||'').match(/Registro m[oó]vil\s*[·:-]\s*([a-z0-9_-]+)/i);if(marker)ids.add(marker[1]);
  if(!v[n]||!a||!s||a==='Sin iniciar'||!groups.some(g=>g[0]===a&&g[1].includes(s)))continue;
  if(r.vigente==='0')continue;
  const key=n+'|'+a+'|'+s,cur=history.get(key);
  if(!cur||id>=cur.id)history.set(key,{id,estado:r.estado||'',origen:r.origen||'',observacion:r['observacion']||r['observación']||'',
     referencia:r.referencia||'',fechaInicio:dateISO(r['fecha inicio']),fechaFin:dateISO(r['fecha terminación'])});
 }
 return {project:'daos',villas:v,catalog:groups,history:[...history],rows:rows.length,
  stageSummary,pendingViews:[],hasPendingSheet:false,ids,max,sheetName:'LIBRO DE OBRA',head:lh,logRows:rows};
}
function readBook(bytes,project){
 const b=books(unzip(bytes));return {b,info:project==='atalia'?ataliaInfo(b):project==='daos'?daosInfo(b):err('Proyecto inválido',403)};
}
function publicReference(info,filename){
 const fields=['villas','catalog','history','rows'];
 if(info.project==='atalia')fields.push('activityWeights','subWeights','pendingViews');
 else fields.push('stageSummary','pendingViews','hasPendingSheet');
 const out={filename,loaded:new Date().toISOString()};
 for(const field of fields)out[field]=info[field]??(field==='pendingViews'?[]:null);
 return out;
}
function validated(record,info){
 const r=record||{},n=Number(r.villa),a=String(r.actividad||''),s=String(r.subactividad||''),
     state=String(r.estado||''),start=String(r.fechaInicio||''),end=String(r.fechaFin||'');
 if(!info.villas[n]||info.villas[n]!==r.tipo||!info.catalog.some(g=>g[0]===a&&g[1].includes(s)))
  err('Villa, tipo o partida no coincide con el Libro Maestro vigente');
 const completed=info.project==='atalia'?['Completada','En ejecución']:['Realizado','En ejecución'];
 if(!completed.includes(state)||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isFinite(Date.parse(start+'T00:00:00Z'))||
     (end&&(!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start)))err('Fecha o estado inválidos');
 if(info.project==='atalia'&&s==='COMPLETA'&&state!=='Completada')err('COMPLETA requiere estado Completada');
 if(info.project==='atalia'&&a==='CONEXIONES EXTERNAS'&&s!=='Potable')err('Solo potable está habilitada');
 if(String(r.observacion||'').length>1200)err('Observación demasiado larga');
 const map=new Map(info.history),key=n+'|'+a+'|'+s,prior=map.get(key),done=String(prior?.estado||'');
 if(info.project==='atalia'){
  if(done==='Completada')err('Trabajo ya completado. No se registrará de nuevo',409);
  if(s!=='Rastreado / Regleado'&&map.get(n+'|'+a+'|COMPLETA')?.estado==='Completada')err('Actividad ya completa',409);
  const aliases={ANTEPECHOS:{'Colocación de bloques en losa de techo':['Colocación de bloques perimetrales']},
    ACABADOS:{'Resane general':['Resane'],'Fino de techo y gotero':['Fino de techo'],'Estuco interior':['Pañete con estuco'],'Estuco exterior':['Pañete con estuco']}};
  for(const legacy of aliases[a]?.[s]||[])if(map.get(n+'|'+a+'|'+legacy)?.estado==='Completada')
    err('La partida figura completada en el histórico con el nombre anterior',409);
 }else if(done==='Realizado'&&!/inferid/i.test(prior?.origen||''))err('DAOS: partida realizada y documentada',409);
 return {n,a,s,start,end,prior};
}
function setCell(doc,row,colNo,rowNo,value,style){
 const ref=colName(colNo)+rowNo;
 let c=children(row,'c').find(x=>col(x.getAttribute('r'))===colNo);
 if(!c){c=doc.createElementNS(M,'c');const next=children(row,'c').find(x=>col(x.getAttribute('r'))>colNo);if(next)row.insertBefore(c,next);else row.appendChild(c);}
 while(c.firstChild)c.removeChild(c.firstChild);
 c.setAttribute('r',ref);
 if(style!==undefined&&style!==null&&style!=='')c.setAttribute('s',style);
 if(typeof value==='number'){c.removeAttribute('t');const v=doc.createElementNS(M,'v');v.appendChild(doc.createTextNode(String(value)));c.appendChild(v);}
 else{c.setAttribute('t','inlineStr');const is=doc.createElementNS(M,'is'),t=doc.createElementNS(M,'t');t.appendChild(doc.createTextNode(String(value??'')));is.appendChild(t);c.appendChild(is);}
}
function write(bytes,project,record,who){
 const {b,info}=readBook(bytes,project);
 const r=record;const marker=project==='atalia'?'ATALIA-':'DAOS-';
 if(typeof r?.id!=='string'||!r.id.startsWith(marker)||r.id.length>100||!/^[a-zA-Z0-9_-]+$/.test(r.id))err('Identificador de registro inválido');
 if(info.ids.has(r.id))return {bytes:Buffer.from(bytes),added:false,duplicate:true,id:r.id};
 const fields=validated(r,info);
 const {doc,path}=b.sheets[lower(info.sheetName)],all=descendants(doc,'row'),data=descendants(doc,'sheetData')[0];
 const no=info.max.no+1,id=info.max.id+1,existing=all.find(x=>Number(x.getAttribute('r'))===no);
 const row=existing||doc.createElementNS(M,'row');if(!existing){row.setAttribute('r',String(no));const next=all.find(x=>Number(x.getAttribute('r'))>no);if(next)data.insertBefore(row,next);else data.appendChild(row);}
 const styleRef=all.find(x=>Number(x.getAttribute('r'))===info.max.no);
 function style(colNo){return children(row,'c').find(c=>col(c.getAttribute('r'))===colNo)?.getAttribute('s')??
   children(styleRef,'c').find(c=>col(c.getAttribute('r'))===colNo)?.getAttribute('s')??null;}
 function put(c,v){setCell(doc,row,c,no,v,style(c));}
 const h=info.head.map;
 const safeObs=String(r.observacion||'').trim();
 const observation=(safeObs?safeObs+' | ':'')+'Registrado por: '+who.name;
 const auditCol=project==='atalia'?14:15;
 // This is a new right-hand column: it does not displace any pre-existing formula.
 const headCell=children(info.head.row,'c').find(c=>col(c.getAttribute('r'))===auditCol);
 if(headCell&&rowMap(info.head.row,b.ss).get(auditCol)&&lower(rowMap(info.head.row,b.ss).get(auditCol))!=='registrado por')
   err('No se puede crear la columna de auditoría: existe otra cabecera');
 setCell(doc,info.head.row,auditCol,info.head.no,'Registrado por',style(auditCol));
 if(project==='atalia'){
  const aw=info.activityWeights[fields.a],sw=fields.s==='COMPLETA'?aw:Number(info.subWeights[fields.a]?.[fields.s]??0);
  const vals={'id registro':id,villa:fields.n,'tipo de villa':r.tipo,'actividad general':fields.a,subactividad:fields.s,
    contratista:'ECM','fecha inicio':dateSerial(fields.start),'fecha terminación':fields.end?dateSerial(fields.end):'',
    estado:r.estado,'porcentaje actividad':aw,'porcentaje subactividad':sw,
    'avance registro':r.estado==='Completada'?sw:0,observaciones:'Registro móvil · '+r.id+' | '+observation};
  for(const [key,val] of Object.entries(vals))if(h[key])put(h[key],val);
 }else{
  const vals={id,tipo:r.tipo,villa:fields.n,actividad:fields.a,subactividad:fields.s,
    estado:r.estado,'fecha inicio':dateSerial(fields.start),'fecha terminación':fields.end?dateSerial(fields.end):'',
    antes:fields.prior?.estado||'',observación:observation,origen:'Registro móvil',
    referencia:'Registro móvil · '+r.id,clave:fields.n+'|'+fields.a+'|'+fields.s,vigente:1};
  for(const [key,val] of Object.entries(vals)){
   const c=h[lower(key)];if(!c)continue;
   const node=children(row,'c').find(x=>col(x.getAttribute('r'))===c);
   if(node&&children(node,'f').length&&['vigente','origen','antes','clave'].includes(lower(key)))continue;
   put(c,val);
  }
 }
 put(auditCol,who.name);
 const dimension=descendants(doc,'dimension')[0],old=dimension?.getAttribute('ref');
 if(old){const m=/^([A-Z]+\d+:)?([A-Z]+)(\d+)$/.exec(old);if(m&&Number(m[3])<no)dimension.setAttribute('ref',(m[1]||'')+m[2]+no);}
 save(b.z,path,doc);
 for(const [name,compressed] of Object.entries(b.z)){
  if(!/^xl\/tables\/table\d+\.xml$/i.test(name))continue;
  const tx=xml(compressed),table=descendants(tx,'table')[0],ref=table?.getAttribute('ref')||'';
  const m=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref);
  if(m&&Number(m[2])===info.head.no&&Number(m[4])<no){
   table.setAttribute('ref',m[1]+m[2]+':'+m[3]+no);for(const af of descendants(tx,'autoFilter'))af.setAttribute('ref',m[1]+m[2]+':'+m[3]+no);
   save(b.z,name,tx);
  }
 }
 const calc=descendants(b.book,'calcPr')[0]||b.book.createElementNS(M,'calcPr');
 calc.setAttribute('calcMode','auto');calc.setAttribute('fullCalcOnLoad','1');calc.setAttribute('forceFullCalc','1');
 if(!calc.parentNode)b.book.documentElement.appendChild(calc);
 save(b.z,'xl/workbook.xml',b.book);
 const output=Buffer.from(zipSync(b.z,{level:1}));
 // Integrity check: content must open again and the new record must be visible.
 const next=readBook(output,project);
 if(!next.info.ids.has(r.id)||next.info.max.id<id)err('El Excel no superó la verificación posterior');
 return {bytes:output,added:true,duplicate:false,id,row:no};
}
module.exports={readBook,publicReference,validated,write};
