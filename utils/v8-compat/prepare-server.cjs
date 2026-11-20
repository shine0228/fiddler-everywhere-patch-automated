const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const file = process.argv[2];
if (!file) throw new Error('Expected the v8 server index path');
let source = fs.readFileSync(file, 'utf8');
const pattern = /this\.webContents\.executeJavaScript\(`([\s\S]*?)`\)/;
const match = pattern.exec(source);
if (!match || !match[1].includes('Array.prototype.some')) {
  throw new Error('Expected v8 array matching injection was not found');
}
const replacement = `{
        const originalSome = Array.prototype.some;
        Array.prototype.some = function some(callback) {
          'use strict';
          const thisArg = arguments[1];
          if (typeof callback !== 'function') return originalSome.call(this, callback, thisArg);
          return originalSome.call(this, function(value, index, array) {
            if ((Array.isArray(value) || ArrayBuffer.isView(value)) && value.length >= 4 &&
                value[0] === 48 && value[1] === 89 && value[2] === 48 && value[3] === 19) {
              return true;
            }
            return callback.call(thisArg, value, index, array);
          }, thisArg);
        };
      }`;
const context = vm.createContext({ marker: {} });
vm.runInContext(replacement, context);
for (const test of [
  '[10,20].some((value,index)=>index===1)',
  '[10].some(function(){"use strict";return this===marker;},marker)',
  '[null].some(value=>value===null)',
  '(()=>{const list=[10];return list.some((value,index,array)=>array===list);})()',
  '[[48,89,48,19]].some(()=>false)',
  '(()=>{try{Array.prototype.some.call(null,()=>true);return false;}catch(e){return e instanceof TypeError;}})()',
  '(()=>{try{[10].some(null);return false;}catch(e){return e instanceof TypeError;}})()',
]) assert.strictEqual(vm.runInContext(test, context), true, test);
assert.strictEqual(vm.runInContext('[{0:48,1:89,2:48,3:19,length:4}].some(()=>false)', context), false);
source = source.replace(match[1], replacement);
fs.writeFileSync(file, source, 'utf8');
console.log('v8 callback compatibility checks passed.');
