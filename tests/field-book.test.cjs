'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const book=require('../atalia/server/field-book'), auth=require('../atalia/server/field-auth');
test('El servidor y las dos aplicaciones compilan',()=>{
  for(const p of ['atalia/server/field-book.js','atalia/server/field-auth.js','atalia/server/field-dropbox.js','atalia/api/field.js']) {
    new vm.Script(fs.readFileSync(p,'utf8'),{filename:p});
  }
  assert.equal(typeof book.readBook,'function');
  assert.equal(typeof book.write,'function');
  assert.equal(auth.PEOPLE['jose-reynoso'].project,'atalia');
  assert.equal(auth.PEOPLE['andres-mora'].project,'daos');
});

const z=require('../atalia/node_modules/fflate');
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');}
function c(k,n,v){return typeof v==='number'?'<c r="'+k+n+'"><v>'+v+'</v></c>':'<c r="'+k+n+'" t="inlineStr"><is><t>'+esc(v)+'</t></is></c>';}
function row(n,items){return '<row r="'+n+'">'+Object.entries(items).map(([k,v])=>c(k,n,v)).join('')+'</row>';}
function sheet(rows){return '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+rows.join('')+'</sheetData></worksheet>';}
function zipSheets(sheets){
 const names=Object.keys(sheets),p={
 'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+names.map((name,i)=>'<sheet name="'+name+'" sheetId="'+(i+1)+'" r:id="r'+(i+1)+'"/>').join('')+'</sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+names.map((_,i)=>'<Relationship Id="r'+(i+1)+'" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'</Relationships>',
 'xl/styles.xml':'UNCHANGED'
 };
 names.forEach((name,i)=>{p['xl/worksheets/sheet'+(i+1)+'.xml']=sheets[name]});
 return Buffer.from(z.zipSync(Object.fromEntries(Object.entries(p).map(([k,v])=>[k,new TextEncoder().encode(v)]))));
}

test('Base Atalía sintética: 52 villas, 7 actividades, auditoría e idempotencia',()=>{
 const nums=[...Array.from({length:18},(_,i)=>i+7),...Array.from({length:34},(_,i)=>i+107)];
 const summary=[row(3,{A:'Villa',B:'Tipo'}),...nums.map((n,i)=>row(i+4,{A:n,B:'C'}))];
 const acts=['PLATEA','NIVEL 1','NIVEL 2','ESCALERAS','ANTEPECHOS','ACABADOS','CONEXIONES EXTERNAS'];
 const cat=[row(1,{E:'ACTIVIDADES',F:'PORCENTAJE ACTIVIDAD',Q:'ACTIVIDAD',R:'SUBACTIVIDAD',S:'PORCENTAJE'})];
 acts.forEach((a,i)=>cat.push(row(i+2,{E:a,F:i===6?0:.10,Q:a,
 R:a==='CONEXIONES EXTERNAS'?'Potable':a==='ANTEPECHOS'?'Colocación de bloques en losa de techo':'Paso inicial',S:i===6?0:.02})));
 cat.push(row(10,{Q:'ANTEPECHOS',R:'Colocación de bloques en balcón (Nivel 1)',S:.005}));
 cat.push(row(11,{Q:'ANTEPECHOS',R:'Colocación de bloques en escaleras y ventanas',S:.005}));
 const reg=[row(1,{A:'ID Registro',B:'Villa',C:'Tipo de Villa',D:'Actividad General',E:'Subactividad',F:'Contratista',G:'Fecha inicio',H:'Fecha terminación',I:'Estado',J:'Porcentaje actividad',K:'Porcentaje subactividad',L:'Avance registro',M:'Observaciones'}),
 row(2,{A:1,B:7,C:'C',D:'PLATEA',E:'COMPLETA',F:'ECM',G:46290,H:46290,I:'Completada',J:.1,K:.1,L:.1,M:'Histórico intacto'})];
 const computedSummary=sheet(summary).replace('</sheetData>','<row r="99"><c r="C99"><f>COUNTIF(&apos;Registro de Obra&apos;!$B$2:$B$999,7)</f></c></row></sheetData>');
 const original=zipSheets({'Registro de Obra':sheet(reg),'Catálogos':sheet(cat),'Resumen':computedSummary});
 const info=book.readBook(original,'atalia').info;
 assert.equal(Object.keys(info.villas).length,52);assert.equal(info.catalog.length,7);
 assert.deepEqual(info.catalog.find(g=>g[0]==='CONEXIONES EXTERNAS')[1],['Potable']);
 const record={id:'ATALIA-12345678-1234-4234-8234-123456789abc',project:'ATALIA',villa:8,tipo:'C',
 actividad:'ANTEPECHOS',subactividad:'Colocación de bloques en losa de techo',estado:'Completada',
 fechaInicio:'2026-09-28',fechaFin:'2026-09-28',observacion:'Comprobado'};
 const user={id:'jose-reynoso',name:'Ing. José Reynoso'};
 const result=book.write(original,'atalia',record,user);
 assert.equal(result.added,true);assert.equal(book.readBook(result.bytes,'atalia').info.ids.has(record.id),true);
 assert.equal(book.write(result.bytes,'atalia',record,user).duplicate,true);
 const files=z.unzipSync(new Uint8Array(result.bytes));
 assert.equal(new TextDecoder().decode(files['xl/styles.xml']),'UNCHANGED');
 assert.match(new TextDecoder().decode(files['xl/worksheets/sheet1.xml']),/Ing. José Reynoso/);
 assert.match(new TextDecoder().decode(files['xl/worksheets/sheet3.xml']),/\$B\$2:\$B\$1500/);
});

test('Libro DAOS sintético: 45 villas, Andrés, escritura confirmada sin duplicados',()=>{
 const nums=Array.from({length:49},(_,i)=>i+1).filter(n=>![3,35,36,47].includes(n));
 const villas=[row(3,{A:'Villa',B:'Tipo',C:'Actividad',D:'Preliminares',E:'Cimentaciones',F:'1er Nivel',G:'2do Nivel',H:'Cubierta',I:'Acabados'}),
 ...nums.map((n,i)=>row(i+4,{A:n,B:'Esmeralda',C:'Sin iniciar',D:'Sin dato',E:'Sin dato',F:'Sin dato',G:'Sin dato',H:'Sin dato',I:'Sin dato'}))];
 const groups=[['Trabajos preliminares',1],['Cimentaciones',6],['1er Nivel',7],['2do Nivel',6],['Cubierta',3],['Acabados',9],['Obras exteriores',1]];
 let n=4;const cat=[row(3,{A:'Orden',B:'Actividad',C:'Subactividad'})];
 groups.forEach(([a,num],i)=>{for(let x=0;x<num;x++)cat.push(row(n++,{A:i+1,B:a,C:x===0?'Limpieza y replanteo':'Partida '+i+'-'+x}));});
 const log=[row(3,{A:'ID',B:'Tipo',C:'Villa',D:'Actividad',E:'Subactividad',F:'Estado',G:'Fecha inicio',H:'Fecha terminación',I:'Antes',J:'Observación',K:'Origen',L:'Referencia',M:'Clave',N:'Vigente'}),
 row(4,{A:1,B:'Esmeralda',C:1,D:'Sin iniciar',E:'Estado del levantamiento',J:'Histórico intacto',K:'Referencia',L:'Levantamiento',N:1})];
 const original=zipSheets({'LIBRO DE OBRA':sheet(log),'VILLAS':sheet(villas),'CATALOGO':sheet(cat)});
 const info=book.readBook(original,'daos').info;
 assert.equal(Object.keys(info.villas).length,45);assert.ok([3,35,36,47].every(n=>!info.villas[n]));
 assert.equal(info.catalog.reduce((a,g)=>a+g[1].length,0),33);
 const record={id:'12345678-1234-4234-8234-123456789abc',project:'DAOS',villa:6,tipo:'Esmeralda',
 actividad:'Trabajos preliminares',subactividad:'Limpieza y replanteo',estado:'Realizado',
 fechaInicio:'2026-09-28',fechaFin:'2026-09-28',observacion:'Verificado'};
 const user={id:'andres-mora',name:'Arq. Andrés Mora'},result=book.write(original,'daos',record,user);
 assert.equal(result.added,true);assert.equal(book.readBook(result.bytes,'daos').info.ids.has(record.id),true);
 assert.equal(book.write(result.bytes,'daos',record,user).duplicate,true);
 assert.match(new TextDecoder().decode(z.unzipSync(new Uint8Array(result.bytes))['xl/worksheets/sheet1.xml']),/Arq. Andrés Mora/);
});
