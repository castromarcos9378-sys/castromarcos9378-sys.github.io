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
