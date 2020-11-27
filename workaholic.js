/**
 * [workaholic.js] web-worker API for multi thread programming on browser
 * web-worker に次々と仕事を渡したい人の Promise ベース API
 * RSD_ID: 4o2P77lR
 * (usage)
 
   var w = Workers();
   // for Compare:[by workers] ... NO DISPLAY FREEZE
   var s = Date.now(); Promise.resolve().then(()=>w.cmd({ var i = 0; while(i < 10000000000) i += 1; return i; })
     .then(r=>console.log('OK', Date.now() - s + 'ms', r));
   // for Compare:[by on-display] ... DISPLAY FREEZE
   var s = Date.now(); Promise.resolve().then(()=>{ var i = 0; while(i < 10000000000) i += 1; return i; })
     .then(r=>console.log('OK', Date.now() - s + 'ms', r));

   * It tooks 1~2ms to pass any operation to tunnel to a worker. It means that worker should owe ONLY some BATCH process which hangs
   user operation.
   e.g.) var a = Date.now(); G_workers.all(()=>1 + 1).then(rd=>console.log('DONE', rd, Date.now() - a + 'ms')) // ~5ms

   * Although, it worth that any synchronous process is NOT STUCK DISPLAY AT ALL.
   var a = Date.now(); G_workers.cmd(()=>{ var i = 0; while(i < 10000000000) i += 1; return i; }).then(rd=>console.log('DONE', rd, Date.now() - a + 'ms')); // ~12sec
   var a = Date.now(); G_workers.all(()=>{ var i = 0; while(i < 10000000000) i += 1; return i; }).then(rd=>console.log('DONE', rd, Date.now() - a + 'ms')); // ~25sec
   * But as show in above, unfortunately, multi-worker working grows cost gradually

   // To debug mode
   w.setDebug('ISO');
   // Off
   w.setDebug(0);
   
 */
