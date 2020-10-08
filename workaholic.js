/**
 * [workaholic.js] web-worker API for multi thread programming on browser
 * web-worker に次々と仕事を渡したい人の Promise ベース API
 * (usage)
   var w = Workers();
   // [by workers]
   var s = Date.now(); Promise.resolve().then(()=>w.cmd( ()=>1 + 1000 )).then(r=>console.log('OK', Date.now() - s, r));
   // [by display]
   var s = Date.now(); Promise.resolve().then(()=>1 + 1000).then(r=>console.log('OK', Date.now() - s, r));
   It tooks 1~2ms to pass any operation to tunnel to a worker. It means that worker should owe ONLY some BATCH process which hangs
   user operation.
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
    setDebug: WP_setDebug,
    add: WP_add,
    del: WP_del,
    cmd: WP_cmd,
    seek: WP_seek,
    free: WP_free,
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
    var wo = new OneWorker(wp_opts.worker_options);
    var no = wo.no;
    wkrs[ no ] = wo;
    return wo.ready();

  }
  function WP_del(wo) {

    var wp = this, wp_opts = wp.options, wkrs = wp.stack;
    var no = wo.no, cbs = wo._callbacks;
    return wo.ready().then(()=>{
      if(Object.keys(cbs).length) {
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
  function WP_close() {

    var wp = this, wp_opts = wp.options, wkrs = wp.stack;
    var when = Promise.resolve();
    Object.values(wkrs).forEach(wo=>{
      when = when.then(()=>wp.del(wo));
    });
    return when;

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
      var DEBUG = FALSE, WORKER_NO = NULL;
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
        var data = evt.data, r_id = data.id, r_type = _evtType(data.type), r_func;
        // console.log('message@Worker');
        debug('received event:', r_id, r_type);
        return Promise.resolve().then(function() {
          switch(data.type) {

          case 'setDebug':
            return data.value == NULL ? DEBUG: (DEBUG = data.value);
            
          case 'connect':
            // TODO
            return new Promise(function(rsl, rej) {
              try {
                WORKER_NO = data.no;
                rsl();
              } catch(e) {
                g.$S.on('ready', rsl).on('error', rej);
              }
            });

          case 'import':
            return importScripts([ ].concat(data.src));

          case 'eval':
          case 'script':
          default:
            try {
              r_func = eval('(' + data.src + ')'); // for Object and Function
            } catch(e) {
              r_func = eval('(function(){ ' + data.src + ' })'); // for Script
            }
            return typeof r_func == 'function' ? r_func.call(g): r_func;

          }
        }).then(function(r) {

          debug('complete process:', Date.now() - s, r_id, r_type, r_func);
          postMessage({
            "id": r_id,
            "type": r_type,
            "result": r,
            "timestamp": Date.now()
          });

        })['catch'](function(e) {

          e = e || 'evaluated failure.';
          debug('failure process:', Date.now() - s, r_id, r_type, r_func, e);
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
      function _evtType(m_ty) {
        switch(m_ty) {

        case 'connect':
          return 'ready';
        default:
          return 'done';

        }
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
      src = [ 'importScripts("' + wo_opts.importScripts.join('","') + '");', src ].join("\n");
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
      if(isFunction(message.src)) {
        message.src = funcStringify(message.src);
      }

      // TODO setTimeout for operation timeout
      var id = message.id = wo._seq = (wo._seq + 1) & 0xffff;
      cbs[id] = (evt, data)=>{
        wo.debug('Op.response:', evt, data);
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
      ww.postMessage(message);

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
