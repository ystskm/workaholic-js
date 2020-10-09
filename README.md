# workaholic-js
web-worker API for multi thread programming on browser

[![Version](https://badge.fury.io/js/workaholic-js.png)](https://npmjs.org/package/workaholic-js)
[![Build status](https://travis-ci.org/ystskm/workaholic-js.png)](https://travis-ci.org/ystskm/workaholic-js)  
  

## Install

Install with [npm](http://npmjs.org/):

    npm install workaholic-js
    
## API - Create workers and connect automatically

```js

   var w = Workers( );
   Promise.all([ w.cmd(()=>1 + 2), w.cmd(()=>3 + 4), w.cmd(()=>5 + 6), w.cmd(()=>7 + 8), w.cmd(()=>9) ])
     .then(rd=>console.log('Completed!', rd)); // => [3, 7, 11, 15, 9]
   
   // for Compare:[by workers] ... NO DISPLAY FREEZE
   var s = Date.now(); Promise.resolve().then(()=>w.cmd({ var i = 0; while(i < 10000000000) i += 1; return i; })
     .then(r=>console.log('OK', Date.now() - s + 'ms', r));
   // for Compare:[by on-display] ... DISPLAY FREEZE
   var s = Date.now(); Promise.resolve().then(()=>{ var i = 0; while(i < 10000000000) i += 1; return i; })
     .then(r=>console.log('OK', Date.now() - s + 'ms', r));
   
   // NOTE:
   // It tooks 1~2ms to pass any operation to tunnel to a worker. It means that worker should owe ONLY some BATCH process which hangs
   // user operation.
   
   // To debug mode
   w.setDebug('ISO');
   // Off
   w.setDebug(0);
   
   // remove workers
   w.close();
   
```
