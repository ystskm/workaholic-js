/***/
var nodeunit = require('foonyah-ci');
var fs = require('fs'), jsdom = require('jsdom'), JSDOM = jsdom.JSDOM;
process.env.NODE_ENV = 'production';

var Workers = require('.');
var testee, main = [];
module.exports = nodeunit.testCase({
  'methods': function(t) {

    var box;
    return Promise.resolve().then(()=>new Promise(rsl=>{
      if(!isFunction(jsdom.env)) {
        
        // for v11
        t.ok(TRUE, '# NOTE # No jsdom.env style(' + process.version + ')');
        box = new JSDOM('<html><body></body></html>', { });
        rsl(NULL, box.window);
        
      } else {
        
        // previous
        t.ok(TRUE, '# NOTE # Has jsdom.env style(' + process.version + ')');
        jsdom.env('<html><body></body></html>', rsl);
        
      }
    })).then(()=>{
      t.done();
    });

  },
  'finalize': function(t) {

    // exit after 1 sec from the end.
    Promise.all(main).then(function() {
      setTimeout(t.done, 1000);
    });

  }
}, 'basic.js');

function funcs() {
  return ['pathToLocal', 'getProvider', 'ls', 'rm', 'stat', 'require',
    'requirexj', 'access'];
}

function isFunction(x) {
  return typeof x == 'function';
}