(function(has_win, has_mod) {
  
  let NULL = null, TRUE = true, FALSE = false, UNDEF = undefined;
  let g;
  if(has_win) {
    g = window;
  } else {
    g = typeof self == 'undefined' ? this: self;
  }
  g.Workers = WorkersWaitingPlace;
  WorkersWaitingPlace.Worker = OneWorker;
  if(has_mod) module.exports = WorkersWaitingPlace;
  
  // WorkersWaitingPlace
  let WP_protos = {

    supportOffscreen: ()=>{
      return isFunction(document.createElement('canvas').transferControlToOffscreen);
    },
    setDebug: WP_setDebug,
    add: WP_add,
    del: WP_del,
    cmd: WP_cmd,
    all: WP_all,
    def: WP_def,
    
    share: WP_share,
    owe: WP_owe,
    
    seek: WP_seek,
    free: WP_free,
    importScript: WP_importScript,
    close: WP_close
    
  };
  Object.keys(WP_protos).forEach(k=>WorkersWaitingPlace.prototype[k] = WP_protos[k]);
  
  // OneWorker
  let WO_protos = {

    status: WO_status,
    connect: WO_connect,
    close: WO_close,

    origin: WO_origin,
    ready: WO_ready,
    op: WO_op,

  };
  Object.keys(WO_protos).forEach(k=>OneWorker.prototype[k] = WO_protos[k]);
  
  let G_Counter = 0;
  let G_Default = {
    NumWorker: 8
  };
  let G_WorkerStatus = {
    Init: 'init',
    Connecting: 'connecting',
    Ready: 'ready',
    Deleting: 'deleting',
    Error: 'error'
  };
  let G_DEBUG;
  let G_debug = function() {
    if(!G_DEBUG) { return; }
    var args = casting(arguments);
    var time = new Date()[ G_DEBUG == 'ISO' ? 'toISOString': 'toGMTString' ]() + ' - '
    if(this.no) {
      args.unshift(time + '[OneWorker #' + this.no + ']');
    } else {
      args.unshift(time + '[WorkersWaitingPlace]');
    }
    console.log.apply(console, args);
  };
  let G_origin = location.origin;
  /**
   * @class WorkersWaitingPlace
   */
  function WorkersWaitingPlace(options) {

    var wp = this;
    if(!(wp instanceof WorkersWaitingPlace)) {
      return new WorkersWaitingPlace(options);
    }
    var opts = wp.options = options || { };
    var wkrs = wp.stack = { };
    wp.numWorker = opts.numWorker || G_Default.NumWorker;
    wp.debug = G_debug;
    while(Object.keys(wkrs).length < wp.numWorker) {
      wp.add();
    }

  }
  function WP_setDebug(v) {
    
    if(v == NULL) {
      return G_DEBUG;
    }
    var wp = this, wp_opts = wp.options, wkrs = wp.stack;
    var when = Promise.resolve();
    Object.values(wkrs).forEach(wo=>{
      when = when.then(()=>wo.op({ type: 'setDebug', value: v }));
    });
    return when.then(()=>G_DEBUG = v);
    
  }
  function WP_add() {

    var wp = this, wp_opts = wp.options, wkrs = wp.stack;
    var wo = new OneWorker(wp_opts);
    var no = wo.no;
    wkrs[ no ] = wo;
    return wo.ready();

  }
  function WP_del(wo) {

    var wp = this, wp_opts = wp.options, wkrs = wp.stack;
    var no = wo.no, cbs = wo._callbacks;
    return wo.ready().then(()=>{
      if(Object.keys(cbs).length == 0) {
        wo._tobeDelete = TRUE;
        return;
      }
      return new Promise(rsl=>wo._tobeDelete = rsl);
    }).then(()=>{
      wo._status = G_WorkerStatus.Deleting;
      delete wkrs[ no ];
      return wo.close();
    });

  }
  function WP_importScript(uris) {
    
    var wp = this, wp_opts = wp.options, wkrs = wp.stack;
    var when = Promise.resolve();
    Object.values(wkrs).forEach(wo=>{
      when = when.then(()=>wp.op({ type: 'importScripts' }));
    });
    return when;
   
  }
  function WP_close() {

    var wp = this, wp_opts = wp.options, wkrs = wp.stack;
    return Promise.all( Object.values(wkrs).map(wo=>wp.del(wo)) );

  }
  function WP_cmd(func, point) {
    
    var wp = this, wp_opts = wp.options;
    let wo, rd;
    point = point || 1; // 処理に重み付けをする。
    return Promise.resolve().then(()=>{
      return wp.seek(point).then(r=>wo = r);
    }).then(()=>{
      return wo.op(func).then(r=>rd = r);
    }).then(()=>{
      return wp.free(point, wo);
    }).then(()=>rd);

  }
  function WP_all(func) {

    var wp = this, wp_opts = wp.options, wkrs = wp.stack;
    return Promise.all( Object.values(wkrs).map(wo=>wo.op(func)) );

  }
  function WP_def(name, data) {

    var wp = this;
    return wp.all({ define: name, value: data });

  }
  function WP_share(point, no) {
    
    var wp = this, wp_opts = wp.options, wkrs = wp.stack;
    var wo = wkrs[ no = no || 1 ];
    if(wo == NULL) throw 'Worker #' + no + ' is not found';
    return wo.points += (point || 0);
    
  }
  function WP_owe(func, no) {

    var wp = this, wp_opts = wp.options, wkrs = wp.stack;
    var wo = wkrs[ no = no || 1 ];
    if(wo == NULL) return Promise.reject('Worker #' + no + ' is not found');
    return wo.op(func);

  }
  function WP_seek(point, n) {

    var wp = this, wp_opts = wp.options, wkrs = wp.stack;
    var rd = [ ];
    var seekOne = n == NULL;
    n = n || 1;
    return Promise.resolve().then(()=>{

      var orgs = Object.values(wkrs).filter( wo=>!isFunction(wo._tobeDelete) )
      if(orgs.length == 0) {
        throw 'No worker object';
      }
      var createCands = ()=>{
        return orgs.sort( (wo1, wo2)=>wo1.points <= wo2.points ? -1: 1 );
      };
      // ポイント順に並べて負荷の低い順に埋めていく。
      var wo;
      while(rd.length < n) {
        rd.push(wo = createCands()[ 0 ]);
        wo.points += point;
      }

    }).then( ()=>seekOne ? rd[ 0 ]: rd );

  }
  function WP_free(point, wo) {

    var wp = this, wp_opts = wp.options, wkrs = wp.stack;
    return Promise.resolve().then(()=>{
      wo.point -= point;
    });

  }
  /**
   * @class OneWorker
   */
  function OneWorker(options) {

    var wo = this, wo_opts = wo.options = options || { };
    var cbs = wo._callbacks = { }; // { _seq: callback }
    wo.no = ++G_Counter;
    wo.points = 0;
    wo._seq = 0;
    wo._status = G_WorkerStatus.Init;
    wo.debug = G_debug.bind(wo);

    var importScript = function() {

      // Define global
      var NULL = null, TRUE = true, FALSE = false, UNDEF = undefined;
      var g = typeof self == 'undefined' ? this: self;

      // Define debug
      var DEBUG = FALSE, WORKER_NO = NULL, OFFSCREENS = { }, SHARE_BOX = { draws: { }, goals: { } };
      var debug = function() {
        if(!DEBUG) { return; }
        var args = casting(arguments);
        var time = new Date()[ DEBUG == 'ISO' ? 'toISOString': 'toGMTString' ]() + ' - '
        if(WORKER_NO) {
          args.unshift(time + '[@Worker #' + WORKER_NO + ']');
        } else {
          args.unshift(time + '[@Worker]');
        }
        console.log.apply(console, args);
      };

      // Import LIKE synquery.dope.js
      // { data: { id:, type:, src:, ... } } => { data: { id:, type:, reslut: } } / { data: { id:, type:, errmsg: } }
      g.addEventListener('message', function(evt) {
        var s = Date.now();
        var data = evt.data, r_id = data.id, r_type = _evtType(data.type);
        var r_func, r_args, r_exec = ()=>isFunction(r_func) ? r_func.apply(g, r_args.concat(SHARE_BOX, OFFSCREENS)): r_func;
        // console.log('message@Worker');
        debug('received event: #' + r_id, evt);
        return Promise.resolve().then(function() {
          var k, v;
          switch(data.type) {

          case 'setDebug':
            v = data.value;
            return v == NULL ? DEBUG: (DEBUG = v);
          case 'debugger':
            return eval('debugger;');

          case 'connect':
            v = data.no;
            return new Promise(function(rsl, rej) {
              try {
                WORKER_NO = v;
                rsl();
              } catch(e) {
                g.$S.on('ready', rsl).on('error', rej);
              }
            });
          case 'canvas':
            v = data.canvas;
            OFFSCREENS[ data.offscreen_name || '_' ] = v;
            return;
                  
            // ----- APIS ----- //
            // (1) keys / self (2) defs / define (3) exec / execute (4) import / importScripts (5) eval / script
          case 'keys':
          case 'self':
            v = data.src || data.value || data.key;
            switch(v) {
            default:
              return v == NULL ? Object.keys(self): self[ v ];
            }
            
          case 'defs':
          case 'define':
            v = data.src || data.value || data.key;
            switch(v) {
            default:
              return v == NULL ? Object.keys(SHARE_BOX): SHARE_BOX[ v ];
            }

          case 'exec':
          case 'execute':
            // SHARE_BOX にセットした関数を保持する
            k = data.src || data.value || data.script;
            r_args = [ ].concat(data.args || [ ]);
            r_func = SHARE_BOX[ k ];
            return r_exec();
            
          case 'kick':
          case 'animation':
            // SHARE_BOX.draws, SHARE_BOX.goals に登録している関数でアニメーションさせる
            if(animQueue.timer != NULL) return;
            animQueue.draws = SHARE_BOX[ data.draws || 'draws' ];
            animQueue.goals = SHARE_BOX[ data.goals || 'goals' ];
            animQueue();
            return;

          case 'import':
          case 'importScripts':
            v = [ ].concat(data.src || data.value || data.urls).map(uri=>{

              if(/^(https?|blob):/.test(uri) || data.origin == NULL) { return uri; }
              return [ data.origin, uri.substr(uri.charAt(0) == '/' ? 1: 0) ].join('/');

            });
            return importScripts.apply(self, v);
          
          case 'eval':
          case 'script':
          default:
            v = data.src || data.value || data.script;
            try {
              r_args = [ ].concat(data.args === UNDEF ? [ ]: data.args);
              r_func = eval('(' + v + ')'); 
                // for Object and Function
            } catch(e) {
              r_func = eval('(function(' + r_args.map( (d, i)=>'a' + i ).concat('SHARE_BOX', 'OFFSCREENS').join(',') + ') { ' + v + ' })'); 
                // for Script
            }
            switch(TRUE) {

            case is('string', data[ 'define' ]):
              SHARE_BOX[ data[ 'define' ] ] = r_func;
              return data[ 'define' ];

            case is('string', data['draws']):
              SHARE_BOX.draws[ data['draws'] ] = r_func;
              return data['draws'];
            case is('string', data['goals']):
              SHARE_BOX.goals[ data['goals'] ] = r_func;
              return data['goals'];

            case is('string', data[ 'global' ]):
              g[ data[ 'global' ] ] = r_func;
              return data[ 'global' ];

            default:
              return r_exec();

            }

          }
        }).then(function(r) {

          debug('complete process: #' + r_id, Date.now() - s + 'ms', r_type, r_func);
          postMessage({
            "id": r_id,
            "type": r_type,
            "result": r,
            "timestamp": Date.now()
          });

        })['catch'](function(e) {

          e = e || 'evaluated failure.';
          debug('failure process: #' + r_id, Date.now() - s + 'ms', r_type, r_func, e);
          postMessage({
            "id": r_id,
            "type": "error",
            "errmsg": e.message ? e.message: e,
            "estack": e.stack,
            "timestamp": Date.now()
          });

        });
      });
      // <-- g.addEventListener('message', function(evt) { ... }; <--
      
      // ----- //
      function _evtType(m_ty) {
        switch(m_ty) {

        case 'connect':
          return 'ready';
        default:
          return 'done';

        }
      }
      function animQueue() {
        if(Object.values(animQueue.goals).filter(goalFunc=>goalFunc(SHARE_BOX) === FALSE).length === 0) {
          cancelAnimationFrame(animQueue.timer);
          animQueue.timer = NULL;
          return;
        }
        Object.values(animQueue.draws).forEach( darwFunc=>darwFunc(SHARE_BOX, OFFSCREENS) );
        animQueue.timer = requestAnimationFrame(animQueue);
      }

      // ----- //
      function casting(a) {
        return Array.prototype.slice.call(a);
      }
      function is(ty, x) {
        return typeof x == ty;
      }
      function isArray(x) {
        return Array.isArray(x);
      }
      function isFunction(x) {
        return typeof x == 'function';
      }

    }; // <-- var importScript = function(){ ... } <--

    var src = funcStringify(importScript);
    if(isArray(wo_opts.importScripts)) {
      src = [ 'importScripts("' + wo_opts.importScripts.map(uri=>{

        if( /^(https?|blob):/.test(uri) ) { return uri; }
        return [ G_origin, uri.substr(uri.charAt(0) == '/' ? 1: 0) ].join('/');

      }).join('",\n"') + '");', src ].join("\n");
    }
    wo._worker = new Worker(URL.createObjectURL(new Blob([ src ], {
      type: 'text/javascript'
    })));
    wo._worker.onmessage = function(evt) {

      // [WebWorker] onmessage event listener
      // console.log('message@Display');
      var d = evt.data || { }, responseCallback = cbs[ d.id ];
      delete cbs[ d.id ];
      wo.debug('responseCallback?', responseCallback);
      if( isFunction(responseCallback) ) {
        try {
          responseCallback(evt, d); 
        } catch(e) {
          console.error('[OneWorker #' + wo.no + '] Synchronouse error occurs on responseCallback:', e, evt);
        }
        if( isFunction(wo._tobeDelete) ) wo._tobeDelete(); // => Reserved Disconnect
      }
      (wo.onmessage || Function())(evt, d);

    };
    wo._worker.onerror = wo._worker.onabort = function(evt) {
      
      // [WebWorker] onerror event listener
      console.error(evt);
      
    };
    wo._ready = wo.connect();

  }

  /**
   * 
   * @returns <String> status
   */
  function WO_status() {
    var wo = this, wo_opts = wo.options;
    return wo._status;
  }
  
  /**
   * 
   * @returns <Object> Promise
   */
  function WO_connect() {
    var wo = this, wo_opts = wo.options;
    wo._status = G_WorkerStatus.Connecting;
    return Promise.resolve().then(function(r) {

      var s = wo_opts.initialize;
      return wo.op({
        type: 'connect',
        no: wo.no,
          // TODO accept initialize script
      });

    }).then(()=>{
      wo._status = G_WorkerStatus.Ready;
    })['catch'](e=>{
      wo._status = G_WorkerStatus.Error;
      wo._error = e;
    });
  }

  /**
   * 
   * @returns <Object> Promise
   */
  function WO_close() {
    var wo = this;
    return Promise.resolve().then(function() {
      return wo.origin().terminate();
    });
  }

  /**
   * 
   * @returns <Object> Worker
   */
  function WO_origin() {
    var wo = this;
    return wo._worker;
  }

  /**
   * 
   * @param fn
   * @returns
   */
  function WO_ready(next) {
    var wo = this, wo_opts = wo.options;
    return Promise.resolve().then( ()=>wo._ready ).then( next || Function() );
  }

  /**
   * 
   * @returns <Object> Promise
   */
  function WO_op(message, options) {
    var wo = this, wo_opts = wo.options;
    var opts = options || { };
    var ww = wo._worker, cbs = wo._callbacks;
    return ( message.type == 'connect' ? Promise.resolve(): wo.ready() ).then(()=>new Promise((rsl, rej)=>{

      // Accept raw-string, raw-function
      if(!is('object', message)) {
        message = {
          src: message
        };
      }
      ['src', 'script', 'value'].forEach(k=>{
        if(isFunction(message[ k ])) message[ k ] = funcStringify(message[ k ]);
      });
 
      // Substitute type
      if(message.type == NULL) {
        switch(TRUE) {
        case message.canvas != NULL:
          message.type = 'canvas'; break;
        case message.define != NULL:
          message.type = 'script'; break;
        }
      }

      // TODO setTimeout for operation timeout
      let id = message.id = wo._seq = (wo._seq + 1) & 0xffff;
      let offscreen;
      message.origin = G_origin;
      cbs[id] = (evt, data)=>{
        wo.debug('Op.responseCallback:', evt, data);
        switch(data.type) {
        case 'ready':
          return rsl(data);
        case 'done':
          return rsl(opts.dataType == 'event' ? evt: opts.dataType == 'data' ? data: data.result);
        case 'error':
        default:
          return rej(data);
        }
      };
      wo.debug('Op.postMessage:', message);
      switch(message.type) {
      case 'canvas':
        offscreen = message.canvas = message.canvas.transferControlToOffscreen();
        return ww.postMessage(message, [ offscreen ]);
      default:
        return ww.postMessage(message);
      }

    }));
  }

  /**
   * 
   * @param m_ty
   * @returns
   */
  function _evtType(m_ty) {
    switch(m_ty) {

    case 'connect':
      return 'ready';
    default:
      return 'done';

    }
  }

  // ----- //
  function funcStringify(func, replaces, options) {
    replaces = replaces || { }, options = options || { }
    var s = func.toString().trim(), braIdx = s.indexOf('{'), braNon = braIdx == -1;
    if(!braNon) {
      braNon = s.substr(0, braIdx).trim().substr(-2) == '=>';
    }
    if(braNon) {
      s = s.substr(s.indexOf('=>') + 2).trim();
    } else {
      s = s.slice(s.indexOf('{') + 1, s.lastIndexOf('}'));
    } 
    Object.keys(replaces).forEach(kw=>{
      s = s.replace(new RegExp(kw, 'g'), replaces[ kw ]);
    });
    if(isArray(options.args)) {
      s = 'function(' + options.args.join(', ') + ') {' + s + '}';
    }
    return s;
  }

  // ----- //
  function casting(a) {
    return Array.prototype.slice.call(a);
  }
  function is(ty, x) {
    return typeof x == ty;
  }
  function isArray(x) {
    return Array.isArray(x);
  }
  function isFunction(x) {
    return typeof x == 'function';
  }

}).call(this, typeof window != 'undefined', typeof module != 'undefined');
