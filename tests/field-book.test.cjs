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
