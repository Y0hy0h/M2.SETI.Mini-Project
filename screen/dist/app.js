(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
/*globals Handlebars: true */
var base = require("./handlebars/base");

// Each of these augment the Handlebars object. No need to setup here.
// (This is done to easily share code between commonjs and browse envs)
var SafeString = require("./handlebars/safe-string")["default"];
var Exception = require("./handlebars/exception")["default"];
var Utils = require("./handlebars/utils");
var runtime = require("./handlebars/runtime");

// For compatibility and usage outside of module systems, make the Handlebars object a namespace
var create = function() {
  var hb = new base.HandlebarsEnvironment();

  Utils.extend(hb, base);
  hb.SafeString = SafeString;
  hb.Exception = Exception;
  hb.Utils = Utils;

  hb.VM = runtime;
  hb.template = function(spec) {
    return runtime.template(spec, hb);
  };

  return hb;
};

var Handlebars = create();
Handlebars.create = create;

exports["default"] = Handlebars;
},{"./handlebars/base":2,"./handlebars/exception":3,"./handlebars/runtime":4,"./handlebars/safe-string":5,"./handlebars/utils":6}],2:[function(require,module,exports){
"use strict";
var Utils = require("./utils");
var Exception = require("./exception")["default"];

var VERSION = "1.3.0";
exports.VERSION = VERSION;var COMPILER_REVISION = 4;
exports.COMPILER_REVISION = COMPILER_REVISION;
var REVISION_CHANGES = {
  1: '<= 1.0.rc.2', // 1.0.rc.2 is actually rev2 but doesn't report it
  2: '== 1.0.0-rc.3',
  3: '== 1.0.0-rc.4',
  4: '>= 1.0.0'
};
exports.REVISION_CHANGES = REVISION_CHANGES;
var isArray = Utils.isArray,
    isFunction = Utils.isFunction,
    toString = Utils.toString,
    objectType = '[object Object]';

function HandlebarsEnvironment(helpers, partials) {
  this.helpers = helpers || {};
  this.partials = partials || {};

  registerDefaultHelpers(this);
}

exports.HandlebarsEnvironment = HandlebarsEnvironment;HandlebarsEnvironment.prototype = {
  constructor: HandlebarsEnvironment,

  logger: logger,
  log: log,

  registerHelper: function(name, fn, inverse) {
    if (toString.call(name) === objectType) {
      if (inverse || fn) { throw new Exception('Arg not supported with multiple helpers'); }
      Utils.extend(this.helpers, name);
    } else {
      if (inverse) { fn.not = inverse; }
      this.helpers[name] = fn;
    }
  },

  registerPartial: function(name, str) {
    if (toString.call(name) === objectType) {
      Utils.extend(this.partials,  name);
    } else {
      this.partials[name] = str;
    }
  }
};

function registerDefaultHelpers(instance) {
  instance.registerHelper('helperMissing', function(arg) {
    if(arguments.length === 2) {
      return undefined;
    } else {
      throw new Exception("Missing helper: '" + arg + "'");
    }
  });

  instance.registerHelper('blockHelperMissing', function(context, options) {
    var inverse = options.inverse || function() {}, fn = options.fn;

    if (isFunction(context)) { context = context.call(this); }

    if(context === true) {
      return fn(this);
    } else if(context === false || context == null) {
      return inverse(this);
    } else if (isArray(context)) {
      if(context.length > 0) {
        return instance.helpers.each(context, options);
      } else {
        return inverse(this);
      }
    } else {
      return fn(context);
    }
  });

  instance.registerHelper('each', function(context, options) {
    var fn = options.fn, inverse = options.inverse;
    var i = 0, ret = "", data;

    if (isFunction(context)) { context = context.call(this); }

    if (options.data) {
      data = createFrame(options.data);
    }

    if(context && typeof context === 'object') {
      if (isArray(context)) {
        for(var j = context.length; i<j; i++) {
          if (data) {
            data.index = i;
            data.first = (i === 0);
            data.last  = (i === (context.length-1));
          }
          ret = ret + fn(context[i], { data: data });
        }
      } else {
        for(var key in context) {
          if(context.hasOwnProperty(key)) {
            if(data) { 
              data.key = key; 
              data.index = i;
              data.first = (i === 0);
            }
            ret = ret + fn(context[key], {data: data});
            i++;
          }
        }
      }
    }

    if(i === 0){
      ret = inverse(this);
    }

    return ret;
  });

  instance.registerHelper('if', function(conditional, options) {
    if (isFunction(conditional)) { conditional = conditional.call(this); }

    // Default behavior is to render the positive path if the value is truthy and not empty.
    // The `includeZero` option may be set to treat the condtional as purely not empty based on the
    // behavior of isEmpty. Effectively this determines if 0 is handled by the positive path or negative.
    if ((!options.hash.includeZero && !conditional) || Utils.isEmpty(conditional)) {
      return options.inverse(this);
    } else {
      return options.fn(this);
    }
  });

  instance.registerHelper('unless', function(conditional, options) {
    return instance.helpers['if'].call(this, conditional, {fn: options.inverse, inverse: options.fn, hash: options.hash});
  });

  instance.registerHelper('with', function(context, options) {
    if (isFunction(context)) { context = context.call(this); }

    if (!Utils.isEmpty(context)) return options.fn(context);
  });

  instance.registerHelper('log', function(context, options) {
    var level = options.data && options.data.level != null ? parseInt(options.data.level, 10) : 1;
    instance.log(level, context);
  });
}

var logger = {
  methodMap: { 0: 'debug', 1: 'info', 2: 'warn', 3: 'error' },

  // State enum
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  level: 3,

  // can be overridden in the host environment
  log: function(level, obj) {
    if (logger.level <= level) {
      var method = logger.methodMap[level];
      if (typeof console !== 'undefined' && console[method]) {
        console[method].call(console, obj);
      }
    }
  }
};
exports.logger = logger;
function log(level, obj) { logger.log(level, obj); }

exports.log = log;var createFrame = function(object) {
  var obj = {};
  Utils.extend(obj, object);
  return obj;
};
exports.createFrame = createFrame;
},{"./exception":3,"./utils":6}],3:[function(require,module,exports){
"use strict";

var errorProps = ['description', 'fileName', 'lineNumber', 'message', 'name', 'number', 'stack'];

function Exception(message, node) {
  var line;
  if (node && node.firstLine) {
    line = node.firstLine;

    message += ' - ' + line + ':' + node.firstColumn;
  }

  var tmp = Error.prototype.constructor.call(this, message);

  // Unfortunately errors are not enumerable in Chrome (at least), so `for prop in tmp` doesn't work.
  for (var idx = 0; idx < errorProps.length; idx++) {
    this[errorProps[idx]] = tmp[errorProps[idx]];
  }

  if (line) {
    this.lineNumber = line;
    this.column = node.firstColumn;
  }
}

Exception.prototype = new Error();

exports["default"] = Exception;
},{}],4:[function(require,module,exports){
"use strict";
var Utils = require("./utils");
var Exception = require("./exception")["default"];
var COMPILER_REVISION = require("./base").COMPILER_REVISION;
var REVISION_CHANGES = require("./base").REVISION_CHANGES;

function checkRevision(compilerInfo) {
  var compilerRevision = compilerInfo && compilerInfo[0] || 1,
      currentRevision = COMPILER_REVISION;

  if (compilerRevision !== currentRevision) {
    if (compilerRevision < currentRevision) {
      var runtimeVersions = REVISION_CHANGES[currentRevision],
          compilerVersions = REVISION_CHANGES[compilerRevision];
      throw new Exception("Template was precompiled with an older version of Handlebars than the current runtime. "+
            "Please update your precompiler to a newer version ("+runtimeVersions+") or downgrade your runtime to an older version ("+compilerVersions+").");
    } else {
      // Use the embedded version info since the runtime doesn't know about this revision yet
      throw new Exception("Template was precompiled with a newer version of Handlebars than the current runtime. "+
            "Please update your runtime to a newer version ("+compilerInfo[1]+").");
    }
  }
}

exports.checkRevision = checkRevision;// TODO: Remove this line and break up compilePartial

function template(templateSpec, env) {
  if (!env) {
    throw new Exception("No environment passed to template");
  }

  // Note: Using env.VM references rather than local var references throughout this section to allow
  // for external users to override these as psuedo-supported APIs.
  var invokePartialWrapper = function(partial, name, context, helpers, partials, data) {
    var result = env.VM.invokePartial.apply(this, arguments);
    if (result != null) { return result; }

    if (env.compile) {
      var options = { helpers: helpers, partials: partials, data: data };
      partials[name] = env.compile(partial, { data: data !== undefined }, env);
      return partials[name](context, options);
    } else {
      throw new Exception("The partial " + name + " could not be compiled when running in runtime-only mode");
    }
  };

  // Just add water
  var container = {
    escapeExpression: Utils.escapeExpression,
    invokePartial: invokePartialWrapper,
    programs: [],
    program: function(i, fn, data) {
      var programWrapper = this.programs[i];
      if(data) {
        programWrapper = program(i, fn, data);
      } else if (!programWrapper) {
        programWrapper = this.programs[i] = program(i, fn);
      }
      return programWrapper;
    },
    merge: function(param, common) {
      var ret = param || common;

      if (param && common && (param !== common)) {
        ret = {};
        Utils.extend(ret, common);
        Utils.extend(ret, param);
      }
      return ret;
    },
    programWithDepth: env.VM.programWithDepth,
    noop: env.VM.noop,
    compilerInfo: null
  };

  return function(context, options) {
    options = options || {};
    var namespace = options.partial ? options : env,
        helpers,
        partials;

    if (!options.partial) {
      helpers = options.helpers;
      partials = options.partials;
    }
    var result = templateSpec.call(
          container,
          namespace, context,
          helpers,
          partials,
          options.data);

    if (!options.partial) {
      env.VM.checkRevision(container.compilerInfo);
    }

    return result;
  };
}

exports.template = template;function programWithDepth(i, fn, data /*, $depth */) {
  var args = Array.prototype.slice.call(arguments, 3);

  var prog = function(context, options) {
    options = options || {};

    return fn.apply(this, [context, options.data || data].concat(args));
  };
  prog.program = i;
  prog.depth = args.length;
  return prog;
}

exports.programWithDepth = programWithDepth;function program(i, fn, data) {
  var prog = function(context, options) {
    options = options || {};

    return fn(context, options.data || data);
  };
  prog.program = i;
  prog.depth = 0;
  return prog;
}

exports.program = program;function invokePartial(partial, name, context, helpers, partials, data) {
  var options = { partial: true, helpers: helpers, partials: partials, data: data };

  if(partial === undefined) {
    throw new Exception("The partial " + name + " could not be found");
  } else if(partial instanceof Function) {
    return partial(context, options);
  }
}

exports.invokePartial = invokePartial;function noop() { return ""; }

exports.noop = noop;
},{"./base":2,"./exception":3,"./utils":6}],5:[function(require,module,exports){
"use strict";
// Build out our basic SafeString type
function SafeString(string) {
  this.string = string;
}

SafeString.prototype.toString = function() {
  return "" + this.string;
};

exports["default"] = SafeString;
},{}],6:[function(require,module,exports){
"use strict";
/*jshint -W004 */
var SafeString = require("./safe-string")["default"];

var escape = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "`": "&#x60;"
};

var badChars = /[&<>"'`]/g;
var possible = /[&<>"'`]/;

function escapeChar(chr) {
  return escape[chr] || "&amp;";
}

function extend(obj, value) {
  for(var key in value) {
    if(Object.prototype.hasOwnProperty.call(value, key)) {
      obj[key] = value[key];
    }
  }
}

exports.extend = extend;var toString = Object.prototype.toString;
exports.toString = toString;
// Sourced from lodash
// https://github.com/bestiejs/lodash/blob/master/LICENSE.txt
var isFunction = function(value) {
  return typeof value === 'function';
};
// fallback for older versions of Chrome and Safari
if (isFunction(/x/)) {
  isFunction = function(value) {
    return typeof value === 'function' && toString.call(value) === '[object Function]';
  };
}
var isFunction;
exports.isFunction = isFunction;
var isArray = Array.isArray || function(value) {
  return (value && typeof value === 'object') ? toString.call(value) === '[object Array]' : false;
};
exports.isArray = isArray;

function escapeExpression(string) {
  // don't escape SafeStrings, since they're already safe
  if (string instanceof SafeString) {
    return string.toString();
  } else if (!string && string !== 0) {
    return "";
  }

  // Force a string conversion as this will be done by the append regardless and
  // the regex test will do this transparently behind the scenes, causing issues if
  // an object's to string has escaped characters in it.
  string = "" + string;

  if(!possible.test(string)) { return string; }
  return string.replace(badChars, escapeChar);
}

exports.escapeExpression = escapeExpression;function isEmpty(value) {
  if (!value && value !== 0) {
    return true;
  } else if (isArray(value) && value.length === 0) {
    return true;
  } else {
    return false;
  }
}

exports.isEmpty = isEmpty;
},{"./safe-string":5}],7:[function(require,module,exports){
// Create a simple path alias to allow browserify to resolve
// the runtime on a supported path.
module.exports = require('./dist/cjs/handlebars.runtime');

},{"./dist/cjs/handlebars.runtime":1}],8:[function(require,module,exports){
module.exports = require("handlebars/runtime")["default"];

},{"handlebars/runtime":7}],9:[function(require,module,exports){
!function t(e,r){"object"==typeof exports&&"object"==typeof module?module.exports=r():"function"==typeof define&&define.amd?define([],r):"object"==typeof exports?exports.Raphael=r():e.Raphael=r()}(this,function(){return function(t){function e(i){if(r[i])return r[i].exports;var n=r[i]={exports:{},id:i,loaded:!1};return t[i].call(n.exports,n,n.exports,e),n.loaded=!0,n.exports}var r={};return e.m=t,e.c=r,e.p="",e(0)}([function(t,e,r){var i,n;i=[r(1),r(3),r(4)],n=function(t){return t}.apply(e,i),!(void 0!==n&&(t.exports=n))},function(t,e,r){var i,n;i=[r(2)],n=function(t){function e(r){if(e.is(r,"function"))return w?r():t.on("raphael.DOMload",r);if(e.is(r,Q))return e._engine.create[z](e,r.splice(0,3+e.is(r[0],$))).add(r);var i=Array.prototype.slice.call(arguments,0);if(e.is(i[i.length-1],"function")){var n=i.pop();return w?n.call(e._engine.create[z](e,i)):t.on("raphael.DOMload",function(){n.call(e._engine.create[z](e,i))})}return e._engine.create[z](e,arguments)}function r(t){if("function"==typeof t||Object(t)!==t)return t;var e=new t.constructor;for(var i in t)t[A](i)&&(e[i]=r(t[i]));return e}function i(t,e){for(var r=0,i=t.length;r<i;r++)if(t[r]===e)return t.push(t.splice(r,1)[0])}function n(t,e,r){function n(){var a=Array.prototype.slice.call(arguments,0),s=a.join("␀"),o=n.cache=n.cache||{},l=n.count=n.count||[];return o[A](s)?(i(l,s),r?r(o[s]):o[s]):(l.length>=1e3&&delete o[l.shift()],l.push(s),o[s]=t[z](e,a),r?r(o[s]):o[s])}return n}function a(){return this.hex}function s(t,e){for(var r=[],i=0,n=t.length;n-2*!e>i;i+=2){var a=[{x:+t[i-2],y:+t[i-1]},{x:+t[i],y:+t[i+1]},{x:+t[i+2],y:+t[i+3]},{x:+t[i+4],y:+t[i+5]}];e?i?n-4==i?a[3]={x:+t[0],y:+t[1]}:n-2==i&&(a[2]={x:+t[0],y:+t[1]},a[3]={x:+t[2],y:+t[3]}):a[0]={x:+t[n-2],y:+t[n-1]}:n-4==i?a[3]=a[2]:i||(a[0]={x:+t[i],y:+t[i+1]}),r.push(["C",(-a[0].x+6*a[1].x+a[2].x)/6,(-a[0].y+6*a[1].y+a[2].y)/6,(a[1].x+6*a[2].x-a[3].x)/6,(a[1].y+6*a[2].y-a[3].y)/6,a[2].x,a[2].y])}return r}function o(t,e,r,i,n){var a=-3*e+9*r-9*i+3*n,s=t*a+6*e-12*r+6*i;return t*s-3*e+3*r}function l(t,e,r,i,n,a,s,l,h){null==h&&(h=1),h=h>1?1:h<0?0:h;for(var u=h/2,c=12,f=[-.1252,.1252,-.3678,.3678,-.5873,.5873,-.7699,.7699,-.9041,.9041,-.9816,.9816],p=[.2491,.2491,.2335,.2335,.2032,.2032,.1601,.1601,.1069,.1069,.0472,.0472],d=0,g=0;g<c;g++){var v=u*f[g]+u,x=o(v,t,r,n,s),y=o(v,e,i,a,l),m=x*x+y*y;d+=p[g]*Y.sqrt(m)}return u*d}function h(t,e,r,i,n,a,s,o,h){if(!(h<0||l(t,e,r,i,n,a,s,o)<h)){var u=1,c=u/2,f=u-c,p,d=.01;for(p=l(t,e,r,i,n,a,s,o,f);H(p-h)>d;)c/=2,f+=(p<h?1:-1)*c,p=l(t,e,r,i,n,a,s,o,f);return f}}function u(t,e,r,i,n,a,s,o){if(!(W(t,r)<G(n,s)||G(t,r)>W(n,s)||W(e,i)<G(a,o)||G(e,i)>W(a,o))){var l=(t*i-e*r)*(n-s)-(t-r)*(n*o-a*s),h=(t*i-e*r)*(a-o)-(e-i)*(n*o-a*s),u=(t-r)*(a-o)-(e-i)*(n-s);if(u){var c=l/u,f=h/u,p=+c.toFixed(2),d=+f.toFixed(2);if(!(p<+G(t,r).toFixed(2)||p>+W(t,r).toFixed(2)||p<+G(n,s).toFixed(2)||p>+W(n,s).toFixed(2)||d<+G(e,i).toFixed(2)||d>+W(e,i).toFixed(2)||d<+G(a,o).toFixed(2)||d>+W(a,o).toFixed(2)))return{x:c,y:f}}}}function c(t,e){return p(t,e)}function f(t,e){return p(t,e,1)}function p(t,r,i){var n=e.bezierBBox(t),a=e.bezierBBox(r);if(!e.isBBoxIntersect(n,a))return i?0:[];for(var s=l.apply(0,t),o=l.apply(0,r),h=W(~~(s/5),1),c=W(~~(o/5),1),f=[],p=[],d={},g=i?0:[],v=0;v<h+1;v++){var x=e.findDotsAtSegment.apply(e,t.concat(v/h));f.push({x:x.x,y:x.y,t:v/h})}for(v=0;v<c+1;v++)x=e.findDotsAtSegment.apply(e,r.concat(v/c)),p.push({x:x.x,y:x.y,t:v/c});for(v=0;v<h;v++)for(var y=0;y<c;y++){var m=f[v],b=f[v+1],_=p[y],w=p[y+1],k=H(b.x-m.x)<.001?"y":"x",B=H(w.x-_.x)<.001?"y":"x",C=u(m.x,m.y,b.x,b.y,_.x,_.y,w.x,w.y);if(C){if(d[C.x.toFixed(4)]==C.y.toFixed(4))continue;d[C.x.toFixed(4)]=C.y.toFixed(4);var S=m.t+H((C[k]-m[k])/(b[k]-m[k]))*(b.t-m.t),A=_.t+H((C[B]-_[B])/(w[B]-_[B]))*(w.t-_.t);S>=0&&S<=1.001&&A>=0&&A<=1.001&&(i?g++:g.push({x:C.x,y:C.y,t1:G(S,1),t2:G(A,1)}))}}return g}function d(t,r,i){t=e._path2curve(t),r=e._path2curve(r);for(var n,a,s,o,l,h,u,c,f,d,g=i?0:[],v=0,x=t.length;v<x;v++){var y=t[v];if("M"==y[0])n=l=y[1],a=h=y[2];else{"C"==y[0]?(f=[n,a].concat(y.slice(1)),n=f[6],a=f[7]):(f=[n,a,n,a,l,h,l,h],n=l,a=h);for(var m=0,b=r.length;m<b;m++){var _=r[m];if("M"==_[0])s=u=_[1],o=c=_[2];else{"C"==_[0]?(d=[s,o].concat(_.slice(1)),s=d[6],o=d[7]):(d=[s,o,s,o,u,c,u,c],s=u,o=c);var w=p(f,d,i);if(i)g+=w;else{for(var k=0,B=w.length;k<B;k++)w[k].segment1=v,w[k].segment2=m,w[k].bez1=f,w[k].bez2=d;g=g.concat(w)}}}}}return g}function g(t,e,r,i,n,a){null!=t?(this.a=+t,this.b=+e,this.c=+r,this.d=+i,this.e=+n,this.f=+a):(this.a=1,this.b=0,this.c=0,this.d=1,this.e=0,this.f=0)}function v(){return this.x+j+this.y}function x(){return this.x+j+this.y+j+this.width+" × "+this.height}function y(t,e,r,i,n,a){function s(t){return((c*t+u)*t+h)*t}function o(t,e){var r=l(t,e);return((d*r+p)*r+f)*r}function l(t,e){var r,i,n,a,o,l;for(n=t,l=0;l<8;l++){if(a=s(n)-t,H(a)<e)return n;if(o=(3*c*n+2*u)*n+h,H(o)<1e-6)break;n-=a/o}if(r=0,i=1,n=t,n<r)return r;if(n>i)return i;for(;r<i;){if(a=s(n),H(a-t)<e)return n;t>a?r=n:i=n,n=(i-r)/2+r}return n}var h=3*e,u=3*(i-e)-h,c=1-h-u,f=3*r,p=3*(n-r)-f,d=1-f-p;return o(t,1/(200*a))}function m(t,e){var r=[],i={};if(this.ms=e,this.times=1,t){for(var n in t)t[A](n)&&(i[ht(n)]=t[n],r.push(ht(n)));r.sort(Bt)}this.anim=i,this.top=r[r.length-1],this.percents=r}function b(r,i,n,a,s,o){n=ht(n);var l,h,u,c=[],f,p,d,v=r.ms,x={},m={},b={};if(a)for(w=0,B=Ee.length;w<B;w++){var _=Ee[w];if(_.el.id==i.id&&_.anim==r){_.percent!=n?(Ee.splice(w,1),u=1):h=_,i.attr(_.totalOrigin);break}}else a=+m;for(var w=0,B=r.percents.length;w<B;w++){if(r.percents[w]==n||r.percents[w]>a*r.top){n=r.percents[w],p=r.percents[w-1]||0,v=v/r.top*(n-p),f=r.percents[w+1],l=r.anim[n];break}a&&i.attr(r.anim[r.percents[w]])}if(l){if(h)h.initstatus=a,h.start=new Date-h.ms*a;else{for(var C in l)if(l[A](C)&&(pt[A](C)||i.paper.customAttributes[A](C)))switch(x[C]=i.attr(C),null==x[C]&&(x[C]=ft[C]),m[C]=l[C],pt[C]){case $:b[C]=(m[C]-x[C])/v;break;case"colour":x[C]=e.getRGB(x[C]);var S=e.getRGB(m[C]);b[C]={r:(S.r-x[C].r)/v,g:(S.g-x[C].g)/v,b:(S.b-x[C].b)/v};break;case"path":var T=Qt(x[C],m[C]),E=T[1];for(x[C]=T[0],b[C]=[],w=0,B=x[C].length;w<B;w++){b[C][w]=[0];for(var M=1,N=x[C][w].length;M<N;M++)b[C][w][M]=(E[w][M]-x[C][w][M])/v}break;case"transform":var L=i._,z=le(L[C],m[C]);if(z)for(x[C]=z.from,m[C]=z.to,b[C]=[],b[C].real=!0,w=0,B=x[C].length;w<B;w++)for(b[C][w]=[x[C][w][0]],M=1,N=x[C][w].length;M<N;M++)b[C][w][M]=(m[C][w][M]-x[C][w][M])/v;else{var F=i.matrix||new g,R={_:{transform:L.transform},getBBox:function(){return i.getBBox(1)}};x[C]=[F.a,F.b,F.c,F.d,F.e,F.f],se(R,m[C]),m[C]=R._.transform,b[C]=[(R.matrix.a-F.a)/v,(R.matrix.b-F.b)/v,(R.matrix.c-F.c)/v,(R.matrix.d-F.d)/v,(R.matrix.e-F.e)/v,(R.matrix.f-F.f)/v]}break;case"csv":var j=I(l[C])[q](k),D=I(x[C])[q](k);if("clip-rect"==C)for(x[C]=D,b[C]=[],w=D.length;w--;)b[C][w]=(j[w]-x[C][w])/v;m[C]=j;break;default:for(j=[][P](l[C]),D=[][P](x[C]),b[C]=[],w=i.paper.customAttributes[C].length;w--;)b[C][w]=((j[w]||0)-(D[w]||0))/v}var V=l.easing,O=e.easing_formulas[V];if(!O)if(O=I(V).match(st),O&&5==O.length){var Y=O;O=function(t){return y(t,+Y[1],+Y[2],+Y[3],+Y[4],v)}}else O=St;if(d=l.start||r.start||+new Date,_={anim:r,percent:n,timestamp:d,start:d+(r.del||0),status:0,initstatus:a||0,stop:!1,ms:v,easing:O,from:x,diff:b,to:m,el:i,callback:l.callback,prev:p,next:f,repeat:o||r.times,origin:i.attr(),totalOrigin:s},Ee.push(_),a&&!h&&!u&&(_.stop=!0,_.start=new Date-v*a,1==Ee.length))return Ne();u&&(_.start=new Date-_.ms*a),1==Ee.length&&Me(Ne)}t("raphael.anim.start."+i.id,i,r)}}function _(t){for(var e=0;e<Ee.length;e++)Ee[e].el.paper==t&&Ee.splice(e--,1)}e.version="2.2.0",e.eve=t;var w,k=/[, ]+/,B={circle:1,rect:1,path:1,ellipse:1,text:1,image:1},C=/\{(\d+)\}/g,S="prototype",A="hasOwnProperty",T={doc:document,win:window},E={was:Object.prototype[A].call(T.win,"Raphael"),is:T.win.Raphael},M=function(){this.ca=this.customAttributes={}},N,L="appendChild",z="apply",P="concat",F="ontouchstart"in T.win||T.win.DocumentTouch&&T.doc instanceof DocumentTouch,R="",j=" ",I=String,q="split",D="click dblclick mousedown mousemove mouseout mouseover mouseup touchstart touchmove touchend touchcancel"[q](j),V={mousedown:"touchstart",mousemove:"touchmove",mouseup:"touchend"},O=I.prototype.toLowerCase,Y=Math,W=Y.max,G=Y.min,H=Y.abs,X=Y.pow,U=Y.PI,$="number",Z="string",Q="array",J="toString",K="fill",tt=Object.prototype.toString,et={},rt="push",it=e._ISURL=/^url\(['"]?(.+?)['"]?\)$/i,nt=/^\s*((#[a-f\d]{6})|(#[a-f\d]{3})|rgba?\(\s*([\d\.]+%?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+%?(?:\s*,\s*[\d\.]+%?)?)\s*\)|hsba?\(\s*([\d\.]+(?:deg|\xb0|%)?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+(?:%?\s*,\s*[\d\.]+)?)%?\s*\)|hsla?\(\s*([\d\.]+(?:deg|\xb0|%)?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+(?:%?\s*,\s*[\d\.]+)?)%?\s*\))\s*$/i,at={NaN:1,Infinity:1,"-Infinity":1},st=/^(?:cubic-)?bezier\(([^,]+),([^,]+),([^,]+),([^\)]+)\)/,ot=Y.round,lt="setAttribute",ht=parseFloat,ut=parseInt,ct=I.prototype.toUpperCase,ft=e._availableAttrs={"arrow-end":"none","arrow-start":"none",blur:0,"clip-rect":"0 0 1e9 1e9",cursor:"default",cx:0,cy:0,fill:"#fff","fill-opacity":1,font:'10px "Arial"',"font-family":'"Arial"',"font-size":"10","font-style":"normal","font-weight":400,gradient:0,height:0,href:"http://raphaeljs.com/","letter-spacing":0,opacity:1,path:"M0,0",r:0,rx:0,ry:0,src:"",stroke:"#000","stroke-dasharray":"","stroke-linecap":"butt","stroke-linejoin":"butt","stroke-miterlimit":0,"stroke-opacity":1,"stroke-width":1,target:"_blank","text-anchor":"middle",title:"Raphael",transform:"",width:0,x:0,y:0,"class":""},pt=e._availableAnimAttrs={blur:$,"clip-rect":"csv",cx:$,cy:$,fill:"colour","fill-opacity":$,"font-size":$,height:$,opacity:$,path:"path",r:$,rx:$,ry:$,stroke:"colour","stroke-opacity":$,"stroke-width":$,transform:"transform",width:$,x:$,y:$},dt=/[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]/g,gt=/[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*/,vt={hs:1,rg:1},xt=/,?([achlmqrstvxz]),?/gi,yt=/([achlmrqstvz])[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029,]*((-?\d*\.?\d*(?:e[\-+]?\d+)?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*)+)/gi,mt=/([rstm])[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029,]*((-?\d*\.?\d*(?:e[\-+]?\d+)?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*)+)/gi,bt=/(-?\d*\.?\d*(?:e[\-+]?\d+)?)[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*/gi,_t=e._radial_gradient=/^r(?:\(([^,]+?)[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*([^\)]+?)\))?/,wt={},kt=function(t,e){return t.key-e.key},Bt=function(t,e){return ht(t)-ht(e)},Ct=function(){},St=function(t){return t},At=e._rectPath=function(t,e,r,i,n){return n?[["M",t+n,e],["l",r-2*n,0],["a",n,n,0,0,1,n,n],["l",0,i-2*n],["a",n,n,0,0,1,-n,n],["l",2*n-r,0],["a",n,n,0,0,1,-n,-n],["l",0,2*n-i],["a",n,n,0,0,1,n,-n],["z"]]:[["M",t,e],["l",r,0],["l",0,i],["l",-r,0],["z"]]},Tt=function(t,e,r,i){return null==i&&(i=r),[["M",t,e],["m",0,-i],["a",r,i,0,1,1,0,2*i],["a",r,i,0,1,1,0,-2*i],["z"]]},Et=e._getPath={path:function(t){return t.attr("path")},circle:function(t){var e=t.attrs;return Tt(e.cx,e.cy,e.r)},ellipse:function(t){var e=t.attrs;return Tt(e.cx,e.cy,e.rx,e.ry)},rect:function(t){var e=t.attrs;return At(e.x,e.y,e.width,e.height,e.r)},image:function(t){var e=t.attrs;return At(e.x,e.y,e.width,e.height)},text:function(t){var e=t._getBBox();return At(e.x,e.y,e.width,e.height)},set:function(t){var e=t._getBBox();return At(e.x,e.y,e.width,e.height)}},Mt=e.mapPath=function(t,e){if(!e)return t;var r,i,n,a,s,o,l;for(t=Qt(t),n=0,s=t.length;n<s;n++)for(l=t[n],a=1,o=l.length;a<o;a+=2)r=e.x(l[a],l[a+1]),i=e.y(l[a],l[a+1]),l[a]=r,l[a+1]=i;return t};if(e._g=T,e.type=T.win.SVGAngle||T.doc.implementation.hasFeature("http://www.w3.org/TR/SVG11/feature#BasicStructure","1.1")?"SVG":"VML","VML"==e.type){var Nt=T.doc.createElement("div"),Lt;if(Nt.innerHTML='<v:shape adj="1"/>',Lt=Nt.firstChild,Lt.style.behavior="url(#default#VML)",!Lt||"object"!=typeof Lt.adj)return e.type=R;Nt=null}e.svg=!(e.vml="VML"==e.type),e._Paper=M,e.fn=N=M.prototype=e.prototype,e._id=0,e.is=function(t,e){return e=O.call(e),"finite"==e?!at[A](+t):"array"==e?t instanceof Array:"null"==e&&null===t||e==typeof t&&null!==t||"object"==e&&t===Object(t)||"array"==e&&Array.isArray&&Array.isArray(t)||tt.call(t).slice(8,-1).toLowerCase()==e},e.angle=function(t,r,i,n,a,s){if(null==a){var o=t-i,l=r-n;return o||l?(180+180*Y.atan2(-l,-o)/U+360)%360:0}return e.angle(t,r,a,s)-e.angle(i,n,a,s)},e.rad=function(t){return t%360*U/180},e.deg=function(t){return Math.round(180*t/U%360*1e3)/1e3},e.snapTo=function(t,r,i){if(i=e.is(i,"finite")?i:10,e.is(t,Q)){for(var n=t.length;n--;)if(H(t[n]-r)<=i)return t[n]}else{t=+t;var a=r%t;if(a<i)return r-a;if(a>t-i)return r-a+t}return r};var zt=e.createUUID=function(t,e){return function(){return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(t,e).toUpperCase()}}(/[xy]/g,function(t){var e=16*Y.random()|0,r="x"==t?e:3&e|8;return r.toString(16)});e.setWindow=function(r){t("raphael.setWindow",e,T.win,r),T.win=r,T.doc=T.win.document,e._engine.initWin&&e._engine.initWin(T.win)};var Pt=function(t){if(e.vml){var r=/^\s+|\s+$/g,i;try{var a=new ActiveXObject("htmlfile");a.write("<body>"),a.close(),i=a.body}catch(s){i=createPopup().document.body}var o=i.createTextRange();Pt=n(function(t){try{i.style.color=I(t).replace(r,R);var e=o.queryCommandValue("ForeColor");return e=(255&e)<<16|65280&e|(16711680&e)>>>16,"#"+("000000"+e.toString(16)).slice(-6)}catch(n){return"none"}})}else{var l=T.doc.createElement("i");l.title="Raphaël Colour Picker",l.style.display="none",T.doc.body.appendChild(l),Pt=n(function(t){return l.style.color=t,T.doc.defaultView.getComputedStyle(l,R).getPropertyValue("color")})}return Pt(t)},Ft=function(){return"hsb("+[this.h,this.s,this.b]+")"},Rt=function(){return"hsl("+[this.h,this.s,this.l]+")"},jt=function(){return this.hex},It=function(t,r,i){if(null==r&&e.is(t,"object")&&"r"in t&&"g"in t&&"b"in t&&(i=t.b,r=t.g,t=t.r),null==r&&e.is(t,Z)){var n=e.getRGB(t);t=n.r,r=n.g,i=n.b}return(t>1||r>1||i>1)&&(t/=255,r/=255,i/=255),[t,r,i]},qt=function(t,r,i,n){t*=255,r*=255,i*=255;var a={r:t,g:r,b:i,hex:e.rgb(t,r,i),toString:jt};return e.is(n,"finite")&&(a.opacity=n),a};e.color=function(t){var r;return e.is(t,"object")&&"h"in t&&"s"in t&&"b"in t?(r=e.hsb2rgb(t),t.r=r.r,t.g=r.g,t.b=r.b,t.hex=r.hex):e.is(t,"object")&&"h"in t&&"s"in t&&"l"in t?(r=e.hsl2rgb(t),t.r=r.r,t.g=r.g,t.b=r.b,t.hex=r.hex):(e.is(t,"string")&&(t=e.getRGB(t)),e.is(t,"object")&&"r"in t&&"g"in t&&"b"in t?(r=e.rgb2hsl(t),t.h=r.h,t.s=r.s,t.l=r.l,r=e.rgb2hsb(t),t.v=r.b):(t={hex:"none"},t.r=t.g=t.b=t.h=t.s=t.v=t.l=-1)),t.toString=jt,t},e.hsb2rgb=function(t,e,r,i){this.is(t,"object")&&"h"in t&&"s"in t&&"b"in t&&(r=t.b,e=t.s,i=t.o,t=t.h),t*=360;var n,a,s,o,l;return t=t%360/60,l=r*e,o=l*(1-H(t%2-1)),n=a=s=r-l,t=~~t,n+=[l,o,0,0,o,l][t],a+=[o,l,l,o,0,0][t],s+=[0,0,o,l,l,o][t],qt(n,a,s,i)},e.hsl2rgb=function(t,e,r,i){this.is(t,"object")&&"h"in t&&"s"in t&&"l"in t&&(r=t.l,e=t.s,t=t.h),(t>1||e>1||r>1)&&(t/=360,e/=100,r/=100),t*=360;var n,a,s,o,l;return t=t%360/60,l=2*e*(r<.5?r:1-r),o=l*(1-H(t%2-1)),n=a=s=r-l/2,t=~~t,n+=[l,o,0,0,o,l][t],a+=[o,l,l,o,0,0][t],s+=[0,0,o,l,l,o][t],qt(n,a,s,i)},e.rgb2hsb=function(t,e,r){r=It(t,e,r),t=r[0],e=r[1],r=r[2];var i,n,a,s;return a=W(t,e,r),s=a-G(t,e,r),i=0==s?null:a==t?(e-r)/s:a==e?(r-t)/s+2:(t-e)/s+4,i=(i+360)%6*60/360,n=0==s?0:s/a,{h:i,s:n,b:a,toString:Ft}},e.rgb2hsl=function(t,e,r){r=It(t,e,r),t=r[0],e=r[1],r=r[2];var i,n,a,s,o,l;return s=W(t,e,r),o=G(t,e,r),l=s-o,i=0==l?null:s==t?(e-r)/l:s==e?(r-t)/l+2:(t-e)/l+4,i=(i+360)%6*60/360,a=(s+o)/2,n=0==l?0:a<.5?l/(2*a):l/(2-2*a),{h:i,s:n,l:a,toString:Rt}},e._path2string=function(){return this.join(",").replace(xt,"$1")};var Dt=e._preload=function(t,e){var r=T.doc.createElement("img");r.style.cssText="position:absolute;left:-9999em;top:-9999em",r.onload=function(){e.call(this),this.onload=null,T.doc.body.removeChild(this)},r.onerror=function(){T.doc.body.removeChild(this)},T.doc.body.appendChild(r),r.src=t};e.getRGB=n(function(t){if(!t||(t=I(t)).indexOf("-")+1)return{r:-1,g:-1,b:-1,hex:"none",error:1,toString:a};if("none"==t)return{r:-1,g:-1,b:-1,hex:"none",toString:a};!(vt[A](t.toLowerCase().substring(0,2))||"#"==t.charAt())&&(t=Pt(t));var r,i,n,s,o,l,h,u=t.match(nt);return u?(u[2]&&(s=ut(u[2].substring(5),16),n=ut(u[2].substring(3,5),16),i=ut(u[2].substring(1,3),16)),u[3]&&(s=ut((l=u[3].charAt(3))+l,16),n=ut((l=u[3].charAt(2))+l,16),i=ut((l=u[3].charAt(1))+l,16)),u[4]&&(h=u[4][q](gt),i=ht(h[0]),"%"==h[0].slice(-1)&&(i*=2.55),n=ht(h[1]),"%"==h[1].slice(-1)&&(n*=2.55),s=ht(h[2]),"%"==h[2].slice(-1)&&(s*=2.55),"rgba"==u[1].toLowerCase().slice(0,4)&&(o=ht(h[3])),h[3]&&"%"==h[3].slice(-1)&&(o/=100)),u[5]?(h=u[5][q](gt),i=ht(h[0]),"%"==h[0].slice(-1)&&(i*=2.55),n=ht(h[1]),"%"==h[1].slice(-1)&&(n*=2.55),s=ht(h[2]),"%"==h[2].slice(-1)&&(s*=2.55),("deg"==h[0].slice(-3)||"°"==h[0].slice(-1))&&(i/=360),"hsba"==u[1].toLowerCase().slice(0,4)&&(o=ht(h[3])),h[3]&&"%"==h[3].slice(-1)&&(o/=100),e.hsb2rgb(i,n,s,o)):u[6]?(h=u[6][q](gt),i=ht(h[0]),"%"==h[0].slice(-1)&&(i*=2.55),n=ht(h[1]),"%"==h[1].slice(-1)&&(n*=2.55),s=ht(h[2]),"%"==h[2].slice(-1)&&(s*=2.55),("deg"==h[0].slice(-3)||"°"==h[0].slice(-1))&&(i/=360),"hsla"==u[1].toLowerCase().slice(0,4)&&(o=ht(h[3])),h[3]&&"%"==h[3].slice(-1)&&(o/=100),e.hsl2rgb(i,n,s,o)):(u={r:i,g:n,b:s,toString:a},u.hex="#"+(16777216|s|n<<8|i<<16).toString(16).slice(1),e.is(o,"finite")&&(u.opacity=o),u)):{r:-1,g:-1,b:-1,hex:"none",error:1,toString:a}},e),e.hsb=n(function(t,r,i){return e.hsb2rgb(t,r,i).hex}),e.hsl=n(function(t,r,i){return e.hsl2rgb(t,r,i).hex}),e.rgb=n(function(t,e,r){function i(t){return t+.5|0}return"#"+(16777216|i(r)|i(e)<<8|i(t)<<16).toString(16).slice(1)}),e.getColor=function(t){var e=this.getColor.start=this.getColor.start||{h:0,s:1,b:t||.75},r=this.hsb2rgb(e.h,e.s,e.b);return e.h+=.075,e.h>1&&(e.h=0,e.s-=.2,e.s<=0&&(this.getColor.start={h:0,s:1,b:e.b})),r.hex},e.getColor.reset=function(){delete this.start},e.parsePathString=function(t){if(!t)return null;var r=Vt(t);if(r.arr)return Yt(r.arr);var i={a:7,c:6,h:1,l:2,m:2,r:4,q:4,s:4,t:2,v:1,z:0},n=[];return e.is(t,Q)&&e.is(t[0],Q)&&(n=Yt(t)),n.length||I(t).replace(yt,function(t,e,r){var a=[],s=e.toLowerCase();if(r.replace(bt,function(t,e){e&&a.push(+e)}),"m"==s&&a.length>2&&(n.push([e][P](a.splice(0,2))),s="l",e="m"==e?"l":"L"),"r"==s)n.push([e][P](a));else for(;a.length>=i[s]&&(n.push([e][P](a.splice(0,i[s]))),i[s]););}),n.toString=e._path2string,r.arr=Yt(n),n},e.parseTransformString=n(function(t){if(!t)return null;var r={r:3,s:4,t:2,m:6},i=[];return e.is(t,Q)&&e.is(t[0],Q)&&(i=Yt(t)),i.length||I(t).replace(mt,function(t,e,r){var n=[],a=O.call(e);r.replace(bt,function(t,e){e&&n.push(+e)}),i.push([e][P](n))}),i.toString=e._path2string,i});var Vt=function(t){var e=Vt.ps=Vt.ps||{};return e[t]?e[t].sleep=100:e[t]={sleep:100},setTimeout(function(){for(var r in e)e[A](r)&&r!=t&&(e[r].sleep--,!e[r].sleep&&delete e[r])}),e[t]};e.findDotsAtSegment=function(t,e,r,i,n,a,s,o,l){var h=1-l,u=X(h,3),c=X(h,2),f=l*l,p=f*l,d=u*t+3*c*l*r+3*h*l*l*n+p*s,g=u*e+3*c*l*i+3*h*l*l*a+p*o,v=t+2*l*(r-t)+f*(n-2*r+t),x=e+2*l*(i-e)+f*(a-2*i+e),y=r+2*l*(n-r)+f*(s-2*n+r),m=i+2*l*(a-i)+f*(o-2*a+i),b=h*t+l*r,_=h*e+l*i,w=h*n+l*s,k=h*a+l*o,B=90-180*Y.atan2(v-y,x-m)/U;return(v>y||x<m)&&(B+=180),{x:d,y:g,m:{x:v,y:x},n:{x:y,y:m},start:{x:b,y:_},end:{x:w,y:k},alpha:B}},e.bezierBBox=function(t,r,i,n,a,s,o,l){e.is(t,"array")||(t=[t,r,i,n,a,s,o,l]);var h=Zt.apply(null,t);return{x:h.min.x,y:h.min.y,x2:h.max.x,y2:h.max.y,width:h.max.x-h.min.x,height:h.max.y-h.min.y}},e.isPointInsideBBox=function(t,e,r){return e>=t.x&&e<=t.x2&&r>=t.y&&r<=t.y2},e.isBBoxIntersect=function(t,r){var i=e.isPointInsideBBox;return i(r,t.x,t.y)||i(r,t.x2,t.y)||i(r,t.x,t.y2)||i(r,t.x2,t.y2)||i(t,r.x,r.y)||i(t,r.x2,r.y)||i(t,r.x,r.y2)||i(t,r.x2,r.y2)||(t.x<r.x2&&t.x>r.x||r.x<t.x2&&r.x>t.x)&&(t.y<r.y2&&t.y>r.y||r.y<t.y2&&r.y>t.y)},e.pathIntersection=function(t,e){return d(t,e)},e.pathIntersectionNumber=function(t,e){return d(t,e,1)},e.isPointInsidePath=function(t,r,i){var n=e.pathBBox(t);return e.isPointInsideBBox(n,r,i)&&d(t,[["M",r,i],["H",n.x2+10]],1)%2==1},e._removedFactory=function(e){return function(){t("raphael.log",null,"Raphaël: you are calling to method “"+e+"” of removed object",e)}};var Ot=e.pathBBox=function(t){var e=Vt(t);if(e.bbox)return r(e.bbox);if(!t)return{x:0,y:0,width:0,height:0,x2:0,y2:0};t=Qt(t);for(var i=0,n=0,a=[],s=[],o,l=0,h=t.length;l<h;l++)if(o=t[l],"M"==o[0])i=o[1],n=o[2],a.push(i),s.push(n);else{var u=Zt(i,n,o[1],o[2],o[3],o[4],o[5],o[6]);a=a[P](u.min.x,u.max.x),s=s[P](u.min.y,u.max.y),i=o[5],n=o[6]}var c=G[z](0,a),f=G[z](0,s),p=W[z](0,a),d=W[z](0,s),g=p-c,v=d-f,x={x:c,y:f,x2:p,y2:d,width:g,height:v,cx:c+g/2,cy:f+v/2};return e.bbox=r(x),x},Yt=function(t){var i=r(t);return i.toString=e._path2string,i},Wt=e._pathToRelative=function(t){var r=Vt(t);if(r.rel)return Yt(r.rel);e.is(t,Q)&&e.is(t&&t[0],Q)||(t=e.parsePathString(t));var i=[],n=0,a=0,s=0,o=0,l=0;"M"==t[0][0]&&(n=t[0][1],a=t[0][2],s=n,o=a,l++,i.push(["M",n,a]));for(var h=l,u=t.length;h<u;h++){var c=i[h]=[],f=t[h];if(f[0]!=O.call(f[0]))switch(c[0]=O.call(f[0]),c[0]){case"a":c[1]=f[1],c[2]=f[2],c[3]=f[3],c[4]=f[4],c[5]=f[5],c[6]=+(f[6]-n).toFixed(3),c[7]=+(f[7]-a).toFixed(3);break;case"v":c[1]=+(f[1]-a).toFixed(3);break;case"m":s=f[1],o=f[2];default:for(var p=1,d=f.length;p<d;p++)c[p]=+(f[p]-(p%2?n:a)).toFixed(3)}else{c=i[h]=[],"m"==f[0]&&(s=f[1]+n,o=f[2]+a);for(var g=0,v=f.length;g<v;g++)i[h][g]=f[g]}var x=i[h].length;switch(i[h][0]){case"z":n=s,a=o;break;case"h":n+=+i[h][x-1];break;case"v":a+=+i[h][x-1];break;default:n+=+i[h][x-2],a+=+i[h][x-1]}}return i.toString=e._path2string,r.rel=Yt(i),i},Gt=e._pathToAbsolute=function(t){var r=Vt(t);if(r.abs)return Yt(r.abs);if(e.is(t,Q)&&e.is(t&&t[0],Q)||(t=e.parsePathString(t)),!t||!t.length)return[["M",0,0]];var i=[],n=0,a=0,o=0,l=0,h=0;"M"==t[0][0]&&(n=+t[0][1],a=+t[0][2],o=n,l=a,h++,i[0]=["M",n,a]);for(var u=3==t.length&&"M"==t[0][0]&&"R"==t[1][0].toUpperCase()&&"Z"==t[2][0].toUpperCase(),c,f,p=h,d=t.length;p<d;p++){if(i.push(c=[]),f=t[p],f[0]!=ct.call(f[0]))switch(c[0]=ct.call(f[0]),c[0]){case"A":c[1]=f[1],c[2]=f[2],c[3]=f[3],c[4]=f[4],c[5]=f[5],c[6]=+(f[6]+n),c[7]=+(f[7]+a);break;case"V":c[1]=+f[1]+a;break;case"H":c[1]=+f[1]+n;break;case"R":for(var g=[n,a][P](f.slice(1)),v=2,x=g.length;v<x;v++)g[v]=+g[v]+n,g[++v]=+g[v]+a;i.pop(),i=i[P](s(g,u));break;case"M":o=+f[1]+n,l=+f[2]+a;default:for(v=1,x=f.length;v<x;v++)c[v]=+f[v]+(v%2?n:a)}else if("R"==f[0])g=[n,a][P](f.slice(1)),i.pop(),i=i[P](s(g,u)),c=["R"][P](f.slice(-2));else for(var y=0,m=f.length;y<m;y++)c[y]=f[y];switch(c[0]){case"Z":n=o,a=l;break;case"H":n=c[1];break;case"V":a=c[1];break;case"M":o=c[c.length-2],l=c[c.length-1];default:n=c[c.length-2],a=c[c.length-1]}}return i.toString=e._path2string,r.abs=Yt(i),i},Ht=function(t,e,r,i){return[t,e,r,i,r,i]},Xt=function(t,e,r,i,n,a){var s=1/3,o=2/3;return[s*t+o*r,s*e+o*i,s*n+o*r,s*a+o*i,n,a]},Ut=function(t,e,r,i,a,s,o,l,h,u){var c=120*U/180,f=U/180*(+a||0),p=[],d,g=n(function(t,e,r){var i=t*Y.cos(r)-e*Y.sin(r),n=t*Y.sin(r)+e*Y.cos(r);return{x:i,y:n}});if(u)S=u[0],A=u[1],B=u[2],C=u[3];else{d=g(t,e,-f),t=d.x,e=d.y,d=g(l,h,-f),l=d.x,h=d.y;var v=Y.cos(U/180*a),x=Y.sin(U/180*a),y=(t-l)/2,m=(e-h)/2,b=y*y/(r*r)+m*m/(i*i);b>1&&(b=Y.sqrt(b),r=b*r,i=b*i);var _=r*r,w=i*i,k=(s==o?-1:1)*Y.sqrt(H((_*w-_*m*m-w*y*y)/(_*m*m+w*y*y))),B=k*r*m/i+(t+l)/2,C=k*-i*y/r+(e+h)/2,S=Y.asin(((e-C)/i).toFixed(9)),A=Y.asin(((h-C)/i).toFixed(9));S=t<B?U-S:S,A=l<B?U-A:A,S<0&&(S=2*U+S),A<0&&(A=2*U+A),o&&S>A&&(S-=2*U),!o&&A>S&&(A-=2*U)}var T=A-S;if(H(T)>c){var E=A,M=l,N=h;A=S+c*(o&&A>S?1:-1),l=B+r*Y.cos(A),h=C+i*Y.sin(A),p=Ut(l,h,r,i,a,0,o,M,N,[A,E,B,C])}T=A-S;var L=Y.cos(S),z=Y.sin(S),F=Y.cos(A),R=Y.sin(A),j=Y.tan(T/4),I=4/3*r*j,D=4/3*i*j,V=[t,e],O=[t+I*z,e-D*L],W=[l+I*R,h-D*F],G=[l,h];if(O[0]=2*V[0]-O[0],O[1]=2*V[1]-O[1],u)return[O,W,G][P](p);p=[O,W,G][P](p).join()[q](",");for(var X=[],$=0,Z=p.length;$<Z;$++)X[$]=$%2?g(p[$-1],p[$],f).y:g(p[$],p[$+1],f).x;return X},$t=function(t,e,r,i,n,a,s,o,l){var h=1-l;return{x:X(h,3)*t+3*X(h,2)*l*r+3*h*l*l*n+X(l,3)*s,y:X(h,3)*e+3*X(h,2)*l*i+3*h*l*l*a+X(l,3)*o}},Zt=n(function(t,e,r,i,n,a,s,o){var l=n-2*r+t-(s-2*n+r),h=2*(r-t)-2*(n-r),u=t-r,c=(-h+Y.sqrt(h*h-4*l*u))/2/l,f=(-h-Y.sqrt(h*h-4*l*u))/2/l,p=[e,o],d=[t,s],g;return H(c)>"1e12"&&(c=.5),H(f)>"1e12"&&(f=.5),c>0&&c<1&&(g=$t(t,e,r,i,n,a,s,o,c),d.push(g.x),p.push(g.y)),f>0&&f<1&&(g=$t(t,e,r,i,n,a,s,o,f),d.push(g.x),p.push(g.y)),l=a-2*i+e-(o-2*a+i),h=2*(i-e)-2*(a-i),u=e-i,c=(-h+Y.sqrt(h*h-4*l*u))/2/l,f=(-h-Y.sqrt(h*h-4*l*u))/2/l,H(c)>"1e12"&&(c=.5),H(f)>"1e12"&&(f=.5),c>0&&c<1&&(g=$t(t,e,r,i,n,a,s,o,c),d.push(g.x),p.push(g.y)),f>0&&f<1&&(g=$t(t,e,r,i,n,a,s,o,f),d.push(g.x),p.push(g.y)),{min:{x:G[z](0,d),y:G[z](0,p)},max:{x:W[z](0,d),y:W[z](0,p)}}}),Qt=e._path2curve=n(function(t,e){var r=!e&&Vt(t);if(!e&&r.curve)return Yt(r.curve);for(var i=Gt(t),n=e&&Gt(e),a={x:0,y:0,bx:0,by:0,X:0,Y:0,qx:null,qy:null},s={x:0,y:0,bx:0,by:0,X:0,Y:0,qx:null,qy:null},o=(function(t,e,r){var i,n,a={T:1,Q:1};if(!t)return["C",e.x,e.y,e.x,e.y,e.x,e.y];switch(!(t[0]in a)&&(e.qx=e.qy=null),t[0]){case"M":e.X=t[1],e.Y=t[2];break;case"A":t=["C"][P](Ut[z](0,[e.x,e.y][P](t.slice(1))));break;case"S":"C"==r||"S"==r?(i=2*e.x-e.bx,n=2*e.y-e.by):(i=e.x,n=e.y),t=["C",i,n][P](t.slice(1));break;case"T":"Q"==r||"T"==r?(e.qx=2*e.x-e.qx,e.qy=2*e.y-e.qy):(e.qx=e.x,e.qy=e.y),t=["C"][P](Xt(e.x,e.y,e.qx,e.qy,t[1],t[2]));break;case"Q":e.qx=t[1],e.qy=t[2],t=["C"][P](Xt(e.x,e.y,t[1],t[2],t[3],t[4]));break;case"L":t=["C"][P](Ht(e.x,e.y,t[1],t[2]));break;case"H":t=["C"][P](Ht(e.x,e.y,t[1],e.y));break;case"V":t=["C"][P](Ht(e.x,e.y,e.x,t[1]));break;case"Z":t=["C"][P](Ht(e.x,e.y,e.X,e.Y))}return t}),l=function(t,e){if(t[e].length>7){t[e].shift();for(var r=t[e];r.length;)u[e]="A",n&&(c[e]="A"),t.splice(e++,0,["C"][P](r.splice(0,6)));t.splice(e,1),g=W(i.length,n&&n.length||0)}},h=function(t,e,r,a,s){t&&e&&"M"==t[s][0]&&"M"!=e[s][0]&&(e.splice(s,0,["M",a.x,a.y]),r.bx=0,r.by=0,r.x=t[s][1],r.y=t[s][2],g=W(i.length,n&&n.length||0))},u=[],c=[],f="",p="",d=0,g=W(i.length,n&&n.length||0);d<g;d++){i[d]&&(f=i[d][0]),"C"!=f&&(u[d]=f,d&&(p=u[d-1])),i[d]=o(i[d],a,p),"A"!=u[d]&&"C"==f&&(u[d]="C"),l(i,d),n&&(n[d]&&(f=n[d][0]),"C"!=f&&(c[d]=f,d&&(p=c[d-1])),n[d]=o(n[d],s,p),"A"!=c[d]&&"C"==f&&(c[d]="C"),l(n,d)),h(i,n,a,s,d),h(n,i,s,a,d);var v=i[d],x=n&&n[d],y=v.length,m=n&&x.length;a.x=v[y-2],a.y=v[y-1],a.bx=ht(v[y-4])||a.x,a.by=ht(v[y-3])||a.y,s.bx=n&&(ht(x[m-4])||s.x),s.by=n&&(ht(x[m-3])||s.y),s.x=n&&x[m-2],s.y=n&&x[m-1]}return n||(r.curve=Yt(i)),n?[i,n]:i},null,Yt),Jt=e._parseDots=n(function(t){for(var r=[],i=0,n=t.length;i<n;i++){var a={},s=t[i].match(/^([^:]*):?([\d\.]*)/);if(a.color=e.getRGB(s[1]),a.color.error)return null;a.opacity=a.color.opacity,a.color=a.color.hex,s[2]&&(a.offset=s[2]+"%"),r.push(a)}for(i=1,n=r.length-1;i<n;i++)if(!r[i].offset){for(var o=ht(r[i-1].offset||0),l=0,h=i+1;h<n;h++)if(r[h].offset){l=r[h].offset;break}l||(l=100,h=n),l=ht(l);for(var u=(l-o)/(h-i+1);i<h;i++)o+=u,r[i].offset=o+"%"}return r}),Kt=e._tear=function(t,e){t==e.top&&(e.top=t.prev),t==e.bottom&&(e.bottom=t.next),t.next&&(t.next.prev=t.prev),t.prev&&(t.prev.next=t.next)},te=e._tofront=function(t,e){e.top!==t&&(Kt(t,e),t.next=null,t.prev=e.top,e.top.next=t,e.top=t)},ee=e._toback=function(t,e){e.bottom!==t&&(Kt(t,e),t.next=e.bottom,t.prev=null,e.bottom.prev=t,e.bottom=t)},re=e._insertafter=function(t,e,r){Kt(t,r),e==r.top&&(r.top=t),e.next&&(e.next.prev=t),t.next=e.next,t.prev=e,e.next=t},ie=e._insertbefore=function(t,e,r){Kt(t,r),e==r.bottom&&(r.bottom=t),e.prev&&(e.prev.next=t),t.prev=e.prev,e.prev=t,t.next=e},ne=e.toMatrix=function(t,e){var r=Ot(t),i={_:{transform:R},getBBox:function(){return r}};return se(i,e),i.matrix},ae=e.transformPath=function(t,e){return Mt(t,ne(t,e))},se=e._extractTransform=function(t,r){if(null==r)return t._.transform;r=I(r).replace(/\.{3}|\u2026/g,t._.transform||R);var i=e.parseTransformString(r),n=0,a=0,s=0,o=1,l=1,h=t._,u=new g;if(h.transform=i||[],i)for(var c=0,f=i.length;c<f;c++){var p=i[c],d=p.length,v=I(p[0]).toLowerCase(),x=p[0]!=v,y=x?u.invert():0,m,b,_,w,k;"t"==v&&3==d?x?(m=y.x(0,0),b=y.y(0,0),_=y.x(p[1],p[2]),w=y.y(p[1],p[2]),u.translate(_-m,w-b)):u.translate(p[1],p[2]):"r"==v?2==d?(k=k||t.getBBox(1),u.rotate(p[1],k.x+k.width/2,k.y+k.height/2),n+=p[1]):4==d&&(x?(_=y.x(p[2],p[3]),w=y.y(p[2],p[3]),u.rotate(p[1],_,w)):u.rotate(p[1],p[2],p[3]),n+=p[1]):"s"==v?2==d||3==d?(k=k||t.getBBox(1),u.scale(p[1],p[d-1],k.x+k.width/2,k.y+k.height/2),o*=p[1],l*=p[d-1]):5==d&&(x?(_=y.x(p[3],p[4]),w=y.y(p[3],p[4]),u.scale(p[1],p[2],_,w)):u.scale(p[1],p[2],p[3],p[4]),o*=p[1],l*=p[2]):"m"==v&&7==d&&u.add(p[1],p[2],p[3],p[4],p[5],p[6]),h.dirtyT=1,t.matrix=u}t.matrix=u,h.sx=o,h.sy=l,h.deg=n,h.dx=a=u.e,h.dy=s=u.f,1==o&&1==l&&!n&&h.bbox?(h.bbox.x+=+a,h.bbox.y+=+s):h.dirtyT=1},oe=function(t){var e=t[0];switch(e.toLowerCase()){case"t":return[e,0,0];case"m":return[e,1,0,0,1,0,0];case"r":return 4==t.length?[e,0,t[2],t[3]]:[e,0];case"s":return 5==t.length?[e,1,1,t[3],t[4]]:3==t.length?[e,1,1]:[e,1]}},le=e._equaliseTransform=function(t,r){r=I(r).replace(/\.{3}|\u2026/g,t),t=e.parseTransformString(t)||[],r=e.parseTransformString(r)||[];for(var i=W(t.length,r.length),n=[],a=[],s=0,o,l,h,u;s<i;s++){if(h=t[s]||oe(r[s]),u=r[s]||oe(h),h[0]!=u[0]||"r"==h[0].toLowerCase()&&(h[2]!=u[2]||h[3]!=u[3])||"s"==h[0].toLowerCase()&&(h[3]!=u[3]||h[4]!=u[4]))return;for(n[s]=[],a[s]=[],o=0,l=W(h.length,u.length);o<l;o++)o in h&&(n[s][o]=h[o]),o in u&&(a[s][o]=u[o])}return{from:n,to:a}};e._getContainer=function(t,r,i,n){var a;if(a=null!=n||e.is(t,"object")?t:T.doc.getElementById(t),null!=a)return a.tagName?null==r?{container:a,width:a.style.pixelWidth||a.offsetWidth,height:a.style.pixelHeight||a.offsetHeight}:{container:a,width:r,height:i}:{container:1,x:t,y:r,width:i,height:n}},e.pathToRelative=Wt,e._engine={},e.path2curve=Qt,e.matrix=function(t,e,r,i,n,a){return new g(t,e,r,i,n,a)},function(t){function r(t){return t[0]*t[0]+t[1]*t[1]}function i(t){var e=Y.sqrt(r(t));t[0]&&(t[0]/=e),t[1]&&(t[1]/=e)}t.add=function(t,e,r,i,n,a){var s=[[],[],[]],o=[[this.a,this.c,this.e],[this.b,this.d,this.f],[0,0,1]],l=[[t,r,n],[e,i,a],[0,0,1]],h,u,c,f;for(t&&t instanceof g&&(l=[[t.a,t.c,t.e],[t.b,t.d,t.f],[0,0,1]]),h=0;h<3;h++)for(u=0;u<3;u++){for(f=0,c=0;c<3;c++)f+=o[h][c]*l[c][u];s[h][u]=f}this.a=s[0][0],this.b=s[1][0],this.c=s[0][1],this.d=s[1][1],this.e=s[0][2],this.f=s[1][2]},t.invert=function(){var t=this,e=t.a*t.d-t.b*t.c;return new g(t.d/e,-t.b/e,-t.c/e,t.a/e,(t.c*t.f-t.d*t.e)/e,(t.b*t.e-t.a*t.f)/e)},t.clone=function(){return new g(this.a,this.b,this.c,this.d,this.e,this.f)},t.translate=function(t,e){
this.add(1,0,0,1,t,e)},t.scale=function(t,e,r,i){null==e&&(e=t),(r||i)&&this.add(1,0,0,1,r,i),this.add(t,0,0,e,0,0),(r||i)&&this.add(1,0,0,1,-r,-i)},t.rotate=function(t,r,i){t=e.rad(t),r=r||0,i=i||0;var n=+Y.cos(t).toFixed(9),a=+Y.sin(t).toFixed(9);this.add(n,a,-a,n,r,i),this.add(1,0,0,1,-r,-i)},t.x=function(t,e){return t*this.a+e*this.c+this.e},t.y=function(t,e){return t*this.b+e*this.d+this.f},t.get=function(t){return+this[I.fromCharCode(97+t)].toFixed(4)},t.toString=function(){return e.svg?"matrix("+[this.get(0),this.get(1),this.get(2),this.get(3),this.get(4),this.get(5)].join()+")":[this.get(0),this.get(2),this.get(1),this.get(3),0,0].join()},t.toFilter=function(){return"progid:DXImageTransform.Microsoft.Matrix(M11="+this.get(0)+", M12="+this.get(2)+", M21="+this.get(1)+", M22="+this.get(3)+", Dx="+this.get(4)+", Dy="+this.get(5)+", sizingmethod='auto expand')"},t.offset=function(){return[this.e.toFixed(4),this.f.toFixed(4)]},t.split=function(){var t={};t.dx=this.e,t.dy=this.f;var n=[[this.a,this.c],[this.b,this.d]];t.scalex=Y.sqrt(r(n[0])),i(n[0]),t.shear=n[0][0]*n[1][0]+n[0][1]*n[1][1],n[1]=[n[1][0]-n[0][0]*t.shear,n[1][1]-n[0][1]*t.shear],t.scaley=Y.sqrt(r(n[1])),i(n[1]),t.shear/=t.scaley;var a=-n[0][1],s=n[1][1];return s<0?(t.rotate=e.deg(Y.acos(s)),a<0&&(t.rotate=360-t.rotate)):t.rotate=e.deg(Y.asin(a)),t.isSimple=!(+t.shear.toFixed(9)||t.scalex.toFixed(9)!=t.scaley.toFixed(9)&&t.rotate),t.isSuperSimple=!+t.shear.toFixed(9)&&t.scalex.toFixed(9)==t.scaley.toFixed(9)&&!t.rotate,t.noRotation=!+t.shear.toFixed(9)&&!t.rotate,t},t.toTransformString=function(t){var e=t||this[q]();return e.isSimple?(e.scalex=+e.scalex.toFixed(4),e.scaley=+e.scaley.toFixed(4),e.rotate=+e.rotate.toFixed(4),(e.dx||e.dy?"t"+[e.dx,e.dy]:R)+(1!=e.scalex||1!=e.scaley?"s"+[e.scalex,e.scaley,0,0]:R)+(e.rotate?"r"+[e.rotate,0,0]:R)):"m"+[this.get(0),this.get(1),this.get(2),this.get(3),this.get(4),this.get(5)]}}(g.prototype);for(var he=function(){this.returnValue=!1},ue=function(){return this.originalEvent.preventDefault()},ce=function(){this.cancelBubble=!0},fe=function(){return this.originalEvent.stopPropagation()},pe=function(t){var e=T.doc.documentElement.scrollTop||T.doc.body.scrollTop,r=T.doc.documentElement.scrollLeft||T.doc.body.scrollLeft;return{x:t.clientX+r,y:t.clientY+e}},de=function(){return T.doc.addEventListener?function(t,e,r,i){var n=function(t){var e=pe(t);return r.call(i,t,e.x,e.y)};if(t.addEventListener(e,n,!1),F&&V[e]){var a=function(e){for(var n=pe(e),a=e,s=0,o=e.targetTouches&&e.targetTouches.length;s<o;s++)if(e.targetTouches[s].target==t){e=e.targetTouches[s],e.originalEvent=a,e.preventDefault=ue,e.stopPropagation=fe;break}return r.call(i,e,n.x,n.y)};t.addEventListener(V[e],a,!1)}return function(){return t.removeEventListener(e,n,!1),F&&V[e]&&t.removeEventListener(V[e],a,!1),!0}}:T.doc.attachEvent?function(t,e,r,i){var n=function(t){t=t||T.win.event;var e=T.doc.documentElement.scrollTop||T.doc.body.scrollTop,n=T.doc.documentElement.scrollLeft||T.doc.body.scrollLeft,a=t.clientX+n,s=t.clientY+e;return t.preventDefault=t.preventDefault||he,t.stopPropagation=t.stopPropagation||ce,r.call(i,t,a,s)};t.attachEvent("on"+e,n);var a=function(){return t.detachEvent("on"+e,n),!0};return a}:void 0}(),ge=[],ve=function(e){for(var r=e.clientX,i=e.clientY,n=T.doc.documentElement.scrollTop||T.doc.body.scrollTop,a=T.doc.documentElement.scrollLeft||T.doc.body.scrollLeft,s,o=ge.length;o--;){if(s=ge[o],F&&e.touches){for(var l=e.touches.length,h;l--;)if(h=e.touches[l],h.identifier==s.el._drag.id){r=h.clientX,i=h.clientY,(e.originalEvent?e.originalEvent:e).preventDefault();break}}else e.preventDefault();var u=s.el.node,c,f=u.nextSibling,p=u.parentNode,d=u.style.display;T.win.opera&&p.removeChild(u),u.style.display="none",c=s.el.paper.getElementByPoint(r,i),u.style.display=d,T.win.opera&&(f?p.insertBefore(u,f):p.appendChild(u)),c&&t("raphael.drag.over."+s.el.id,s.el,c),r+=a,i+=n,t("raphael.drag.move."+s.el.id,s.move_scope||s.el,r-s.el._drag.x,i-s.el._drag.y,r,i,e)}},xe=function(r){e.unmousemove(ve).unmouseup(xe);for(var i=ge.length,n;i--;)n=ge[i],n.el._drag={},t("raphael.drag.end."+n.el.id,n.end_scope||n.start_scope||n.move_scope||n.el,r);ge=[]},ye=e.el={},me=D.length;me--;)!function(t){e[t]=ye[t]=function(r,i){return e.is(r,"function")&&(this.events=this.events||[],this.events.push({name:t,f:r,unbind:de(this.shape||this.node||T.doc,t,r,i||this)})),this},e["un"+t]=ye["un"+t]=function(r){for(var i=this.events||[],n=i.length;n--;)i[n].name!=t||!e.is(r,"undefined")&&i[n].f!=r||(i[n].unbind(),i.splice(n,1),!i.length&&delete this.events);return this}}(D[me]);ye.data=function(r,i){var n=wt[this.id]=wt[this.id]||{};if(0==arguments.length)return n;if(1==arguments.length){if(e.is(r,"object")){for(var a in r)r[A](a)&&this.data(a,r[a]);return this}return t("raphael.data.get."+this.id,this,n[r],r),n[r]}return n[r]=i,t("raphael.data.set."+this.id,this,i,r),this},ye.removeData=function(t){return null==t?wt[this.id]={}:wt[this.id]&&delete wt[this.id][t],this},ye.getData=function(){return r(wt[this.id]||{})},ye.hover=function(t,e,r,i){return this.mouseover(t,r).mouseout(e,i||r)},ye.unhover=function(t,e){return this.unmouseover(t).unmouseout(e)};var be=[];ye.drag=function(r,i,n,a,s,o){function l(l){(l.originalEvent||l).preventDefault();var h=l.clientX,u=l.clientY,c=T.doc.documentElement.scrollTop||T.doc.body.scrollTop,f=T.doc.documentElement.scrollLeft||T.doc.body.scrollLeft;if(this._drag.id=l.identifier,F&&l.touches)for(var p=l.touches.length,d;p--;)if(d=l.touches[p],this._drag.id=d.identifier,d.identifier==this._drag.id){h=d.clientX,u=d.clientY;break}this._drag.x=h+f,this._drag.y=u+c,!ge.length&&e.mousemove(ve).mouseup(xe),ge.push({el:this,move_scope:a,start_scope:s,end_scope:o}),i&&t.on("raphael.drag.start."+this.id,i),r&&t.on("raphael.drag.move."+this.id,r),n&&t.on("raphael.drag.end."+this.id,n),t("raphael.drag.start."+this.id,s||a||this,l.clientX+f,l.clientY+c,l)}return this._drag={},be.push({el:this,start:l}),this.mousedown(l),this},ye.onDragOver=function(e){e?t.on("raphael.drag.over."+this.id,e):t.unbind("raphael.drag.over."+this.id)},ye.undrag=function(){for(var r=be.length;r--;)be[r].el==this&&(this.unmousedown(be[r].start),be.splice(r,1),t.unbind("raphael.drag.*."+this.id));!be.length&&e.unmousemove(ve).unmouseup(xe),ge=[]},N.circle=function(t,r,i){var n=e._engine.circle(this,t||0,r||0,i||0);return this.__set__&&this.__set__.push(n),n},N.rect=function(t,r,i,n,a){var s=e._engine.rect(this,t||0,r||0,i||0,n||0,a||0);return this.__set__&&this.__set__.push(s),s},N.ellipse=function(t,r,i,n){var a=e._engine.ellipse(this,t||0,r||0,i||0,n||0);return this.__set__&&this.__set__.push(a),a},N.path=function(t){t&&!e.is(t,Z)&&!e.is(t[0],Q)&&(t+=R);var r=e._engine.path(e.format[z](e,arguments),this);return this.__set__&&this.__set__.push(r),r},N.image=function(t,r,i,n,a){var s=e._engine.image(this,t||"about:blank",r||0,i||0,n||0,a||0);return this.__set__&&this.__set__.push(s),s},N.text=function(t,r,i){var n=e._engine.text(this,t||0,r||0,I(i));return this.__set__&&this.__set__.push(n),n},N.set=function(t){!e.is(t,"array")&&(t=Array.prototype.splice.call(arguments,0,arguments.length));var r=new ze(t);return this.__set__&&this.__set__.push(r),r.paper=this,r.type="set",r},N.setStart=function(t){this.__set__=t||this.set()},N.setFinish=function(t){var e=this.__set__;return delete this.__set__,e},N.getSize=function(){var t=this.canvas.parentNode;return{width:t.offsetWidth,height:t.offsetHeight}},N.setSize=function(t,r){return e._engine.setSize.call(this,t,r)},N.setViewBox=function(t,r,i,n,a){return e._engine.setViewBox.call(this,t,r,i,n,a)},N.top=N.bottom=null,N.raphael=e;var _e=function(t){var e=t.getBoundingClientRect(),r=t.ownerDocument,i=r.body,n=r.documentElement,a=n.clientTop||i.clientTop||0,s=n.clientLeft||i.clientLeft||0,o=e.top+(T.win.pageYOffset||n.scrollTop||i.scrollTop)-a,l=e.left+(T.win.pageXOffset||n.scrollLeft||i.scrollLeft)-s;return{y:o,x:l}};N.getElementByPoint=function(t,e){var r=this,i=r.canvas,n=T.doc.elementFromPoint(t,e);if(T.win.opera&&"svg"==n.tagName){var a=_e(i),s=i.createSVGRect();s.x=t-a.x,s.y=e-a.y,s.width=s.height=1;var o=i.getIntersectionList(s,null);o.length&&(n=o[o.length-1])}if(!n)return null;for(;n.parentNode&&n!=i.parentNode&&!n.raphael;)n=n.parentNode;return n==r.canvas.parentNode&&(n=i),n=n&&n.raphael?r.getById(n.raphaelid):null},N.getElementsByBBox=function(t){var r=this.set();return this.forEach(function(i){e.isBBoxIntersect(i.getBBox(),t)&&r.push(i)}),r},N.getById=function(t){for(var e=this.bottom;e;){if(e.id==t)return e;e=e.next}return null},N.forEach=function(t,e){for(var r=this.bottom;r;){if(t.call(e,r)===!1)return this;r=r.next}return this},N.getElementsByPoint=function(t,e){var r=this.set();return this.forEach(function(i){i.isPointInside(t,e)&&r.push(i)}),r},ye.isPointInside=function(t,r){var i=this.realPath=Et[this.type](this);return this.attr("transform")&&this.attr("transform").length&&(i=e.transformPath(i,this.attr("transform"))),e.isPointInsidePath(i,t,r)},ye.getBBox=function(t){if(this.removed)return{};var e=this._;return t?(!e.dirty&&e.bboxwt||(this.realPath=Et[this.type](this),e.bboxwt=Ot(this.realPath),e.bboxwt.toString=x,e.dirty=0),e.bboxwt):((e.dirty||e.dirtyT||!e.bbox)&&(!e.dirty&&this.realPath||(e.bboxwt=0,this.realPath=Et[this.type](this)),e.bbox=Ot(Mt(this.realPath,this.matrix)),e.bbox.toString=x,e.dirty=e.dirtyT=0),e.bbox)},ye.clone=function(){if(this.removed)return null;var t=this.paper[this.type]().attr(this.attr());return this.__set__&&this.__set__.push(t),t},ye.glow=function(t){if("text"==this.type)return null;t=t||{};var e={width:(t.width||10)+(+this.attr("stroke-width")||1),fill:t.fill||!1,opacity:null==t.opacity?.5:t.opacity,offsetx:t.offsetx||0,offsety:t.offsety||0,color:t.color||"#000"},r=e.width/2,i=this.paper,n=i.set(),a=this.realPath||Et[this.type](this);a=this.matrix?Mt(a,this.matrix):a;for(var s=1;s<r+1;s++)n.push(i.path(a).attr({stroke:e.color,fill:e.fill?e.color:"none","stroke-linejoin":"round","stroke-linecap":"round","stroke-width":+(e.width/r*s).toFixed(3),opacity:+(e.opacity/r).toFixed(3)}));return n.insertBefore(this).translate(e.offsetx,e.offsety)};var we={},ke=function(t,r,i,n,a,s,o,u,c){return null==c?l(t,r,i,n,a,s,o,u):e.findDotsAtSegment(t,r,i,n,a,s,o,u,h(t,r,i,n,a,s,o,u,c))},Be=function(t,r){return function(i,n,a){i=Qt(i);for(var s,o,l,h,u="",c={},f,p=0,d=0,g=i.length;d<g;d++){if(l=i[d],"M"==l[0])s=+l[1],o=+l[2];else{if(h=ke(s,o,l[1],l[2],l[3],l[4],l[5],l[6]),p+h>n){if(r&&!c.start){if(f=ke(s,o,l[1],l[2],l[3],l[4],l[5],l[6],n-p),u+=["C"+f.start.x,f.start.y,f.m.x,f.m.y,f.x,f.y],a)return u;c.start=u,u=["M"+f.x,f.y+"C"+f.n.x,f.n.y,f.end.x,f.end.y,l[5],l[6]].join(),p+=h,s=+l[5],o=+l[6];continue}if(!t&&!r)return f=ke(s,o,l[1],l[2],l[3],l[4],l[5],l[6],n-p),{x:f.x,y:f.y,alpha:f.alpha}}p+=h,s=+l[5],o=+l[6]}u+=l.shift()+l}return c.end=u,f=t?p:r?c:e.findDotsAtSegment(s,o,l[0],l[1],l[2],l[3],l[4],l[5],1),f.alpha&&(f={x:f.x,y:f.y,alpha:f.alpha}),f}},Ce=Be(1),Se=Be(),Ae=Be(0,1);e.getTotalLength=Ce,e.getPointAtLength=Se,e.getSubpath=function(t,e,r){if(this.getTotalLength(t)-r<1e-6)return Ae(t,e).end;var i=Ae(t,r,1);return e?Ae(i,e).end:i},ye.getTotalLength=function(){var t=this.getPath();if(t)return this.node.getTotalLength?this.node.getTotalLength():Ce(t)},ye.getPointAtLength=function(t){var e=this.getPath();if(e)return Se(e,t)},ye.getPath=function(){var t,r=e._getPath[this.type];if("text"!=this.type&&"set"!=this.type)return r&&(t=r(this)),t},ye.getSubpath=function(t,r){var i=this.getPath();if(i)return e.getSubpath(i,t,r)};var Te=e.easing_formulas={linear:function(t){return t},"<":function(t){return X(t,1.7)},">":function(t){return X(t,.48)},"<>":function(t){var e=.48-t/1.04,r=Y.sqrt(.1734+e*e),i=r-e,n=X(H(i),1/3)*(i<0?-1:1),a=-r-e,s=X(H(a),1/3)*(a<0?-1:1),o=n+s+.5;return 3*(1-o)*o*o+o*o*o},backIn:function(t){var e=1.70158;return t*t*((e+1)*t-e)},backOut:function(t){t-=1;var e=1.70158;return t*t*((e+1)*t+e)+1},elastic:function(t){return t==!!t?t:X(2,-10*t)*Y.sin((t-.075)*(2*U)/.3)+1},bounce:function(t){var e=7.5625,r=2.75,i;return t<1/r?i=e*t*t:t<2/r?(t-=1.5/r,i=e*t*t+.75):t<2.5/r?(t-=2.25/r,i=e*t*t+.9375):(t-=2.625/r,i=e*t*t+.984375),i}};Te.easeIn=Te["ease-in"]=Te["<"],Te.easeOut=Te["ease-out"]=Te[">"],Te.easeInOut=Te["ease-in-out"]=Te["<>"],Te["back-in"]=Te.backIn,Te["back-out"]=Te.backOut;var Ee=[],Me=window.requestAnimationFrame||window.webkitRequestAnimationFrame||window.mozRequestAnimationFrame||window.oRequestAnimationFrame||window.msRequestAnimationFrame||function(t){setTimeout(t,16)},Ne=function(){for(var r=+new Date,i=0;i<Ee.length;i++){var n=Ee[i];if(!n.el.removed&&!n.paused){var a=r-n.start,s=n.ms,o=n.easing,l=n.from,h=n.diff,u=n.to,c=n.t,f=n.el,p={},d,g={},v;if(n.initstatus?(a=(n.initstatus*n.anim.top-n.prev)/(n.percent-n.prev)*s,n.status=n.initstatus,delete n.initstatus,n.stop&&Ee.splice(i--,1)):n.status=(n.prev+(n.percent-n.prev)*(a/s))/n.anim.top,!(a<0))if(a<s){var x=o(a/s);for(var y in l)if(l[A](y)){switch(pt[y]){case $:d=+l[y]+x*s*h[y];break;case"colour":d="rgb("+[Le(ot(l[y].r+x*s*h[y].r)),Le(ot(l[y].g+x*s*h[y].g)),Le(ot(l[y].b+x*s*h[y].b))].join(",")+")";break;case"path":d=[];for(var m=0,_=l[y].length;m<_;m++){d[m]=[l[y][m][0]];for(var w=1,k=l[y][m].length;w<k;w++)d[m][w]=+l[y][m][w]+x*s*h[y][m][w];d[m]=d[m].join(j)}d=d.join(j);break;case"transform":if(h[y].real)for(d=[],m=0,_=l[y].length;m<_;m++)for(d[m]=[l[y][m][0]],w=1,k=l[y][m].length;w<k;w++)d[m][w]=l[y][m][w]+x*s*h[y][m][w];else{var B=function(t){return+l[y][t]+x*s*h[y][t]};d=[["m",B(0),B(1),B(2),B(3),B(4),B(5)]]}break;case"csv":if("clip-rect"==y)for(d=[],m=4;m--;)d[m]=+l[y][m]+x*s*h[y][m];break;default:var C=[][P](l[y]);for(d=[],m=f.paper.customAttributes[y].length;m--;)d[m]=+C[m]+x*s*h[y][m]}p[y]=d}f.attr(p),function(e,r,i){setTimeout(function(){t("raphael.anim.frame."+e,r,i)})}(f.id,f,n.anim)}else{if(function(r,i,n){setTimeout(function(){t("raphael.anim.frame."+i.id,i,n),t("raphael.anim.finish."+i.id,i,n),e.is(r,"function")&&r.call(i)})}(n.callback,f,n.anim),f.attr(u),Ee.splice(i--,1),n.repeat>1&&!n.next){for(v in u)u[A](v)&&(g[v]=n.totalOrigin[v]);n.el.attr(g),b(n.anim,n.el,n.anim.percents[0],null,n.totalOrigin,n.repeat-1)}n.next&&!n.stop&&b(n.anim,n.el,n.next,null,n.totalOrigin,n.repeat)}}}Ee.length&&Me(Ne)},Le=function(t){return t>255?255:t<0?0:t};ye.animateWith=function(t,r,i,n,a,s){var o=this;if(o.removed)return s&&s.call(o),o;var l=i instanceof m?i:e.animation(i,n,a,s),h,u;b(l,o,l.percents[0],null,o.attr());for(var c=0,f=Ee.length;c<f;c++)if(Ee[c].anim==r&&Ee[c].el==t){Ee[f-1].start=Ee[c].start;break}return o},ye.onAnimation=function(e){return e?t.on("raphael.anim.frame."+this.id,e):t.unbind("raphael.anim.frame."+this.id),this},m.prototype.delay=function(t){var e=new m(this.anim,this.ms);return e.times=this.times,e.del=+t||0,e},m.prototype.repeat=function(t){var e=new m(this.anim,this.ms);return e.del=this.del,e.times=Y.floor(W(t,0))||1,e},e.animation=function(t,r,i,n){if(t instanceof m)return t;!e.is(i,"function")&&i||(n=n||i||null,i=null),t=Object(t),r=+r||0;var a={},s,o;for(o in t)t[A](o)&&ht(o)!=o&&ht(o)+"%"!=o&&(s=!0,a[o]=t[o]);if(s)return i&&(a.easing=i),n&&(a.callback=n),new m({100:a},r);if(n){var l=0;for(var h in t){var u=ut(h);t[A](h)&&u>l&&(l=u)}l+="%",!t[l].callback&&(t[l].callback=n)}return new m(t,r)},ye.animate=function(t,r,i,n){var a=this;if(a.removed)return n&&n.call(a),a;var s=t instanceof m?t:e.animation(t,r,i,n);return b(s,a,s.percents[0],null,a.attr()),a},ye.setTime=function(t,e){return t&&null!=e&&this.status(t,G(e,t.ms)/t.ms),this},ye.status=function(t,e){var r=[],i=0,n,a;if(null!=e)return b(t,this,-1,G(e,1)),this;for(n=Ee.length;i<n;i++)if(a=Ee[i],a.el.id==this.id&&(!t||a.anim==t)){if(t)return a.status;r.push({anim:a.anim,status:a.status})}return t?0:r},ye.pause=function(e){for(var r=0;r<Ee.length;r++)Ee[r].el.id!=this.id||e&&Ee[r].anim!=e||t("raphael.anim.pause."+this.id,this,Ee[r].anim)!==!1&&(Ee[r].paused=!0);return this},ye.resume=function(e){for(var r=0;r<Ee.length;r++)if(Ee[r].el.id==this.id&&(!e||Ee[r].anim==e)){var i=Ee[r];t("raphael.anim.resume."+this.id,this,i.anim)!==!1&&(delete i.paused,this.status(i.anim,i.status))}return this},ye.stop=function(e){for(var r=0;r<Ee.length;r++)Ee[r].el.id!=this.id||e&&Ee[r].anim!=e||t("raphael.anim.stop."+this.id,this,Ee[r].anim)!==!1&&Ee.splice(r--,1);return this},t.on("raphael.remove",_),t.on("raphael.clear",_),ye.toString=function(){return"Raphaël’s object"};var ze=function(t){if(this.items=[],this.length=0,this.type="set",t)for(var e=0,r=t.length;e<r;e++)!t[e]||t[e].constructor!=ye.constructor&&t[e].constructor!=ze||(this[this.items.length]=this.items[this.items.length]=t[e],this.length++)},Pe=ze.prototype;Pe.push=function(){for(var t,e,r=0,i=arguments.length;r<i;r++)t=arguments[r],!t||t.constructor!=ye.constructor&&t.constructor!=ze||(e=this.items.length,this[e]=this.items[e]=t,this.length++);return this},Pe.pop=function(){return this.length&&delete this[this.length--],this.items.pop()},Pe.forEach=function(t,e){for(var r=0,i=this.items.length;r<i;r++)if(t.call(e,this.items[r],r)===!1)return this;return this};for(var Fe in ye)ye[A](Fe)&&(Pe[Fe]=function(t){return function(){var e=arguments;return this.forEach(function(r){r[t][z](r,e)})}}(Fe));return Pe.attr=function(t,r){if(t&&e.is(t,Q)&&e.is(t[0],"object"))for(var i=0,n=t.length;i<n;i++)this.items[i].attr(t[i]);else for(var a=0,s=this.items.length;a<s;a++)this.items[a].attr(t,r);return this},Pe.clear=function(){for(;this.length;)this.pop()},Pe.splice=function(t,e,r){t=t<0?W(this.length+t,0):t,e=W(0,G(this.length-t,e));var i=[],n=[],a=[],s;for(s=2;s<arguments.length;s++)a.push(arguments[s]);for(s=0;s<e;s++)n.push(this[t+s]);for(;s<this.length-t;s++)i.push(this[t+s]);var o=a.length;for(s=0;s<o+i.length;s++)this.items[t+s]=this[t+s]=s<o?a[s]:i[s-o];for(s=this.items.length=this.length-=e-o;this[s];)delete this[s++];return new ze(n)},Pe.exclude=function(t){for(var e=0,r=this.length;e<r;e++)if(this[e]==t)return this.splice(e,1),!0},Pe.animate=function(t,r,i,n){(e.is(i,"function")||!i)&&(n=i||null);var a=this.items.length,s=a,o,l=this,h;if(!a)return this;n&&(h=function(){!--a&&n.call(l)}),i=e.is(i,Z)?i:h;var u=e.animation(t,r,i,h);for(o=this.items[--s].animate(u);s--;)this.items[s]&&!this.items[s].removed&&this.items[s].animateWith(o,u,u),this.items[s]&&!this.items[s].removed||a--;return this},Pe.insertAfter=function(t){for(var e=this.items.length;e--;)this.items[e].insertAfter(t);return this},Pe.getBBox=function(){for(var t=[],e=[],r=[],i=[],n=this.items.length;n--;)if(!this.items[n].removed){var a=this.items[n].getBBox();t.push(a.x),e.push(a.y),r.push(a.x+a.width),i.push(a.y+a.height)}return t=G[z](0,t),e=G[z](0,e),r=W[z](0,r),i=W[z](0,i),{x:t,y:e,x2:r,y2:i,width:r-t,height:i-e}},Pe.clone=function(t){t=this.paper.set();for(var e=0,r=this.items.length;e<r;e++)t.push(this.items[e].clone());return t},Pe.toString=function(){return"Raphaël‘s set"},Pe.glow=function(t){var e=this.paper.set();return this.forEach(function(r,i){var n=r.glow(t);null!=n&&n.forEach(function(t,r){e.push(t)})}),e},Pe.isPointInside=function(t,e){var r=!1;return this.forEach(function(i){if(i.isPointInside(t,e))return r=!0,!1}),r},e.registerFont=function(t){if(!t.face)return t;this.fonts=this.fonts||{};var e={w:t.w,face:{},glyphs:{}},r=t.face["font-family"];for(var i in t.face)t.face[A](i)&&(e.face[i]=t.face[i]);if(this.fonts[r]?this.fonts[r].push(e):this.fonts[r]=[e],!t.svg){e.face["units-per-em"]=ut(t.face["units-per-em"],10);for(var n in t.glyphs)if(t.glyphs[A](n)){var a=t.glyphs[n];if(e.glyphs[n]={w:a.w,k:{},d:a.d&&"M"+a.d.replace(/[mlcxtrv]/g,function(t){return{l:"L",c:"C",x:"z",t:"m",r:"l",v:"c"}[t]||"M"})+"z"},a.k)for(var s in a.k)a[A](s)&&(e.glyphs[n].k[s]=a.k[s])}}return t},N.getFont=function(t,r,i,n){if(n=n||"normal",i=i||"normal",r=+r||{normal:400,bold:700,lighter:300,bolder:800}[r]||400,e.fonts){var a=e.fonts[t];if(!a){var s=new RegExp("(^|\\s)"+t.replace(/[^\w\d\s+!~.:_-]/g,R)+"(\\s|$)","i");for(var o in e.fonts)if(e.fonts[A](o)&&s.test(o)){a=e.fonts[o];break}}var l;if(a)for(var h=0,u=a.length;h<u&&(l=a[h],l.face["font-weight"]!=r||l.face["font-style"]!=i&&l.face["font-style"]||l.face["font-stretch"]!=n);h++);return l}},N.print=function(t,r,i,n,a,s,o,l){s=s||"middle",o=W(G(o||0,1),-1),l=W(G(l||1,3),1);var h=I(i)[q](R),u=0,c=0,f=R,p;if(e.is(n,"string")&&(n=this.getFont(n)),n){p=(a||16)/n.face["units-per-em"];for(var d=n.face.bbox[q](k),g=+d[0],v=d[3]-d[1],x=0,y=+d[1]+("baseline"==s?v+ +n.face.descent:v/2),m=0,b=h.length;m<b;m++){if("\n"==h[m])u=0,w=0,c=0,x+=v*l;else{var _=c&&n.glyphs[h[m-1]]||{},w=n.glyphs[h[m]];u+=c?(_.w||n.w)+(_.k&&_.k[h[m]]||0)+n.w*o:0,c=1}w&&w.d&&(f+=e.transformPath(w.d,["t",u*p,x*p,"s",p,p,g,y,"t",(t-g)/p,(r-y)/p]))}}return this.path(f).attr({fill:"#000",stroke:"none"})},N.add=function(t){if(e.is(t,"array"))for(var r=this.set(),i=0,n=t.length,a;i<n;i++)a=t[i]||{},B[A](a.type)&&r.push(this[a.type]().attr(a));return r},e.format=function(t,r){var i=e.is(r,Q)?[0][P](r):arguments;return t&&e.is(t,Z)&&i.length-1&&(t=t.replace(C,function(t,e){return null==i[++e]?R:i[e]})),t||R},e.fullfill=function(){var t=/\{([^\}]+)\}/g,e=/(?:(?:^|\.)(.+?)(?=\[|\.|$|\()|\[('|")(.+?)\2\])(\(\))?/g,r=function(t,r,i){var n=i;return r.replace(e,function(t,e,r,i,a){e=e||i,n&&(e in n&&(n=n[e]),"function"==typeof n&&a&&(n=n()))}),n=(null==n||n==i?t:n)+""};return function(e,i){return String(e).replace(t,function(t,e){return r(t,e,i)})}}(),e.ninja=function(){if(E.was)T.win.Raphael=E.is;else{window.Raphael=void 0;try{delete window.Raphael}catch(t){}}return e},e.st=Pe,t.on("raphael.DOMload",function(){w=!0}),function(t,r,i){function n(){/in/.test(t.readyState)?setTimeout(n,9):e.eve("raphael.DOMload")}null==t.readyState&&t.addEventListener&&(t.addEventListener(r,i=function(){t.removeEventListener(r,i,!1),t.readyState="complete"},!1),t.readyState="loading"),n()}(document,"DOMContentLoaded"),e}.apply(e,i),!(void 0!==n&&(t.exports=n))},function(t,e,r){var i,n;!function(r){var a="0.5.0",s="hasOwnProperty",o=/[\.\/]/,l=/\s*,\s*/,h="*",u=function(){},c=function(t,e){return t-e},f,p,d={n:{}},g=function(){for(var t=0,e=this.length;t<e;t++)if("undefined"!=typeof this[t])return this[t]},v=function(){for(var t=this.length;--t;)if("undefined"!=typeof this[t])return this[t]},x=Object.prototype.toString,y=String,m=Array.isArray||function(t){return t instanceof Array||"[object Array]"==x.call(t)};eve=function(t,e){var r=d,i=p,n=Array.prototype.slice.call(arguments,2),a=eve.listeners(t),s=0,o=!1,l,h=[],u={},x=[],y=f,m=[];x.firstDefined=g,x.lastDefined=v,f=t,p=0;for(var b=0,_=a.length;b<_;b++)"zIndex"in a[b]&&(h.push(a[b].zIndex),a[b].zIndex<0&&(u[a[b].zIndex]=a[b]));for(h.sort(c);h[s]<0;)if(l=u[h[s++]],x.push(l.apply(e,n)),p)return p=i,x;for(b=0;b<_;b++)if(l=a[b],"zIndex"in l)if(l.zIndex==h[s]){if(x.push(l.apply(e,n)),p)break;do if(s++,l=u[h[s]],l&&x.push(l.apply(e,n)),p)break;while(l)}else u[l.zIndex]=l;else if(x.push(l.apply(e,n)),p)break;return p=i,f=y,x},eve._events=d,eve.listeners=function(t){var e=m(t)?t:t.split(o),r=d,i,n,a,s,l,u,c,f,p=[r],g=[];for(s=0,l=e.length;s<l;s++){for(f=[],u=0,c=p.length;u<c;u++)for(r=p[u].n,n=[r[e[s]],r[h]],a=2;a--;)i=n[a],i&&(f.push(i),g=g.concat(i.f||[]));p=f}return g},eve.separator=function(t){t?(t=y(t).replace(/(?=[\.\^\]\[\-])/g,"\\"),t="["+t+"]",o=new RegExp(t)):o=/[\.\/]/},eve.on=function(t,e){if("function"!=typeof e)return function(){};for(var r=m(t)?m(t[0])?t:[t]:y(t).split(l),i=0,n=r.length;i<n;i++)!function(t){for(var r=m(t)?t:y(t).split(o),i=d,n,a=0,s=r.length;a<s;a++)i=i.n,i=i.hasOwnProperty(r[a])&&i[r[a]]||(i[r[a]]={n:{}});for(i.f=i.f||[],a=0,s=i.f.length;a<s;a++)if(i.f[a]==e){n=!0;break}!n&&i.f.push(e)}(r[i]);return function(t){+t==+t&&(e.zIndex=+t)}},eve.f=function(t){var e=[].slice.call(arguments,1);return function(){eve.apply(null,[t,null].concat(e).concat([].slice.call(arguments,0)))}},eve.stop=function(){p=1},eve.nt=function(t){var e=m(f)?f.join("."):f;return t?new RegExp("(?:\\.|\\/|^)"+t+"(?:\\.|\\/|$)").test(e):e},eve.nts=function(){return m(f)?f:f.split(o)},eve.off=eve.unbind=function(t,e){if(!t)return void(eve._events=d={n:{}});var r=m(t)?m(t[0])?t:[t]:y(t).split(l);if(r.length>1)for(var i=0,n=r.length;i<n;i++)eve.off(r[i],e);else{r=m(t)?t:y(t).split(o);var a,u,c,i,n,f,p,g=[d];for(i=0,n=r.length;i<n;i++)for(f=0;f<g.length;f+=c.length-2){if(c=[f,1],a=g[f].n,r[i]!=h)a[r[i]]&&c.push(a[r[i]]);else for(u in a)a[s](u)&&c.push(a[u]);g.splice.apply(g,c)}for(i=0,n=g.length;i<n;i++)for(a=g[i];a.n;){if(e){if(a.f){for(f=0,p=a.f.length;f<p;f++)if(a.f[f]==e){a.f.splice(f,1);break}!a.f.length&&delete a.f}for(u in a.n)if(a.n[s](u)&&a.n[u].f){var v=a.n[u].f;for(f=0,p=v.length;f<p;f++)if(v[f]==e){v.splice(f,1);break}!v.length&&delete a.n[u].f}}else{delete a.f;for(u in a.n)a.n[s](u)&&a.n[u].f&&delete a.n[u].f}a=a.n}}},eve.once=function(t,e){var r=function(){return eve.off(t,r),e.apply(this,arguments)};return eve.on(t,r)},eve.version=a,eve.toString=function(){return"You are running Eve "+a},"undefined"!=typeof t&&t.exports?t.exports=eve:(i=[],n=function(){return eve}.apply(e,i),!(void 0!==n&&(t.exports=n)))}(this)},function(t,e,r){var i,n;i=[r(1)],n=function(t){if(!t||t.svg){var e="hasOwnProperty",r=String,i=parseFloat,n=parseInt,a=Math,s=a.max,o=a.abs,l=a.pow,h=/[, ]+/,u=t.eve,c="",f=" ",p="http://www.w3.org/1999/xlink",d={block:"M5,0 0,2.5 5,5z",classic:"M5,0 0,2.5 5,5 3.5,3 3.5,2z",diamond:"M2.5,0 5,2.5 2.5,5 0,2.5z",open:"M6,1 1,3.5 6,6",oval:"M2.5,0A2.5,2.5,0,0,1,2.5,5 2.5,2.5,0,0,1,2.5,0z"},g={};t.toString=function(){return"Your browser supports SVG.\nYou are running Raphaël "+this.version};var v=function(i,n){if(n){"string"==typeof i&&(i=v(i));for(var a in n)n[e](a)&&("xlink:"==a.substring(0,6)?i.setAttributeNS(p,a.substring(6),r(n[a])):i.setAttribute(a,r(n[a])))}else i=t._g.doc.createElementNS("http://www.w3.org/2000/svg",i),i.style&&(i.style.webkitTapHighlightColor="rgba(0,0,0,0)");return i},x=function(e,n){var h="linear",u=e.id+n,f=.5,p=.5,d=e.node,g=e.paper,x=d.style,y=t._g.doc.getElementById(u);if(!y){if(n=r(n).replace(t._radial_gradient,function(t,e,r){if(h="radial",e&&r){f=i(e),p=i(r);var n=2*(p>.5)-1;l(f-.5,2)+l(p-.5,2)>.25&&(p=a.sqrt(.25-l(f-.5,2))*n+.5)&&.5!=p&&(p=p.toFixed(5)-1e-5*n)}return c}),n=n.split(/\s*\-\s*/),"linear"==h){var b=n.shift();if(b=-i(b),isNaN(b))return null;var _=[0,0,a.cos(t.rad(b)),a.sin(t.rad(b))],w=1/(s(o(_[2]),o(_[3]))||1);_[2]*=w,_[3]*=w,_[2]<0&&(_[0]=-_[2],_[2]=0),_[3]<0&&(_[1]=-_[3],_[3]=0)}var k=t._parseDots(n);if(!k)return null;if(u=u.replace(/[\(\)\s,\xb0#]/g,"_"),e.gradient&&u!=e.gradient.id&&(g.defs.removeChild(e.gradient),delete e.gradient),!e.gradient){y=v(h+"Gradient",{id:u}),e.gradient=y,v(y,"radial"==h?{fx:f,fy:p}:{x1:_[0],y1:_[1],x2:_[2],y2:_[3],gradientTransform:e.matrix.invert()}),g.defs.appendChild(y);for(var B=0,C=k.length;B<C;B++)y.appendChild(v("stop",{offset:k[B].offset?k[B].offset:B?"100%":"0%","stop-color":k[B].color||"#fff","stop-opacity":isFinite(k[B].opacity)?k[B].opacity:1}))}}return v(d,{fill:m(u),opacity:1,"fill-opacity":1}),x.fill=c,x.opacity=1,x.fillOpacity=1,1},y=function(){var t=document.documentMode;return t&&(9===t||10===t)},m=function(t){if(y())return"url('#"+t+"')";var e=document.location,r=e.protocol+"//"+e.host+e.pathname+e.search;return"url('"+r+"#"+t+"')"},b=function(t){var e=t.getBBox(1);v(t.pattern,{patternTransform:t.matrix.invert()+" translate("+e.x+","+e.y+")"})},_=function(i,n,a){if("path"==i.type){for(var s=r(n).toLowerCase().split("-"),o=i.paper,l=a?"end":"start",h=i.node,u=i.attrs,f=u["stroke-width"],p=s.length,x="classic",y,m,b,_,w,k=3,B=3,C=5;p--;)switch(s[p]){case"block":case"classic":case"oval":case"diamond":case"open":case"none":x=s[p];break;case"wide":B=5;break;case"narrow":B=2;break;case"long":k=5;break;case"short":k=2}if("open"==x?(k+=2,B+=2,C+=2,b=1,_=a?4:1,w={fill:"none",stroke:u.stroke}):(_=b=k/2,w={fill:u.stroke,stroke:"none"}),i._.arrows?a?(i._.arrows.endPath&&g[i._.arrows.endPath]--,i._.arrows.endMarker&&g[i._.arrows.endMarker]--):(i._.arrows.startPath&&g[i._.arrows.startPath]--,i._.arrows.startMarker&&g[i._.arrows.startMarker]--):i._.arrows={},"none"!=x){var S="raphael-marker-"+x,A="raphael-marker-"+l+x+k+B+"-obj"+i.id;t._g.doc.getElementById(S)?g[S]++:(o.defs.appendChild(v(v("path"),{"stroke-linecap":"round",d:d[x],id:S})),g[S]=1);var T=t._g.doc.getElementById(A),E;T?(g[A]++,E=T.getElementsByTagName("use")[0]):(T=v(v("marker"),{id:A,markerHeight:B,markerWidth:k,orient:"auto",refX:_,refY:B/2}),E=v(v("use"),{"xlink:href":"#"+S,transform:(a?"rotate(180 "+k/2+" "+B/2+") ":c)+"scale("+k/C+","+B/C+")","stroke-width":(1/((k/C+B/C)/2)).toFixed(4)}),T.appendChild(E),o.defs.appendChild(T),g[A]=1),v(E,w);var M=b*("diamond"!=x&&"oval"!=x);a?(y=i._.arrows.startdx*f||0,m=t.getTotalLength(u.path)-M*f):(y=M*f,m=t.getTotalLength(u.path)-(i._.arrows.enddx*f||0)),w={},w["marker-"+l]="url(#"+A+")",(m||y)&&(w.d=t.getSubpath(u.path,y,m)),v(h,w),i._.arrows[l+"Path"]=S,i._.arrows[l+"Marker"]=A,i._.arrows[l+"dx"]=M,i._.arrows[l+"Type"]=x,i._.arrows[l+"String"]=n}else a?(y=i._.arrows.startdx*f||0,m=t.getTotalLength(u.path)-y):(y=0,m=t.getTotalLength(u.path)-(i._.arrows.enddx*f||0)),i._.arrows[l+"Path"]&&v(h,{d:t.getSubpath(u.path,y,m)}),delete i._.arrows[l+"Path"],delete i._.arrows[l+"Marker"],delete i._.arrows[l+"dx"],delete i._.arrows[l+"Type"],delete i._.arrows[l+"String"];for(w in g)if(g[e](w)&&!g[w]){var N=t._g.doc.getElementById(w);N&&N.parentNode.removeChild(N)}}},w={"-":[3,1],".":[1,1],"-.":[3,1,1,1],"-..":[3,1,1,1,1,1],". ":[1,3],"- ":[4,3],"--":[8,3],"- .":[4,3,1,3],"--.":[8,3,1,3],"--..":[8,3,1,3,1,3]},k=function(t,e,i){if(e=w[r(e).toLowerCase()]){for(var n=t.attrs["stroke-width"]||"1",a={round:n,square:n,butt:0}[t.attrs["stroke-linecap"]||i["stroke-linecap"]]||0,s=[],o=e.length;o--;)s[o]=e[o]*n+(o%2?1:-1)*a;v(t.node,{"stroke-dasharray":s.join(",")})}else v(t.node,{"stroke-dasharray":"none"})},B=function(i,a){var l=i.node,u=i.attrs,f=l.style.visibility;l.style.visibility="hidden";for(var d in a)if(a[e](d)){if(!t._availableAttrs[e](d))continue;var g=a[d];switch(u[d]=g,d){case"blur":i.blur(g);break;case"title":var y=l.getElementsByTagName("title");if(y.length&&(y=y[0]))y.firstChild.nodeValue=g;else{y=v("title");var m=t._g.doc.createTextNode(g);y.appendChild(m),l.appendChild(y)}break;case"href":case"target":var w=l.parentNode;if("a"!=w.tagName.toLowerCase()){var B=v("a");w.insertBefore(B,l),B.appendChild(l),w=B}"target"==d?w.setAttributeNS(p,"show","blank"==g?"new":g):w.setAttributeNS(p,d,g);break;case"cursor":l.style.cursor=g;break;case"transform":i.transform(g);break;case"arrow-start":_(i,g);break;case"arrow-end":_(i,g,1);break;case"clip-rect":var C=r(g).split(h);if(4==C.length){i.clip&&i.clip.parentNode.parentNode.removeChild(i.clip.parentNode);var A=v("clipPath"),T=v("rect");A.id=t.createUUID(),v(T,{x:C[0],y:C[1],width:C[2],height:C[3]}),A.appendChild(T),i.paper.defs.appendChild(A),v(l,{"clip-path":"url(#"+A.id+")"}),i.clip=T}if(!g){var E=l.getAttribute("clip-path");if(E){var M=t._g.doc.getElementById(E.replace(/(^url\(#|\)$)/g,c));M&&M.parentNode.removeChild(M),v(l,{"clip-path":c}),delete i.clip}}break;case"path":"path"==i.type&&(v(l,{d:g?u.path=t._pathToAbsolute(g):"M0,0"}),i._.dirty=1,i._.arrows&&("startString"in i._.arrows&&_(i,i._.arrows.startString),"endString"in i._.arrows&&_(i,i._.arrows.endString,1)));break;case"width":if(l.setAttribute(d,g),i._.dirty=1,!u.fx)break;d="x",g=u.x;case"x":u.fx&&(g=-u.x-(u.width||0));case"rx":if("rx"==d&&"rect"==i.type)break;case"cx":l.setAttribute(d,g),i.pattern&&b(i),i._.dirty=1;break;case"height":if(l.setAttribute(d,g),i._.dirty=1,!u.fy)break;d="y",g=u.y;case"y":u.fy&&(g=-u.y-(u.height||0));case"ry":if("ry"==d&&"rect"==i.type)break;case"cy":l.setAttribute(d,g),i.pattern&&b(i),i._.dirty=1;break;case"r":"rect"==i.type?v(l,{rx:g,ry:g}):l.setAttribute(d,g),i._.dirty=1;break;case"src":"image"==i.type&&l.setAttributeNS(p,"href",g);break;case"stroke-width":1==i._.sx&&1==i._.sy||(g/=s(o(i._.sx),o(i._.sy))||1),l.setAttribute(d,g),u["stroke-dasharray"]&&k(i,u["stroke-dasharray"],a),
i._.arrows&&("startString"in i._.arrows&&_(i,i._.arrows.startString),"endString"in i._.arrows&&_(i,i._.arrows.endString,1));break;case"stroke-dasharray":k(i,g,a);break;case"fill":var N=r(g).match(t._ISURL);if(N){A=v("pattern");var L=v("image");A.id=t.createUUID(),v(A,{x:0,y:0,patternUnits:"userSpaceOnUse",height:1,width:1}),v(L,{x:0,y:0,"xlink:href":N[1]}),A.appendChild(L),function(e){t._preload(N[1],function(){var t=this.offsetWidth,r=this.offsetHeight;v(e,{width:t,height:r}),v(L,{width:t,height:r})})}(A),i.paper.defs.appendChild(A),v(l,{fill:"url(#"+A.id+")"}),i.pattern=A,i.pattern&&b(i);break}var z=t.getRGB(g);if(z.error){if(("circle"==i.type||"ellipse"==i.type||"r"!=r(g).charAt())&&x(i,g)){if("opacity"in u||"fill-opacity"in u){var P=t._g.doc.getElementById(l.getAttribute("fill").replace(/^url\(#|\)$/g,c));if(P){var F=P.getElementsByTagName("stop");v(F[F.length-1],{"stop-opacity":("opacity"in u?u.opacity:1)*("fill-opacity"in u?u["fill-opacity"]:1)})}}u.gradient=g,u.fill="none";break}}else delete a.gradient,delete u.gradient,!t.is(u.opacity,"undefined")&&t.is(a.opacity,"undefined")&&v(l,{opacity:u.opacity}),!t.is(u["fill-opacity"],"undefined")&&t.is(a["fill-opacity"],"undefined")&&v(l,{"fill-opacity":u["fill-opacity"]});z[e]("opacity")&&v(l,{"fill-opacity":z.opacity>1?z.opacity/100:z.opacity});case"stroke":z=t.getRGB(g),l.setAttribute(d,z.hex),"stroke"==d&&z[e]("opacity")&&v(l,{"stroke-opacity":z.opacity>1?z.opacity/100:z.opacity}),"stroke"==d&&i._.arrows&&("startString"in i._.arrows&&_(i,i._.arrows.startString),"endString"in i._.arrows&&_(i,i._.arrows.endString,1));break;case"gradient":("circle"==i.type||"ellipse"==i.type||"r"!=r(g).charAt())&&x(i,g);break;case"opacity":u.gradient&&!u[e]("stroke-opacity")&&v(l,{"stroke-opacity":g>1?g/100:g});case"fill-opacity":if(u.gradient){P=t._g.doc.getElementById(l.getAttribute("fill").replace(/^url\(#|\)$/g,c)),P&&(F=P.getElementsByTagName("stop"),v(F[F.length-1],{"stop-opacity":g}));break}default:"font-size"==d&&(g=n(g,10)+"px");var R=d.replace(/(\-.)/g,function(t){return t.substring(1).toUpperCase()});l.style[R]=g,i._.dirty=1,l.setAttribute(d,g)}}S(i,a),l.style.visibility=f},C=1.2,S=function(i,a){if("text"==i.type&&(a[e]("text")||a[e]("font")||a[e]("font-size")||a[e]("x")||a[e]("y"))){var s=i.attrs,o=i.node,l=o.firstChild?n(t._g.doc.defaultView.getComputedStyle(o.firstChild,c).getPropertyValue("font-size"),10):10;if(a[e]("text")){for(s.text=a.text;o.firstChild;)o.removeChild(o.firstChild);for(var h=r(a.text).split("\n"),u=[],f,p=0,d=h.length;p<d;p++)f=v("tspan"),p&&v(f,{dy:l*C,x:s.x}),f.appendChild(t._g.doc.createTextNode(h[p])),o.appendChild(f),u[p]=f}else for(u=o.getElementsByTagName("tspan"),p=0,d=u.length;p<d;p++)p?v(u[p],{dy:l*C,x:s.x}):v(u[0],{dy:0});v(o,{x:s.x,y:s.y}),i._.dirty=1;var g=i._getBBox(),x=s.y-(g.y+g.height/2);x&&t.is(x,"finite")&&v(u[0],{dy:x})}},A=function(t){return t.parentNode&&"a"===t.parentNode.tagName.toLowerCase()?t.parentNode:t},T=function(e,r){function i(){return("0000"+(Math.random()*Math.pow(36,5)<<0).toString(36)).slice(-5)}var n=0,a=0;this[0]=this.node=e,e.raphael=!0,this.id=i(),e.raphaelid=this.id,this.matrix=t.matrix(),this.realPath=null,this.paper=r,this.attrs=this.attrs||{},this._={transform:[],sx:1,sy:1,deg:0,dx:0,dy:0,dirty:1},!r.bottom&&(r.bottom=this),this.prev=r.top,r.top&&(r.top.next=this),r.top=this,this.next=null},E=t.el;T.prototype=E,E.constructor=T,t._engine.path=function(t,e){var r=v("path");e.canvas&&e.canvas.appendChild(r);var i=new T(r,e);return i.type="path",B(i,{fill:"none",stroke:"#000",path:t}),i},E.rotate=function(t,e,n){if(this.removed)return this;if(t=r(t).split(h),t.length-1&&(e=i(t[1]),n=i(t[2])),t=i(t[0]),null==n&&(e=n),null==e||null==n){var a=this.getBBox(1);e=a.x+a.width/2,n=a.y+a.height/2}return this.transform(this._.transform.concat([["r",t,e,n]])),this},E.scale=function(t,e,n,a){if(this.removed)return this;if(t=r(t).split(h),t.length-1&&(e=i(t[1]),n=i(t[2]),a=i(t[3])),t=i(t[0]),null==e&&(e=t),null==a&&(n=a),null==n||null==a)var s=this.getBBox(1);return n=null==n?s.x+s.width/2:n,a=null==a?s.y+s.height/2:a,this.transform(this._.transform.concat([["s",t,e,n,a]])),this},E.translate=function(t,e){return this.removed?this:(t=r(t).split(h),t.length-1&&(e=i(t[1])),t=i(t[0])||0,e=+e||0,this.transform(this._.transform.concat([["t",t,e]])),this)},E.transform=function(r){var i=this._;if(null==r)return i.transform;if(t._extractTransform(this,r),this.clip&&v(this.clip,{transform:this.matrix.invert()}),this.pattern&&b(this),this.node&&v(this.node,{transform:this.matrix}),1!=i.sx||1!=i.sy){var n=this.attrs[e]("stroke-width")?this.attrs["stroke-width"]:1;this.attr({"stroke-width":n})}return this},E.hide=function(){return this.removed||(this.node.style.display="none"),this},E.show=function(){return this.removed||(this.node.style.display=""),this},E.remove=function(){var e=A(this.node);if(!this.removed&&e.parentNode){var r=this.paper;r.__set__&&r.__set__.exclude(this),u.unbind("raphael.*.*."+this.id),this.gradient&&r.defs.removeChild(this.gradient),t._tear(this,r),e.parentNode.removeChild(e),this.removeData();for(var i in this)this[i]="function"==typeof this[i]?t._removedFactory(i):null;this.removed=!0}},E._getBBox=function(){if("none"==this.node.style.display){this.show();var t=!0}var e=!1,r;this.paper.canvas.parentElement?r=this.paper.canvas.parentElement.style:this.paper.canvas.parentNode&&(r=this.paper.canvas.parentNode.style),r&&"none"==r.display&&(e=!0,r.display="");var i={};try{i=this.node.getBBox()}catch(n){i={x:this.node.clientLeft,y:this.node.clientTop,width:this.node.clientWidth,height:this.node.clientHeight}}finally{i=i||{},e&&(r.display="none")}return t&&this.hide(),i},E.attr=function(r,i){if(this.removed)return this;if(null==r){var n={};for(var a in this.attrs)this.attrs[e](a)&&(n[a]=this.attrs[a]);return n.gradient&&"none"==n.fill&&(n.fill=n.gradient)&&delete n.gradient,n.transform=this._.transform,n}if(null==i&&t.is(r,"string")){if("fill"==r&&"none"==this.attrs.fill&&this.attrs.gradient)return this.attrs.gradient;if("transform"==r)return this._.transform;for(var s=r.split(h),o={},l=0,c=s.length;l<c;l++)r=s[l],r in this.attrs?o[r]=this.attrs[r]:t.is(this.paper.customAttributes[r],"function")?o[r]=this.paper.customAttributes[r].def:o[r]=t._availableAttrs[r];return c-1?o:o[s[0]]}if(null==i&&t.is(r,"array")){for(o={},l=0,c=r.length;l<c;l++)o[r[l]]=this.attr(r[l]);return o}if(null!=i){var f={};f[r]=i}else null!=r&&t.is(r,"object")&&(f=r);for(var p in f)u("raphael.attr."+p+"."+this.id,this,f[p]);for(p in this.paper.customAttributes)if(this.paper.customAttributes[e](p)&&f[e](p)&&t.is(this.paper.customAttributes[p],"function")){var d=this.paper.customAttributes[p].apply(this,[].concat(f[p]));this.attrs[p]=f[p];for(var g in d)d[e](g)&&(f[g]=d[g])}return B(this,f),this},E.toFront=function(){if(this.removed)return this;var e=A(this.node);e.parentNode.appendChild(e);var r=this.paper;return r.top!=this&&t._tofront(this,r),this},E.toBack=function(){if(this.removed)return this;var e=A(this.node),r=e.parentNode;r.insertBefore(e,r.firstChild),t._toback(this,this.paper);var i=this.paper;return this},E.insertAfter=function(e){if(this.removed||!e)return this;var r=A(this.node),i=A(e.node||e[e.length-1].node);return i.nextSibling?i.parentNode.insertBefore(r,i.nextSibling):i.parentNode.appendChild(r),t._insertafter(this,e,this.paper),this},E.insertBefore=function(e){if(this.removed||!e)return this;var r=A(this.node),i=A(e.node||e[0].node);return i.parentNode.insertBefore(r,i),t._insertbefore(this,e,this.paper),this},E.blur=function(e){var r=this;if(0!==+e){var i=v("filter"),n=v("feGaussianBlur");r.attrs.blur=e,i.id=t.createUUID(),v(n,{stdDeviation:+e||1.5}),i.appendChild(n),r.paper.defs.appendChild(i),r._blur=i,v(r.node,{filter:"url(#"+i.id+")"})}else r._blur&&(r._blur.parentNode.removeChild(r._blur),delete r._blur,delete r.attrs.blur),r.node.removeAttribute("filter");return r},t._engine.circle=function(t,e,r,i){var n=v("circle");t.canvas&&t.canvas.appendChild(n);var a=new T(n,t);return a.attrs={cx:e,cy:r,r:i,fill:"none",stroke:"#000"},a.type="circle",v(n,a.attrs),a},t._engine.rect=function(t,e,r,i,n,a){var s=v("rect");t.canvas&&t.canvas.appendChild(s);var o=new T(s,t);return o.attrs={x:e,y:r,width:i,height:n,rx:a||0,ry:a||0,fill:"none",stroke:"#000"},o.type="rect",v(s,o.attrs),o},t._engine.ellipse=function(t,e,r,i,n){var a=v("ellipse");t.canvas&&t.canvas.appendChild(a);var s=new T(a,t);return s.attrs={cx:e,cy:r,rx:i,ry:n,fill:"none",stroke:"#000"},s.type="ellipse",v(a,s.attrs),s},t._engine.image=function(t,e,r,i,n,a){var s=v("image");v(s,{x:r,y:i,width:n,height:a,preserveAspectRatio:"none"}),s.setAttributeNS(p,"href",e),t.canvas&&t.canvas.appendChild(s);var o=new T(s,t);return o.attrs={x:r,y:i,width:n,height:a,src:e},o.type="image",o},t._engine.text=function(e,r,i,n){var a=v("text");e.canvas&&e.canvas.appendChild(a);var s=new T(a,e);return s.attrs={x:r,y:i,"text-anchor":"middle",text:n,"font-family":t._availableAttrs["font-family"],"font-size":t._availableAttrs["font-size"],stroke:"none",fill:"#000"},s.type="text",B(s,s.attrs),s},t._engine.setSize=function(t,e){return this.width=t||this.width,this.height=e||this.height,this.canvas.setAttribute("width",this.width),this.canvas.setAttribute("height",this.height),this._viewBox&&this.setViewBox.apply(this,this._viewBox),this},t._engine.create=function(){var e=t._getContainer.apply(0,arguments),r=e&&e.container,i=e.x,n=e.y,a=e.width,s=e.height;if(!r)throw new Error("SVG container not found.");var o=v("svg"),l="overflow:hidden;",h;return i=i||0,n=n||0,a=a||512,s=s||342,v(o,{height:s,version:1.1,width:a,xmlns:"http://www.w3.org/2000/svg","xmlns:xlink":"http://www.w3.org/1999/xlink"}),1==r?(o.style.cssText=l+"position:absolute;left:"+i+"px;top:"+n+"px",t._g.doc.body.appendChild(o),h=1):(o.style.cssText=l+"position:relative",r.firstChild?r.insertBefore(o,r.firstChild):r.appendChild(o)),r=new t._Paper,r.width=a,r.height=s,r.canvas=o,r.clear(),r._left=r._top=0,h&&(r.renderfix=function(){}),r.renderfix(),r},t._engine.setViewBox=function(t,e,r,i,n){u("raphael.setViewBox",this,this._viewBox,[t,e,r,i,n]);var a=this.getSize(),o=s(r/a.width,i/a.height),l=this.top,h=n?"xMidYMid meet":"xMinYMin",c,p;for(null==t?(this._vbSize&&(o=1),delete this._vbSize,c="0 0 "+this.width+f+this.height):(this._vbSize=o,c=t+f+e+f+r+f+i),v(this.canvas,{viewBox:c,preserveAspectRatio:h});o&&l;)p="stroke-width"in l.attrs?l.attrs["stroke-width"]:1,l.attr({"stroke-width":p}),l._.dirty=1,l._.dirtyT=1,l=l.prev;return this._viewBox=[t,e,r,i,!!n],this},t.prototype.renderfix=function(){var t=this.canvas,e=t.style,r;try{r=t.getScreenCTM()||t.createSVGMatrix()}catch(i){r=t.createSVGMatrix()}var n=-r.e%1,a=-r.f%1;(n||a)&&(n&&(this._left=(this._left+n)%1,e.left=this._left+"px"),a&&(this._top=(this._top+a)%1,e.top=this._top+"px"))},t.prototype.clear=function(){t.eve("raphael.clear",this);for(var e=this.canvas;e.firstChild;)e.removeChild(e.firstChild);this.bottom=this.top=null,(this.desc=v("desc")).appendChild(t._g.doc.createTextNode("Created with Raphaël "+t.version)),e.appendChild(this.desc),e.appendChild(this.defs=v("defs"))},t.prototype.remove=function(){u("raphael.remove",this),this.canvas.parentNode&&this.canvas.parentNode.removeChild(this.canvas);for(var e in this)this[e]="function"==typeof this[e]?t._removedFactory(e):null};var M=t.st;for(var N in E)E[e](N)&&!M[e](N)&&(M[N]=function(t){return function(){var e=arguments;return this.forEach(function(r){r[t].apply(r,e)})}}(N))}}.apply(e,i),!(void 0!==n&&(t.exports=n))},function(t,e,r){var i,n;i=[r(1)],n=function(t){if(!t||t.vml){var e="hasOwnProperty",r=String,i=parseFloat,n=Math,a=n.round,s=n.max,o=n.min,l=n.abs,h="fill",u=/[, ]+/,c=t.eve,f=" progid:DXImageTransform.Microsoft",p=" ",d="",g={M:"m",L:"l",C:"c",Z:"x",m:"t",l:"r",c:"v",z:"x"},v=/([clmz]),?([^clmz]*)/gi,x=/ progid:\S+Blur\([^\)]+\)/g,y=/-?[^,\s-]+/g,m="position:absolute;left:0;top:0;width:1px;height:1px;behavior:url(#default#VML)",b=21600,_={path:1,rect:1,image:1},w={circle:1,ellipse:1},k=function(e){var i=/[ahqstv]/gi,n=t._pathToAbsolute;if(r(e).match(i)&&(n=t._path2curve),i=/[clmz]/g,n==t._pathToAbsolute&&!r(e).match(i)){var s=r(e).replace(v,function(t,e,r){var i=[],n="m"==e.toLowerCase(),s=g[e];return r.replace(y,function(t){n&&2==i.length&&(s+=i+g["m"==e?"l":"L"],i=[]),i.push(a(t*b))}),s+i});return s}var o=n(e),l,h;s=[];for(var u=0,c=o.length;u<c;u++){l=o[u],h=o[u][0].toLowerCase(),"z"==h&&(h="x");for(var f=1,x=l.length;f<x;f++)h+=a(l[f]*b)+(f!=x-1?",":d);s.push(h)}return s.join(p)},B=function(e,r,i){var n=t.matrix();return n.rotate(-e,.5,.5),{dx:n.x(r,i),dy:n.y(r,i)}},C=function(t,e,r,i,n,a){var s=t._,o=t.matrix,u=s.fillpos,c=t.node,f=c.style,d=1,g="",v,x=b/e,y=b/r;if(f.visibility="hidden",e&&r){if(c.coordsize=l(x)+p+l(y),f.rotation=a*(e*r<0?-1:1),a){var m=B(a,i,n);i=m.dx,n=m.dy}if(e<0&&(g+="x"),r<0&&(g+=" y")&&(d=-1),f.flip=g,c.coordorigin=i*-x+p+n*-y,u||s.fillsize){var _=c.getElementsByTagName(h);_=_&&_[0],c.removeChild(_),u&&(m=B(a,o.x(u[0],u[1]),o.y(u[0],u[1])),_.position=m.dx*d+p+m.dy*d),s.fillsize&&(_.size=s.fillsize[0]*l(e)+p+s.fillsize[1]*l(r)),c.appendChild(_)}f.visibility="visible"}};t.toString=function(){return"Your browser doesn’t support SVG. Falling down to VML.\nYou are running Raphaël "+this.version};var S=function(t,e,i){for(var n=r(e).toLowerCase().split("-"),a=i?"end":"start",s=n.length,o="classic",l="medium",h="medium";s--;)switch(n[s]){case"block":case"classic":case"oval":case"diamond":case"open":case"none":o=n[s];break;case"wide":case"narrow":h=n[s];break;case"long":case"short":l=n[s]}var u=t.node.getElementsByTagName("stroke")[0];u[a+"arrow"]=o,u[a+"arrowlength"]=l,u[a+"arrowwidth"]=h},A=function(n,l){n.attrs=n.attrs||{};var c=n.node,f=n.attrs,g=c.style,v,x=_[n.type]&&(l.x!=f.x||l.y!=f.y||l.width!=f.width||l.height!=f.height||l.cx!=f.cx||l.cy!=f.cy||l.rx!=f.rx||l.ry!=f.ry||l.r!=f.r),y=w[n.type]&&(f.cx!=l.cx||f.cy!=l.cy||f.r!=l.r||f.rx!=l.rx||f.ry!=l.ry),m=n;for(var B in l)l[e](B)&&(f[B]=l[B]);if(x&&(f.path=t._getPath[n.type](n),n._.dirty=1),l.href&&(c.href=l.href),l.title&&(c.title=l.title),l.target&&(c.target=l.target),l.cursor&&(g.cursor=l.cursor),"blur"in l&&n.blur(l.blur),(l.path&&"path"==n.type||x)&&(c.path=k(~r(f.path).toLowerCase().indexOf("r")?t._pathToAbsolute(f.path):f.path),n._.dirty=1,"image"==n.type&&(n._.fillpos=[f.x,f.y],n._.fillsize=[f.width,f.height],C(n,1,1,0,0,0))),"transform"in l&&n.transform(l.transform),y){var A=+f.cx,E=+f.cy,M=+f.rx||+f.r||0,L=+f.ry||+f.r||0;c.path=t.format("ar{0},{1},{2},{3},{4},{1},{4},{1}x",a((A-M)*b),a((E-L)*b),a((A+M)*b),a((E+L)*b),a(A*b)),n._.dirty=1}if("clip-rect"in l){var z=r(l["clip-rect"]).split(u);if(4==z.length){z[2]=+z[2]+ +z[0],z[3]=+z[3]+ +z[1];var P=c.clipRect||t._g.doc.createElement("div"),F=P.style;F.clip=t.format("rect({1}px {2}px {3}px {0}px)",z),c.clipRect||(F.position="absolute",F.top=0,F.left=0,F.width=n.paper.width+"px",F.height=n.paper.height+"px",c.parentNode.insertBefore(P,c),P.appendChild(c),c.clipRect=P)}l["clip-rect"]||c.clipRect&&(c.clipRect.style.clip="auto")}if(n.textpath){var R=n.textpath.style;l.font&&(R.font=l.font),l["font-family"]&&(R.fontFamily='"'+l["font-family"].split(",")[0].replace(/^['"]+|['"]+$/g,d)+'"'),l["font-size"]&&(R.fontSize=l["font-size"]),l["font-weight"]&&(R.fontWeight=l["font-weight"]),l["font-style"]&&(R.fontStyle=l["font-style"])}if("arrow-start"in l&&S(m,l["arrow-start"]),"arrow-end"in l&&S(m,l["arrow-end"],1),null!=l.opacity||null!=l.fill||null!=l.src||null!=l.stroke||null!=l["stroke-width"]||null!=l["stroke-opacity"]||null!=l["fill-opacity"]||null!=l["stroke-dasharray"]||null!=l["stroke-miterlimit"]||null!=l["stroke-linejoin"]||null!=l["stroke-linecap"]){var j=c.getElementsByTagName(h),I=!1;if(j=j&&j[0],!j&&(I=j=N(h)),"image"==n.type&&l.src&&(j.src=l.src),l.fill&&(j.on=!0),null!=j.on&&"none"!=l.fill&&null!==l.fill||(j.on=!1),j.on&&l.fill){var q=r(l.fill).match(t._ISURL);if(q){j.parentNode==c&&c.removeChild(j),j.rotate=!0,j.src=q[1],j.type="tile";var D=n.getBBox(1);j.position=D.x+p+D.y,n._.fillpos=[D.x,D.y],t._preload(q[1],function(){n._.fillsize=[this.offsetWidth,this.offsetHeight]})}else j.color=t.getRGB(l.fill).hex,j.src=d,j.type="solid",t.getRGB(l.fill).error&&(m.type in{circle:1,ellipse:1}||"r"!=r(l.fill).charAt())&&T(m,l.fill,j)&&(f.fill="none",f.gradient=l.fill,j.rotate=!1)}if("fill-opacity"in l||"opacity"in l){var V=((+f["fill-opacity"]+1||2)-1)*((+f.opacity+1||2)-1)*((+t.getRGB(l.fill).o+1||2)-1);V=o(s(V,0),1),j.opacity=V,j.src&&(j.color="none")}c.appendChild(j);var O=c.getElementsByTagName("stroke")&&c.getElementsByTagName("stroke")[0],Y=!1;!O&&(Y=O=N("stroke")),(l.stroke&&"none"!=l.stroke||l["stroke-width"]||null!=l["stroke-opacity"]||l["stroke-dasharray"]||l["stroke-miterlimit"]||l["stroke-linejoin"]||l["stroke-linecap"])&&(O.on=!0),("none"==l.stroke||null===l.stroke||null==O.on||0==l.stroke||0==l["stroke-width"])&&(O.on=!1);var W=t.getRGB(l.stroke);O.on&&l.stroke&&(O.color=W.hex),V=((+f["stroke-opacity"]+1||2)-1)*((+f.opacity+1||2)-1)*((+W.o+1||2)-1);var G=.75*(i(l["stroke-width"])||1);if(V=o(s(V,0),1),null==l["stroke-width"]&&(G=f["stroke-width"]),l["stroke-width"]&&(O.weight=G),G&&G<1&&(V*=G)&&(O.weight=1),O.opacity=V,l["stroke-linejoin"]&&(O.joinstyle=l["stroke-linejoin"]||"miter"),O.miterlimit=l["stroke-miterlimit"]||8,l["stroke-linecap"]&&(O.endcap="butt"==l["stroke-linecap"]?"flat":"square"==l["stroke-linecap"]?"square":"round"),"stroke-dasharray"in l){var H={"-":"shortdash",".":"shortdot","-.":"shortdashdot","-..":"shortdashdotdot",". ":"dot","- ":"dash","--":"longdash","- .":"dashdot","--.":"longdashdot","--..":"longdashdotdot"};O.dashstyle=H[e](l["stroke-dasharray"])?H[l["stroke-dasharray"]]:d}Y&&c.appendChild(O)}if("text"==m.type){m.paper.canvas.style.display=d;var X=m.paper.span,U=100,$=f.font&&f.font.match(/\d+(?:\.\d*)?(?=px)/);g=X.style,f.font&&(g.font=f.font),f["font-family"]&&(g.fontFamily=f["font-family"]),f["font-weight"]&&(g.fontWeight=f["font-weight"]),f["font-style"]&&(g.fontStyle=f["font-style"]),$=i(f["font-size"]||$&&$[0])||10,g.fontSize=$*U+"px",m.textpath.string&&(X.innerHTML=r(m.textpath.string).replace(/</g,"&#60;").replace(/&/g,"&#38;").replace(/\n/g,"<br>"));var Z=X.getBoundingClientRect();m.W=f.w=(Z.right-Z.left)/U,m.H=f.h=(Z.bottom-Z.top)/U,m.X=f.x,m.Y=f.y+m.H/2,("x"in l||"y"in l)&&(m.path.v=t.format("m{0},{1}l{2},{1}",a(f.x*b),a(f.y*b),a(f.x*b)+1));for(var Q=["x","y","text","font","font-family","font-weight","font-style","font-size"],J=0,K=Q.length;J<K;J++)if(Q[J]in l){m._.dirty=1;break}switch(f["text-anchor"]){case"start":m.textpath.style["v-text-align"]="left",m.bbx=m.W/2;break;case"end":m.textpath.style["v-text-align"]="right",m.bbx=-m.W/2;break;default:m.textpath.style["v-text-align"]="center",m.bbx=0}m.textpath.style["v-text-kern"]=!0}},T=function(e,a,s){e.attrs=e.attrs||{};var o=e.attrs,l=Math.pow,h,u,c="linear",f=".5 .5";if(e.attrs.gradient=a,a=r(a).replace(t._radial_gradient,function(t,e,r){return c="radial",e&&r&&(e=i(e),r=i(r),l(e-.5,2)+l(r-.5,2)>.25&&(r=n.sqrt(.25-l(e-.5,2))*(2*(r>.5)-1)+.5),f=e+p+r),d}),a=a.split(/\s*\-\s*/),"linear"==c){var g=a.shift();if(g=-i(g),isNaN(g))return null}var v=t._parseDots(a);if(!v)return null;if(e=e.shape||e.node,v.length){e.removeChild(s),s.on=!0,s.method="none",s.color=v[0].color,s.color2=v[v.length-1].color;for(var x=[],y=0,m=v.length;y<m;y++)v[y].offset&&x.push(v[y].offset+p+v[y].color);s.colors=x.length?x.join():"0% "+s.color,"radial"==c?(s.type="gradientTitle",s.focus="100%",s.focussize="0 0",s.focusposition=f,s.angle=0):(s.type="gradient",s.angle=(270-g)%360),e.appendChild(s)}return 1},E=function(e,r){this[0]=this.node=e,e.raphael=!0,this.id=t._oid++,e.raphaelid=this.id,this.X=0,this.Y=0,this.attrs={},this.paper=r,this.matrix=t.matrix(),this._={transform:[],sx:1,sy:1,dx:0,dy:0,deg:0,dirty:1,dirtyT:1},!r.bottom&&(r.bottom=this),this.prev=r.top,r.top&&(r.top.next=this),r.top=this,this.next=null},M=t.el;E.prototype=M,M.constructor=E,M.transform=function(e){if(null==e)return this._.transform;var i=this.paper._viewBoxShift,n=i?"s"+[i.scale,i.scale]+"-1-1t"+[i.dx,i.dy]:d,a;i&&(a=e=r(e).replace(/\.{3}|\u2026/g,this._.transform||d)),t._extractTransform(this,n+e);var s=this.matrix.clone(),o=this.skew,l=this.node,h,u=~r(this.attrs.fill).indexOf("-"),c=!r(this.attrs.fill).indexOf("url(");if(s.translate(1,1),c||u||"image"==this.type)if(o.matrix="1 0 0 1",o.offset="0 0",h=s.split(),u&&h.noRotation||!h.isSimple){l.style.filter=s.toFilter();var f=this.getBBox(),g=this.getBBox(1),v=f.x-g.x,x=f.y-g.y;l.coordorigin=v*-b+p+x*-b,C(this,1,1,v,x,0)}else l.style.filter=d,C(this,h.scalex,h.scaley,h.dx,h.dy,h.rotate);else l.style.filter=d,o.matrix=r(s),o.offset=s.offset();return null!==a&&(this._.transform=a,t._extractTransform(this,a)),this},M.rotate=function(t,e,n){if(this.removed)return this;if(null!=t){if(t=r(t).split(u),t.length-1&&(e=i(t[1]),n=i(t[2])),t=i(t[0]),null==n&&(e=n),null==e||null==n){var a=this.getBBox(1);e=a.x+a.width/2,n=a.y+a.height/2}return this._.dirtyT=1,this.transform(this._.transform.concat([["r",t,e,n]])),this}},M.translate=function(t,e){return this.removed?this:(t=r(t).split(u),t.length-1&&(e=i(t[1])),t=i(t[0])||0,e=+e||0,this._.bbox&&(this._.bbox.x+=t,this._.bbox.y+=e),this.transform(this._.transform.concat([["t",t,e]])),this)},M.scale=function(t,e,n,a){if(this.removed)return this;if(t=r(t).split(u),t.length-1&&(e=i(t[1]),n=i(t[2]),a=i(t[3]),isNaN(n)&&(n=null),isNaN(a)&&(a=null)),t=i(t[0]),null==e&&(e=t),null==a&&(n=a),null==n||null==a)var s=this.getBBox(1);return n=null==n?s.x+s.width/2:n,a=null==a?s.y+s.height/2:a,this.transform(this._.transform.concat([["s",t,e,n,a]])),this._.dirtyT=1,this},M.hide=function(){return!this.removed&&(this.node.style.display="none"),this},M.show=function(){return!this.removed&&(this.node.style.display=d),this},M.auxGetBBox=t.el.getBBox,M.getBBox=function(){var t=this.auxGetBBox();if(this.paper&&this.paper._viewBoxShift){var e={},r=1/this.paper._viewBoxShift.scale;return e.x=t.x-this.paper._viewBoxShift.dx,e.x*=r,e.y=t.y-this.paper._viewBoxShift.dy,e.y*=r,e.width=t.width*r,e.height=t.height*r,e.x2=e.x+e.width,e.y2=e.y+e.height,e}return t},M._getBBox=function(){return this.removed?{}:{x:this.X+(this.bbx||0)-this.W/2,y:this.Y-this.H,width:this.W,height:this.H}},M.remove=function(){if(!this.removed&&this.node.parentNode){this.paper.__set__&&this.paper.__set__.exclude(this),t.eve.unbind("raphael.*.*."+this.id),t._tear(this,this.paper),this.node.parentNode.removeChild(this.node),this.shape&&this.shape.parentNode.removeChild(this.shape);for(var e in this)this[e]="function"==typeof this[e]?t._removedFactory(e):null;this.removed=!0}},M.attr=function(r,i){if(this.removed)return this;if(null==r){var n={};for(var a in this.attrs)this.attrs[e](a)&&(n[a]=this.attrs[a]);return n.gradient&&"none"==n.fill&&(n.fill=n.gradient)&&delete n.gradient,n.transform=this._.transform,n}if(null==i&&t.is(r,"string")){if(r==h&&"none"==this.attrs.fill&&this.attrs.gradient)return this.attrs.gradient;for(var s=r.split(u),o={},l=0,f=s.length;l<f;l++)r=s[l],r in this.attrs?o[r]=this.attrs[r]:t.is(this.paper.customAttributes[r],"function")?o[r]=this.paper.customAttributes[r].def:o[r]=t._availableAttrs[r];return f-1?o:o[s[0]]}if(this.attrs&&null==i&&t.is(r,"array")){for(o={},l=0,f=r.length;l<f;l++)o[r[l]]=this.attr(r[l]);return o}var p;null!=i&&(p={},p[r]=i),null==i&&t.is(r,"object")&&(p=r);for(var d in p)c("raphael.attr."+d+"."+this.id,this,p[d]);if(p){for(d in this.paper.customAttributes)if(this.paper.customAttributes[e](d)&&p[e](d)&&t.is(this.paper.customAttributes[d],"function")){var g=this.paper.customAttributes[d].apply(this,[].concat(p[d]));this.attrs[d]=p[d];for(var v in g)g[e](v)&&(p[v]=g[v])}p.text&&"text"==this.type&&(this.textpath.string=p.text),A(this,p)}return this},M.toFront=function(){return!this.removed&&this.node.parentNode.appendChild(this.node),this.paper&&this.paper.top!=this&&t._tofront(this,this.paper),this},M.toBack=function(){return this.removed?this:(this.node.parentNode.firstChild!=this.node&&(this.node.parentNode.insertBefore(this.node,this.node.parentNode.firstChild),t._toback(this,this.paper)),this)},M.insertAfter=function(e){return this.removed?this:(e.constructor==t.st.constructor&&(e=e[e.length-1]),e.node.nextSibling?e.node.parentNode.insertBefore(this.node,e.node.nextSibling):e.node.parentNode.appendChild(this.node),t._insertafter(this,e,this.paper),this)},M.insertBefore=function(e){return this.removed?this:(e.constructor==t.st.constructor&&(e=e[0]),e.node.parentNode.insertBefore(this.node,e.node),t._insertbefore(this,e,this.paper),this)},M.blur=function(e){var r=this.node.runtimeStyle,i=r.filter;return i=i.replace(x,d),0!==+e?(this.attrs.blur=e,r.filter=i+p+f+".Blur(pixelradius="+(+e||1.5)+")",r.margin=t.format("-{0}px 0 0 -{0}px",a(+e||1.5))):(r.filter=i,r.margin=0,delete this.attrs.blur),this},t._engine.path=function(t,e){var r=N("shape");r.style.cssText=m,r.coordsize=b+p+b,r.coordorigin=e.coordorigin;var i=new E(r,e),n={fill:"none",stroke:"#000"};t&&(n.path=t),i.type="path",i.path=[],i.Path=d,A(i,n),e.canvas&&e.canvas.appendChild(r);var a=N("skew");return a.on=!0,r.appendChild(a),i.skew=a,i.transform(d),i},t._engine.rect=function(e,r,i,n,a,s){var o=t._rectPath(r,i,n,a,s),l=e.path(o),h=l.attrs;return l.X=h.x=r,l.Y=h.y=i,l.W=h.width=n,l.H=h.height=a,h.r=s,h.path=o,l.type="rect",l},t._engine.ellipse=function(t,e,r,i,n){var a=t.path(),s=a.attrs;return a.X=e-i,a.Y=r-n,a.W=2*i,a.H=2*n,a.type="ellipse",A(a,{cx:e,cy:r,rx:i,ry:n}),a},t._engine.circle=function(t,e,r,i){var n=t.path(),a=n.attrs;return n.X=e-i,n.Y=r-i,n.W=n.H=2*i,n.type="circle",A(n,{cx:e,cy:r,r:i}),n},t._engine.image=function(e,r,i,n,a,s){var o=t._rectPath(i,n,a,s),l=e.path(o).attr({stroke:"none"}),u=l.attrs,c=l.node,f=c.getElementsByTagName(h)[0];return u.src=r,l.X=u.x=i,l.Y=u.y=n,l.W=u.width=a,l.H=u.height=s,u.path=o,l.type="image",f.parentNode==c&&c.removeChild(f),f.rotate=!0,f.src=r,f.type="tile",l._.fillpos=[i,n],l._.fillsize=[a,s],c.appendChild(f),C(l,1,1,0,0,0),l},t._engine.text=function(e,i,n,s){var o=N("shape"),l=N("path"),h=N("textpath");i=i||0,n=n||0,s=s||"",l.v=t.format("m{0},{1}l{2},{1}",a(i*b),a(n*b),a(i*b)+1),l.textpathok=!0,h.string=r(s),h.on=!0,o.style.cssText=m,o.coordsize=b+p+b,o.coordorigin="0 0";var u=new E(o,e),c={fill:"#000",stroke:"none",font:t._availableAttrs.font,text:s};u.shape=o,u.path=l,u.textpath=h,u.type="text",u.attrs.text=r(s),u.attrs.x=i,u.attrs.y=n,u.attrs.w=1,u.attrs.h=1,A(u,c),o.appendChild(h),o.appendChild(l),e.canvas.appendChild(o);var f=N("skew");return f.on=!0,o.appendChild(f),u.skew=f,u.transform(d),u},t._engine.setSize=function(e,r){var i=this.canvas.style;return this.width=e,this.height=r,e==+e&&(e+="px"),r==+r&&(r+="px"),i.width=e,i.height=r,i.clip="rect(0 "+e+" "+r+" 0)",this._viewBox&&t._engine.setViewBox.apply(this,this._viewBox),this},t._engine.setViewBox=function(e,r,i,n,a){t.eve("raphael.setViewBox",this,this._viewBox,[e,r,i,n,a]);var s=this.getSize(),o=s.width,l=s.height,h,u;return a&&(h=l/n,u=o/i,i*h<o&&(e-=(o-i*h)/2/h),n*u<l&&(r-=(l-n*u)/2/u)),this._viewBox=[e,r,i,n,!!a],this._viewBoxShift={dx:-e,dy:-r,scale:s},this.forEach(function(t){t.transform("...")}),this};var N;t._engine.initWin=function(t){var e=t.document;e.styleSheets.length<31?e.createStyleSheet().addRule(".rvml","behavior:url(#default#VML)"):e.styleSheets[0].addRule(".rvml","behavior:url(#default#VML)");try{!e.namespaces.rvml&&e.namespaces.add("rvml","urn:schemas-microsoft-com:vml"),N=function(t){return e.createElement("<rvml:"+t+' class="rvml">')}}catch(r){N=function(t){return e.createElement("<"+t+' xmlns="urn:schemas-microsoft.com:vml" class="rvml">')}}},t._engine.initWin(t._g.win),t._engine.create=function(){var e=t._getContainer.apply(0,arguments),r=e.container,i=e.height,n,a=e.width,s=e.x,o=e.y;if(!r)throw new Error("VML container not found.");var l=new t._Paper,h=l.canvas=t._g.doc.createElement("div"),u=h.style;return s=s||0,o=o||0,a=a||512,i=i||342,l.width=a,l.height=i,a==+a&&(a+="px"),i==+i&&(i+="px"),l.coordsize=1e3*b+p+1e3*b,l.coordorigin="0 0",l.span=t._g.doc.createElement("span"),l.span.style.cssText="position:absolute;left:-9999em;top:-9999em;padding:0;margin:0;line-height:1;",h.appendChild(l.span),u.cssText=t.format("top:0;left:0;width:{0};height:{1};display:inline-block;position:relative;clip:rect(0 {0} {1} 0);overflow:hidden",a,i),1==r?(t._g.doc.body.appendChild(h),u.left=s+"px",u.top=o+"px",u.position="absolute"):r.firstChild?r.insertBefore(h,r.firstChild):r.appendChild(h),l.renderfix=function(){},l},t.prototype.clear=function(){t.eve("raphael.clear",this),this.canvas.innerHTML=d,this.span=t._g.doc.createElement("span"),this.span.style.cssText="position:absolute;left:-9999em;top:-9999em;padding:0;margin:0;line-height:1;display:inline;",this.canvas.appendChild(this.span),this.bottom=this.top=null},t.prototype.remove=function(){t.eve("raphael.remove",this),this.canvas.parentNode.removeChild(this.canvas);for(var e in this)this[e]="function"==typeof this[e]?t._removedFactory(e):null;return!0};var L=t.st;for(var z in M)M[e](z)&&!L[e](z)&&(L[z]=function(t){return function(){var e=arguments;return this.forEach(function(r){r[t].apply(r,e)})}}(z))}}.apply(e,i),!(void 0!==n&&(t.exports=n))}])});
},{}],10:[function(require,module,exports){
//     Underscore.js 1.8.3
//     http://underscorejs.org
//     (c) 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind,
    nativeCreate       = Object.create;

  // Naked function reference for surrogate-prototype-swapping.
  var Ctor = function(){};

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.8.3';

  // Internal function that returns an efficient (for current engines) version
  // of the passed-in callback, to be repeatedly applied in other Underscore
  // functions.
  var optimizeCb = function(func, context, argCount) {
    if (context === void 0) return func;
    switch (argCount == null ? 3 : argCount) {
      case 1: return function(value) {
        return func.call(context, value);
      };
      case 2: return function(value, other) {
        return func.call(context, value, other);
      };
      case 3: return function(value, index, collection) {
        return func.call(context, value, index, collection);
      };
      case 4: return function(accumulator, value, index, collection) {
        return func.call(context, accumulator, value, index, collection);
      };
    }
    return function() {
      return func.apply(context, arguments);
    };
  };

  // A mostly-internal function to generate callbacks that can be applied
  // to each element in a collection, returning the desired result — either
  // identity, an arbitrary callback, a property matcher, or a property accessor.
  var cb = function(value, context, argCount) {
    if (value == null) return _.identity;
    if (_.isFunction(value)) return optimizeCb(value, context, argCount);
    if (_.isObject(value)) return _.matcher(value);
    return _.property(value);
  };
  _.iteratee = function(value, context) {
    return cb(value, context, Infinity);
  };

  // An internal function for creating assigner functions.
  var createAssigner = function(keysFunc, undefinedOnly) {
    return function(obj) {
      var length = arguments.length;
      if (length < 2 || obj == null) return obj;
      for (var index = 1; index < length; index++) {
        var source = arguments[index],
            keys = keysFunc(source),
            l = keys.length;
        for (var i = 0; i < l; i++) {
          var key = keys[i];
          if (!undefinedOnly || obj[key] === void 0) obj[key] = source[key];
        }
      }
      return obj;
    };
  };

  // An internal function for creating a new object that inherits from another.
  var baseCreate = function(prototype) {
    if (!_.isObject(prototype)) return {};
    if (nativeCreate) return nativeCreate(prototype);
    Ctor.prototype = prototype;
    var result = new Ctor;
    Ctor.prototype = null;
    return result;
  };

  var property = function(key) {
    return function(obj) {
      return obj == null ? void 0 : obj[key];
    };
  };

  // Helper for collection methods to determine whether a collection
  // should be iterated as an array or as an object
  // Related: http://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength
  // Avoids a very nasty iOS 8 JIT bug on ARM-64. #2094
  var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;
  var getLength = property('length');
  var isArrayLike = function(collection) {
    var length = getLength(collection);
    return typeof length == 'number' && length >= 0 && length <= MAX_ARRAY_INDEX;
  };

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles raw objects in addition to array-likes. Treats all
  // sparse array-likes as if they were dense.
  _.each = _.forEach = function(obj, iteratee, context) {
    iteratee = optimizeCb(iteratee, context);
    var i, length;
    if (isArrayLike(obj)) {
      for (i = 0, length = obj.length; i < length; i++) {
        iteratee(obj[i], i, obj);
      }
    } else {
      var keys = _.keys(obj);
      for (i = 0, length = keys.length; i < length; i++) {
        iteratee(obj[keys[i]], keys[i], obj);
      }
    }
    return obj;
  };

  // Return the results of applying the iteratee to each element.
  _.map = _.collect = function(obj, iteratee, context) {
    iteratee = cb(iteratee, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length,
        results = Array(length);
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      results[index] = iteratee(obj[currentKey], currentKey, obj);
    }
    return results;
  };

  // Create a reducing function iterating left or right.
  function createReduce(dir) {
    // Optimized iterator function as using arguments.length
    // in the main function will deoptimize the, see #1991.
    function iterator(obj, iteratee, memo, keys, index, length) {
      for (; index >= 0 && index < length; index += dir) {
        var currentKey = keys ? keys[index] : index;
        memo = iteratee(memo, obj[currentKey], currentKey, obj);
      }
      return memo;
    }

    return function(obj, iteratee, memo, context) {
      iteratee = optimizeCb(iteratee, context, 4);
      var keys = !isArrayLike(obj) && _.keys(obj),
          length = (keys || obj).length,
          index = dir > 0 ? 0 : length - 1;
      // Determine the initial value if none is provided.
      if (arguments.length < 3) {
        memo = obj[keys ? keys[index] : index];
        index += dir;
      }
      return iterator(obj, iteratee, memo, keys, index, length);
    };
  }

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`.
  _.reduce = _.foldl = _.inject = createReduce(1);

  // The right-associative version of reduce, also known as `foldr`.
  _.reduceRight = _.foldr = createReduce(-1);

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, predicate, context) {
    var key;
    if (isArrayLike(obj)) {
      key = _.findIndex(obj, predicate, context);
    } else {
      key = _.findKey(obj, predicate, context);
    }
    if (key !== void 0 && key !== -1) return obj[key];
  };

  // Return all the elements that pass a truth test.
  // Aliased as `select`.
  _.filter = _.select = function(obj, predicate, context) {
    var results = [];
    predicate = cb(predicate, context);
    _.each(obj, function(value, index, list) {
      if (predicate(value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, predicate, context) {
    return _.filter(obj, _.negate(cb(predicate)), context);
  };

  // Determine whether all of the elements match a truth test.
  // Aliased as `all`.
  _.every = _.all = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length;
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      if (!predicate(obj[currentKey], currentKey, obj)) return false;
    }
    return true;
  };

  // Determine if at least one element in the object matches a truth test.
  // Aliased as `any`.
  _.some = _.any = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length;
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      if (predicate(obj[currentKey], currentKey, obj)) return true;
    }
    return false;
  };

  // Determine if the array or object contains a given item (using `===`).
  // Aliased as `includes` and `include`.
  _.contains = _.includes = _.include = function(obj, item, fromIndex, guard) {
    if (!isArrayLike(obj)) obj = _.values(obj);
    if (typeof fromIndex != 'number' || guard) fromIndex = 0;
    return _.indexOf(obj, item, fromIndex) >= 0;
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      var func = isFunc ? method : value[method];
      return func == null ? func : func.apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, _.property(key));
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs) {
    return _.filter(obj, _.matcher(attrs));
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.find(obj, _.matcher(attrs));
  };

  // Return the maximum element (or element-based computation).
  _.max = function(obj, iteratee, context) {
    var result = -Infinity, lastComputed = -Infinity,
        value, computed;
    if (iteratee == null && obj != null) {
      obj = isArrayLike(obj) ? obj : _.values(obj);
      for (var i = 0, length = obj.length; i < length; i++) {
        value = obj[i];
        if (value > result) {
          result = value;
        }
      }
    } else {
      iteratee = cb(iteratee, context);
      _.each(obj, function(value, index, list) {
        computed = iteratee(value, index, list);
        if (computed > lastComputed || computed === -Infinity && result === -Infinity) {
          result = value;
          lastComputed = computed;
        }
      });
    }
    return result;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iteratee, context) {
    var result = Infinity, lastComputed = Infinity,
        value, computed;
    if (iteratee == null && obj != null) {
      obj = isArrayLike(obj) ? obj : _.values(obj);
      for (var i = 0, length = obj.length; i < length; i++) {
        value = obj[i];
        if (value < result) {
          result = value;
        }
      }
    } else {
      iteratee = cb(iteratee, context);
      _.each(obj, function(value, index, list) {
        computed = iteratee(value, index, list);
        if (computed < lastComputed || computed === Infinity && result === Infinity) {
          result = value;
          lastComputed = computed;
        }
      });
    }
    return result;
  };

  // Shuffle a collection, using the modern version of the
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
  _.shuffle = function(obj) {
    var set = isArrayLike(obj) ? obj : _.values(obj);
    var length = set.length;
    var shuffled = Array(length);
    for (var index = 0, rand; index < length; index++) {
      rand = _.random(0, index);
      if (rand !== index) shuffled[index] = shuffled[rand];
      shuffled[rand] = set[index];
    }
    return shuffled;
  };

  // Sample **n** random values from a collection.
  // If **n** is not specified, returns a single random element.
  // The internal `guard` argument allows it to work with `map`.
  _.sample = function(obj, n, guard) {
    if (n == null || guard) {
      if (!isArrayLike(obj)) obj = _.values(obj);
      return obj[_.random(obj.length - 1)];
    }
    return _.shuffle(obj).slice(0, Math.max(0, n));
  };

  // Sort the object's values by a criterion produced by an iteratee.
  _.sortBy = function(obj, iteratee, context) {
    iteratee = cb(iteratee, context);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value: value,
        index: index,
        criteria: iteratee(value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(behavior) {
    return function(obj, iteratee, context) {
      var result = {};
      iteratee = cb(iteratee, context);
      _.each(obj, function(value, index) {
        var key = iteratee(value, index, obj);
        behavior(result, value, key);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, value, key) {
    if (_.has(result, key)) result[key].push(value); else result[key] = [value];
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  _.indexBy = group(function(result, value, key) {
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = group(function(result, value, key) {
    if (_.has(result, key)) result[key]++; else result[key] = 1;
  });

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (isArrayLike(obj)) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return isArrayLike(obj) ? obj.length : _.keys(obj).length;
  };

  // Split a collection into two arrays: one whose elements all satisfy the given
  // predicate, and one whose elements all do not satisfy the predicate.
  _.partition = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var pass = [], fail = [];
    _.each(obj, function(value, key, obj) {
      (predicate(value, key, obj) ? pass : fail).push(value);
    });
    return [pass, fail];
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    if (n == null || guard) return array[0];
    return _.initial(array, array.length - n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, Math.max(0, array.length - (n == null || guard ? 1 : n)));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if (n == null || guard) return array[array.length - 1];
    return _.rest(array, Math.max(0, array.length - n));
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, n == null || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, strict, startIndex) {
    var output = [], idx = 0;
    for (var i = startIndex || 0, length = getLength(input); i < length; i++) {
      var value = input[i];
      if (isArrayLike(value) && (_.isArray(value) || _.isArguments(value))) {
        //flatten current level of array or arguments object
        if (!shallow) value = flatten(value, shallow, strict);
        var j = 0, len = value.length;
        output.length += len;
        while (j < len) {
          output[idx++] = value[j++];
        }
      } else if (!strict) {
        output[idx++] = value;
      }
    }
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, false);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iteratee, context) {
    if (!_.isBoolean(isSorted)) {
      context = iteratee;
      iteratee = isSorted;
      isSorted = false;
    }
    if (iteratee != null) iteratee = cb(iteratee, context);
    var result = [];
    var seen = [];
    for (var i = 0, length = getLength(array); i < length; i++) {
      var value = array[i],
          computed = iteratee ? iteratee(value, i, array) : value;
      if (isSorted) {
        if (!i || seen !== computed) result.push(value);
        seen = computed;
      } else if (iteratee) {
        if (!_.contains(seen, computed)) {
          seen.push(computed);
          result.push(value);
        }
      } else if (!_.contains(result, value)) {
        result.push(value);
      }
    }
    return result;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(flatten(arguments, true, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var result = [];
    var argsLength = arguments.length;
    for (var i = 0, length = getLength(array); i < length; i++) {
      var item = array[i];
      if (_.contains(result, item)) continue;
      for (var j = 1; j < argsLength; j++) {
        if (!_.contains(arguments[j], item)) break;
      }
      if (j === argsLength) result.push(item);
    }
    return result;
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = flatten(arguments, true, true, 1);
    return _.filter(array, function(value){
      return !_.contains(rest, value);
    });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    return _.unzip(arguments);
  };

  // Complement of _.zip. Unzip accepts an array of arrays and groups
  // each array's elements on shared indices
  _.unzip = function(array) {
    var length = array && _.max(array, getLength).length || 0;
    var result = Array(length);

    for (var index = 0; index < length; index++) {
      result[index] = _.pluck(array, index);
    }
    return result;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    var result = {};
    for (var i = 0, length = getLength(list); i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // Generator function to create the findIndex and findLastIndex functions
  function createPredicateIndexFinder(dir) {
    return function(array, predicate, context) {
      predicate = cb(predicate, context);
      var length = getLength(array);
      var index = dir > 0 ? 0 : length - 1;
      for (; index >= 0 && index < length; index += dir) {
        if (predicate(array[index], index, array)) return index;
      }
      return -1;
    };
  }

  // Returns the first index on an array-like that passes a predicate test
  _.findIndex = createPredicateIndexFinder(1);
  _.findLastIndex = createPredicateIndexFinder(-1);

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iteratee, context) {
    iteratee = cb(iteratee, context, 1);
    var value = iteratee(obj);
    var low = 0, high = getLength(array);
    while (low < high) {
      var mid = Math.floor((low + high) / 2);
      if (iteratee(array[mid]) < value) low = mid + 1; else high = mid;
    }
    return low;
  };

  // Generator function to create the indexOf and lastIndexOf functions
  function createIndexFinder(dir, predicateFind, sortedIndex) {
    return function(array, item, idx) {
      var i = 0, length = getLength(array);
      if (typeof idx == 'number') {
        if (dir > 0) {
            i = idx >= 0 ? idx : Math.max(idx + length, i);
        } else {
            length = idx >= 0 ? Math.min(idx + 1, length) : idx + length + 1;
        }
      } else if (sortedIndex && idx && length) {
        idx = sortedIndex(array, item);
        return array[idx] === item ? idx : -1;
      }
      if (item !== item) {
        idx = predicateFind(slice.call(array, i, length), _.isNaN);
        return idx >= 0 ? idx + i : -1;
      }
      for (idx = dir > 0 ? i : length - 1; idx >= 0 && idx < length; idx += dir) {
        if (array[idx] === item) return idx;
      }
      return -1;
    };
  }

  // Return the position of the first occurrence of an item in an array,
  // or -1 if the item is not included in the array.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = createIndexFinder(1, _.findIndex, _.sortedIndex);
  _.lastIndexOf = createIndexFinder(-1, _.findLastIndex);

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (stop == null) {
      stop = start || 0;
      start = 0;
    }
    step = step || 1;

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var range = Array(length);

    for (var idx = 0; idx < length; idx++, start += step) {
      range[idx] = start;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Determines whether to execute a function as a constructor
  // or a normal function with the provided arguments
  var executeBound = function(sourceFunc, boundFunc, context, callingContext, args) {
    if (!(callingContext instanceof boundFunc)) return sourceFunc.apply(context, args);
    var self = baseCreate(sourceFunc.prototype);
    var result = sourceFunc.apply(self, args);
    if (_.isObject(result)) return result;
    return self;
  };

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError('Bind must be called on a function');
    var args = slice.call(arguments, 2);
    var bound = function() {
      return executeBound(func, bound, context, this, args.concat(slice.call(arguments)));
    };
    return bound;
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context. _ acts
  // as a placeholder, allowing any combination of arguments to be pre-filled.
  _.partial = function(func) {
    var boundArgs = slice.call(arguments, 1);
    var bound = function() {
      var position = 0, length = boundArgs.length;
      var args = Array(length);
      for (var i = 0; i < length; i++) {
        args[i] = boundArgs[i] === _ ? arguments[position++] : boundArgs[i];
      }
      while (position < arguments.length) args.push(arguments[position++]);
      return executeBound(func, bound, this, this, args);
    };
    return bound;
  };

  // Bind a number of an object's methods to that object. Remaining arguments
  // are the method names to be bound. Useful for ensuring that all callbacks
  // defined on an object belong to it.
  _.bindAll = function(obj) {
    var i, length = arguments.length, key;
    if (length <= 1) throw new Error('bindAll must be passed function names');
    for (i = 1; i < length; i++) {
      key = arguments[i];
      obj[key] = _.bind(obj[key], obj);
    }
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memoize = function(key) {
      var cache = memoize.cache;
      var address = '' + (hasher ? hasher.apply(this, arguments) : key);
      if (!_.has(cache, address)) cache[address] = func.apply(this, arguments);
      return cache[address];
    };
    memoize.cache = {};
    return memoize;
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){
      return func.apply(null, args);
    }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = _.partial(_.delay, _, 1);

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    if (!options) options = {};
    var later = function() {
      previous = options.leading === false ? 0 : _.now();
      timeout = null;
      result = func.apply(context, args);
      if (!timeout) context = args = null;
    };
    return function() {
      var now = _.now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0 || remaining > wait) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        previous = now;
        result = func.apply(context, args);
        if (!timeout) context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, args, context, timestamp, result;

    var later = function() {
      var last = _.now() - timestamp;

      if (last < wait && last >= 0) {
        timeout = setTimeout(later, wait - last);
      } else {
        timeout = null;
        if (!immediate) {
          result = func.apply(context, args);
          if (!timeout) context = args = null;
        }
      }
    };

    return function() {
      context = this;
      args = arguments;
      timestamp = _.now();
      var callNow = immediate && !timeout;
      if (!timeout) timeout = setTimeout(later, wait);
      if (callNow) {
        result = func.apply(context, args);
        context = args = null;
      }

      return result;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return _.partial(wrapper, func);
  };

  // Returns a negated version of the passed-in predicate.
  _.negate = function(predicate) {
    return function() {
      return !predicate.apply(this, arguments);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var args = arguments;
    var start = args.length - 1;
    return function() {
      var i = start;
      var result = args[start].apply(this, arguments);
      while (i--) result = args[i].call(this, result);
      return result;
    };
  };

  // Returns a function that will only be executed on and after the Nth call.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Returns a function that will only be executed up to (but not including) the Nth call.
  _.before = function(times, func) {
    var memo;
    return function() {
      if (--times > 0) {
        memo = func.apply(this, arguments);
      }
      if (times <= 1) func = null;
      return memo;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = _.partial(_.before, 2);

  // Object Functions
  // ----------------

  // Keys in IE < 9 that won't be iterated by `for key in ...` and thus missed.
  var hasEnumBug = !{toString: null}.propertyIsEnumerable('toString');
  var nonEnumerableProps = ['valueOf', 'isPrototypeOf', 'toString',
                      'propertyIsEnumerable', 'hasOwnProperty', 'toLocaleString'];

  function collectNonEnumProps(obj, keys) {
    var nonEnumIdx = nonEnumerableProps.length;
    var constructor = obj.constructor;
    var proto = (_.isFunction(constructor) && constructor.prototype) || ObjProto;

    // Constructor is a special case.
    var prop = 'constructor';
    if (_.has(obj, prop) && !_.contains(keys, prop)) keys.push(prop);

    while (nonEnumIdx--) {
      prop = nonEnumerableProps[nonEnumIdx];
      if (prop in obj && obj[prop] !== proto[prop] && !_.contains(keys, prop)) {
        keys.push(prop);
      }
    }
  }

  // Retrieve the names of an object's own properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = function(obj) {
    if (!_.isObject(obj)) return [];
    if (nativeKeys) return nativeKeys(obj);
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    // Ahem, IE < 9.
    if (hasEnumBug) collectNonEnumProps(obj, keys);
    return keys;
  };

  // Retrieve all the property names of an object.
  _.allKeys = function(obj) {
    if (!_.isObject(obj)) return [];
    var keys = [];
    for (var key in obj) keys.push(key);
    // Ahem, IE < 9.
    if (hasEnumBug) collectNonEnumProps(obj, keys);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Returns the results of applying the iteratee to each element of the object
  // In contrast to _.map it returns an object
  _.mapObject = function(obj, iteratee, context) {
    iteratee = cb(iteratee, context);
    var keys =  _.keys(obj),
          length = keys.length,
          results = {},
          currentKey;
      for (var index = 0; index < length; index++) {
        currentKey = keys[index];
        results[currentKey] = iteratee(obj[currentKey], currentKey, obj);
      }
      return results;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = createAssigner(_.allKeys);

  // Assigns a given object with all the own properties in the passed-in object(s)
  // (https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object/assign)
  _.extendOwn = _.assign = createAssigner(_.keys);

  // Returns the first key on an object that passes a predicate test
  _.findKey = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = _.keys(obj), key;
    for (var i = 0, length = keys.length; i < length; i++) {
      key = keys[i];
      if (predicate(obj[key], key, obj)) return key;
    }
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(object, oiteratee, context) {
    var result = {}, obj = object, iteratee, keys;
    if (obj == null) return result;
    if (_.isFunction(oiteratee)) {
      keys = _.allKeys(obj);
      iteratee = optimizeCb(oiteratee, context);
    } else {
      keys = flatten(arguments, false, false, 1);
      iteratee = function(value, key, obj) { return key in obj; };
      obj = Object(obj);
    }
    for (var i = 0, length = keys.length; i < length; i++) {
      var key = keys[i];
      var value = obj[key];
      if (iteratee(value, key, obj)) result[key] = value;
    }
    return result;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj, iteratee, context) {
    if (_.isFunction(iteratee)) {
      iteratee = _.negate(iteratee);
    } else {
      var keys = _.map(flatten(arguments, false, false, 1), String);
      iteratee = function(value, key) {
        return !_.contains(keys, key);
      };
    }
    return _.pick(obj, iteratee, context);
  };

  // Fill in a given object with default properties.
  _.defaults = createAssigner(_.allKeys, true);

  // Creates an object that inherits from the given prototype object.
  // If additional properties are provided then they will be added to the
  // created object.
  _.create = function(prototype, props) {
    var result = baseCreate(prototype);
    if (props) _.extendOwn(result, props);
    return result;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Returns whether an object has a given set of `key:value` pairs.
  _.isMatch = function(object, attrs) {
    var keys = _.keys(attrs), length = keys.length;
    if (object == null) return !length;
    var obj = Object(object);
    for (var i = 0; i < length; i++) {
      var key = keys[i];
      if (attrs[key] !== obj[key] || !(key in obj)) return false;
    }
    return true;
  };


  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a === 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className !== toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, regular expressions, dates, and booleans are compared by value.
      case '[object RegExp]':
      // RegExps are coerced to strings for comparison (Note: '' + /a/i === '/a/i')
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return '' + a === '' + b;
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive.
        // Object(NaN) is equivalent to NaN
        if (+a !== +a) return +b !== +b;
        // An `egal` comparison is performed for other numeric values.
        return +a === 0 ? 1 / +a === 1 / b : +a === +b;
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a === +b;
    }

    var areArrays = className === '[object Array]';
    if (!areArrays) {
      if (typeof a != 'object' || typeof b != 'object') return false;

      // Objects with different constructors are not equivalent, but `Object`s or `Array`s
      // from different frames are.
      var aCtor = a.constructor, bCtor = b.constructor;
      if (aCtor !== bCtor && !(_.isFunction(aCtor) && aCtor instanceof aCtor &&
                               _.isFunction(bCtor) && bCtor instanceof bCtor)
                          && ('constructor' in a && 'constructor' in b)) {
        return false;
      }
    }
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.

    // Initializing stack of traversed objects.
    // It's done here since we only need them for objects and arrays comparison.
    aStack = aStack || [];
    bStack = bStack || [];
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] === a) return bStack[length] === b;
    }

    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);

    // Recursively compare objects and arrays.
    if (areArrays) {
      // Compare array lengths to determine if a deep comparison is necessary.
      length = a.length;
      if (length !== b.length) return false;
      // Deep compare the contents, ignoring non-numeric properties.
      while (length--) {
        if (!eq(a[length], b[length], aStack, bStack)) return false;
      }
    } else {
      // Deep compare objects.
      var keys = _.keys(a), key;
      length = keys.length;
      // Ensure that both objects contain the same number of properties before comparing deep equality.
      if (_.keys(b).length !== length) return false;
      while (length--) {
        // Deep compare each member
        key = keys[length];
        if (!(_.has(b, key) && eq(a[key], b[key], aStack, bStack))) return false;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return true;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (isArrayLike(obj) && (_.isArray(obj) || _.isString(obj) || _.isArguments(obj))) return obj.length === 0;
    return _.keys(obj).length === 0;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) === '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    var type = typeof obj;
    return type === 'function' || type === 'object' && !!obj;
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp, isError.
  _.each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp', 'Error'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) === '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE < 9), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return _.has(obj, 'callee');
    };
  }

  // Optimize `isFunction` if appropriate. Work around some typeof bugs in old v8,
  // IE 11 (#1621), and in Safari 8 (#1929).
  if (typeof /./ != 'function' && typeof Int8Array != 'object') {
    _.isFunction = function(obj) {
      return typeof obj == 'function' || false;
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj !== +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) === '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return obj != null && hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iteratees.
  _.identity = function(value) {
    return value;
  };

  // Predicate-generating functions. Often useful outside of Underscore.
  _.constant = function(value) {
    return function() {
      return value;
    };
  };

  _.noop = function(){};

  _.property = property;

  // Generates a function for a given object that returns a given property.
  _.propertyOf = function(obj) {
    return obj == null ? function(){} : function(key) {
      return obj[key];
    };
  };

  // Returns a predicate for checking whether an object has a given set of
  // `key:value` pairs.
  _.matcher = _.matches = function(attrs) {
    attrs = _.extendOwn({}, attrs);
    return function(obj) {
      return _.isMatch(obj, attrs);
    };
  };

  // Run a function **n** times.
  _.times = function(n, iteratee, context) {
    var accum = Array(Math.max(0, n));
    iteratee = optimizeCb(iteratee, context, 1);
    for (var i = 0; i < n; i++) accum[i] = iteratee(i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // A (possibly faster) way to get the current timestamp as an integer.
  _.now = Date.now || function() {
    return new Date().getTime();
  };

   // List of HTML entities for escaping.
  var escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '`': '&#x60;'
  };
  var unescapeMap = _.invert(escapeMap);

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  var createEscaper = function(map) {
    var escaper = function(match) {
      return map[match];
    };
    // Regexes for identifying a key that needs to be escaped
    var source = '(?:' + _.keys(map).join('|') + ')';
    var testRegexp = RegExp(source);
    var replaceRegexp = RegExp(source, 'g');
    return function(string) {
      string = string == null ? '' : '' + string;
      return testRegexp.test(string) ? string.replace(replaceRegexp, escaper) : string;
    };
  };
  _.escape = createEscaper(escapeMap);
  _.unescape = createEscaper(unescapeMap);

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property, fallback) {
    var value = object == null ? void 0 : object[property];
    if (value === void 0) {
      value = fallback;
    }
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\u2028|\u2029/g;

  var escapeChar = function(match) {
    return '\\' + escapes[match];
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  // NB: `oldSettings` only exists for backwards compatibility.
  _.template = function(text, settings, oldSettings) {
    if (!settings && oldSettings) settings = oldSettings;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset).replace(escaper, escapeChar);
      index = offset + match.length;

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      } else if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      } else if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }

      // Adobe VMs need the match returned to produce the correct offest.
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + 'return __p;\n';

    try {
      var render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled source as a convenience for precompilation.
    var argument = settings.variable || 'obj';
    template.source = 'function(' + argument + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function. Start chaining a wrapped Underscore object.
  _.chain = function(obj) {
    var instance = _(obj);
    instance._chain = true;
    return instance;
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(instance, obj) {
    return instance._chain ? _(obj).chain() : obj;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    _.each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result(this, func.apply(_, args));
      };
    });
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  _.each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name === 'shift' || name === 'splice') && obj.length === 0) delete obj[0];
      return result(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  _.each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result(this, method.apply(this._wrapped, arguments));
    };
  });

  // Extracts the result from a wrapped and chained object.
  _.prototype.value = function() {
    return this._wrapped;
  };

  // Provide unwrapping proxy for some methods used in engine operations
  // such as arithmetic and JSON stringification.
  _.prototype.valueOf = _.prototype.toJSON = _.prototype.value;

  _.prototype.toString = function() {
    return '' + this._wrapped;
  };

  // AMD registration happens at the end for compatibility with AMD loaders
  // that may not enforce next-turn semantics on modules. Even though general
  // practice for AMD registration is to be anonymous, underscore registers
  // as a named module because, like jQuery, it is a base library that is
  // popular enough to be bundled in a third party lib, but not be part of
  // an AMD load request. Those cases could generate an error when an
  // anonymous define() is called outside of a loader request.
  if (typeof define === 'function' && define.amd) {
    define('underscore', [], function() {
      return _;
    });
  }
}.call(this));

},{}],11:[function(require,module,exports){
// Vendors
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;
var Marionette = require('backbone.marionette');
var BackboneRaphael = require('./vendors/backbone.raphael.js')
// Local
var TodoModule = require('./modules/todo/module');

// app bootstrap
var app = new Marionette.Application();
app.module('todo', TodoModule);
app.start();
Backbone.history.start();

module.exports = app;

},{"./modules/todo/module":15,"./vendors/backbone.raphael.js":27,"backbone":false,"backbone.marionette":false,"jquery":false}],12:[function(require,module,exports){
var Marionette = require('backbone.marionette');

var Backbone = require('backbone');


var TodoLayout = require('./views/layout/layout');
var TodosCollection = require('./models/todos');

var periode = 1000


module.exports = Marionette.Controller.extend({

    onStart: function() {
        this.todosCollection = new TodosCollection();
        this.todosLayout = new TodoLayout({todosCollection: this.todosCollection});

        var onSuccess = function() {
            this.options.todoRegion.show(this.todosLayout);
        }.bind(this);
        this.todosCollection.fetch({success: onSuccess,
            complete: function(){
                setInterval(function() { Backbone.trigger('tick:30secs'); }, periode);
            }
        });
        console.log (this.todosCollection)
    },


    filterItems: function(filter) {
        // filter = (filter && filter.trim() || 'all');
        // this.todosLayout.updateFilter(filter);
    }

});

},{"./models/todos":14,"./views/layout/layout":22,"backbone":false,"backbone.marionette":false}],13:[function(require,module,exports){
var Backbone = require('backbone');



module.exports = Backbone.Model.extend({

    defaults: {
        radio: 100
    },

    initialize: function () {
        // if (this.isNew()) {
        //     this.set('created', Date.now());
        // }
    },

    getColor: function () {
        var colors = [
            "#bf0000",
            "#bf5600",
            "#bfac00",
            "#7cbf00",
            "#26bf00",
          ]

          free_places = this.get('free_places')
          return colors[free_places]
    },

    // toggle: function () {
    //     return this.set('completed', !this.isCompleted());
    // },

    // isCompleted: function () {
    //     return this.get('completed');
    // }

});
},{"backbone":false}],14:[function(require,module,exports){
var Backbone = require('backbone');
Backbone.LocalStorage = require("backbone.localstorage");

var TableModel = require('./table');



module.exports = Backbone.Collection.extend({

    model: TableModel,

    // localStorage: new Backbone.LocalStorage('todos-backbone-marionette-browserify'),
    url: 'http://localhost/serveur/process.php',

    initialize: function () {
        this.listenTo( Backbone, 'tick:30secs', this.fetch, this );
    },
    getCompleted: function () {
        return this.filter(this._isCompleted);
    },

    fetchg: function () {
        // return this.reject(this._isCompleted);
        console.log('yeh(')
    },

    comparator: function (todo) {
        return todo.get('created');
    },



    _isCompleted: function (todo) {
        return todo.isCompleted();
    }

});
},{"./table":13,"backbone":false,"backbone.localstorage":false}],15:[function(require,module,exports){
var Controller, Marionette, Router, TodoModule,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

Marionette = require('backbone.marionette');

Router = require('./router');

Controller = require('./controller');

TodoModule = (function(_super) {
  __extends(TodoModule, _super);

  function TodoModule() {
    return TodoModule.__super__.constructor.apply(this, arguments);
  }

  TodoModule.prototype.initialize = function() {
    return this.todoRegionId = 'todo-module-region';
  };

  TodoModule.prototype.onStart = function() {
    this._createContainer();
    this._addRegion();
    return this._startMediator();
  };

  TodoModule.prototype.onStop = function() {
    this._stopMediator();
    this._removeRegion();
    return this._destroyContainer();
  };

  TodoModule.prototype._createContainer = function() {
    var node;
    node = document.createElement('div');
    node.id = this.todoRegionId;
    node["class"] = 'content';
    return document.body.appendChild(node);
  };

  TodoModule.prototype._addRegion = function() {
    return this.app.addRegions({
      todoRegion: '#' + this.todoRegionId
    });
  };

  TodoModule.prototype._startMediator = function() {
    var router;
    this.controller = new Controller({
      todoRegion: this.app.todoRegion
    });
    return router = new Router({
      controller: this.controller
    });
  };

  TodoModule.prototype._destroyContainer = function() {
    var node;
    node = document.getElementById(this.todoRegionId);
    return node != null ? node.parentElement.removeChild(node) : void 0;
  };

  TodoModule.prototype._removeRegion = function() {
    return this.app.removeRegion('todoRegion');
  };

  TodoModule.prototype._stopMediator = function() {
    return this.controller.stop();
  };

  return TodoModule;

})(Marionette.Module);

module.exports = TodoModule;


},{"./controller":12,"./router":16,"backbone.marionette":false}],16:[function(require,module,exports){
var Marionette = require('backbone.marionette');



module.exports = Marionette.AppRouter.extend({

    // extend AppRouter to tell the controller
    // when the router is ok
    constructor: function(options) {
        Marionette.AppRouter.prototype.constructor.call(this, options);
        this._getController().triggerMethod('start');
    },


    appRoutes: {
        '*filter': 'filterItems'
    }

});
},{"backbone.marionette":false}],17:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  
  return "class=\"hidden\"";
  }

  buffer += "<span id=\"todo-count\">\n    <strong>";
  if (helper = helpers.activeCount) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.activeCount); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</strong> ";
  if (helper = helpers.activeCountLabel) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.activeCountLabel); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n</span>\n<ul id=\"filters\">\n    <li>\n        <a href=\"#\">All</a>\n    </li>\n    <li>\n        <a href=\"#active\">Active</a>\n    </li>\n    <li>\n        <a href=\"#completed\">Completed</a>\n    </li>\n</ul>\n<button id=\"clear-completed\" ";
  stack1 = helpers.unless.call(depth0, (depth0 && depth0.completedCount), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += ">\n    Clear completed (";
  if (helper = helpers.completedCount) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.completedCount); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + ")\n</button>";
  return buffer;
  });

},{"hbsfy/runtime":8}],18:[function(require,module,exports){
var Marionette = require('backbone.marionette');

var tpl = require('./footer.hbs');



module.exports = Marionette.ItemView.extend({
    template: tpl,

    ui: {
        filters: '#filters a'
    },

    events: {
        'click #clear-completed': 'onClearClick'
    },

    collectionEvents: {
        'all': 'render'
    },

    templateHelpers: {
        activeCountLabel: (this.activeCount === 1 ? 'item' : 'items') + ' left'
    },

    serializeData: function () {
        var active = this.collection.getActive().length;
        var total = this.collection.length;

        return {
            activeCount: active,
            totalCount: total,
            completedCount: total - active
        };
    },

    // use onRender only for update after
    // first render / show
    onRender: function() {
        this.update();
    },

    // use onShow rather than onRender because DOM is not ready
    // and this.$el find or parent will return nothing
    onShow: function () {
        this.update();
    },

    onClearClick: function () {
        var completed = this.collection.getCompleted();
        completed.forEach(function (todo) {
            todo.destroy();
        });
    },

    update: function() {
        this.$el.parent().toggle(this.collection.length > 0);
    }

});
},{"./footer.hbs":17,"backbone.marionette":false}],19:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<h1>todos</h1>\n<form>\n    <input id=\"new-todo\" placeholder=\"What needs to be done?\" autofocus>\n</form>";
  });

},{"hbsfy/runtime":8}],20:[function(require,module,exports){
var Marionette = require('backbone.marionette');

var tpl = require('./header.hbs');



module.exports = Marionette.ItemView.extend({

    template: tpl,

    ui: {
        input: '#new-todo'
    },

    events: {
        'submit form': 'onSubmit'
    },



    onSubmit: function (e) {
        // prevent form orignal submit
        e.preventDefault();

        var todoText = this.ui.input.val().trim();
        if (todoText) {
            this.collection.create({
                title: todoText
            });
            this.ui.input.val('');
        }
    }

});
},{"./header.hbs":19,"backbone.marionette":false}],21:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<div class=\"content-resto\" id=\"holder\">\n    <section id=\"todoapp\">\n        <header id=\"header\"></header>\n        <section id=\"main\"></section>\n        <footer id=\"footer\"></footer>\n    </section>\n    <p id=\"copy\">MiniProjet - FastResto</p>\n</div>\n\n<!-- <footer id=\"info\">\n    <p>Double-click to edit a todo</p>\n    <p>Written by <a href=\"https://github.com/JSteunou\">Jérôme Steunou</a>\n        based on <a href=\"https://github.com/addyosmani\">Addy Osmani TodoMVC project</a><br>\n        and the <a href=\"http://todomvc.com/labs/architecture-examples/backbone_marionette/\">Marionette TodoMVC</a>\n        created by <a href=\"http://github.com/jsoverson\">Jarrod Overson</a>\n        and <a href=\"http://github.com/derickbailey\">Derick Bailey</a>\n    </p>\n</footer> -->\n";
  });

},{"hbsfy/runtime":8}],22:[function(require,module,exports){
var Marionette = require('backbone.marionette');


var HeaderView = require('./header/header');
var TodosView = require('../todos/collection');
var FooterView = require('./footer/footer');
var tpl = require('./layout.hbs');



module.exports = Marionette.Layout.extend({
    template: tpl,
    className: '',
    id: 'main-region',

    ui: {
        app: '#todoapp'
    },

    regions: {
        header:     '#header',
        main:       '#main',
        footer:     '#footer'
    },



    updateFilter: function(filter) {
        this.ui.app.attr('class', 'filter-' + filter);
    },



    onShow: function() {
        var options = {collection: this.options.todosCollection};

        // this.header.show(new HeaderView(options));
        this.main.show(new TodosView(options));
        // this.footer.show(new FooterView(options));
    }

});

},{"../todos/collection":24,"./footer/footer":18,"./header/header":20,"./layout.hbs":21,"backbone.marionette":false}],23:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<div id=\"todo-list\"></div>";
  });

},{"hbsfy/runtime":8}],24:[function(require,module,exports){
var Marionette = require('backbone.marionette');

var TodoItemView = require('./item');
var tpl = require('./collection.hbs');
var Raphael = require('raphael');



// Item List View
// --------------
//
// Controls the rendering of the list of items, including the
// filtering of activs vs completed items for display.
module.exports = Marionette.CompositeView.extend({
    template: tpl,
    itemView: TodoItemView,
    itemViewContainer: '#todo-list',
    itemViewOptions: function(){
        return {paper: this.paper}
    },

    ui: {
        toggle: '#toggle-all'
    },

    events: {
        'click @ui.toggle': 'onToggleAllClick'
    },

    collectionEvents: {
        'sync': 'update'
    },

    initialize: function(options){
        this.paper = Raphael("holder", 1600, 680);
        // this.paper.clear()
    },
    // use onShow rather than onRender because DOM is not ready
    // and this.$el find or parent will return nothing
    onShow: function () {
        // this.update();
    },

    update: function () {
        // function reduceCompleted(left, right) {
        //     return left && right.get('completed');
        // }

        // var allCompleted = this.collection.reduce(reduceCompleted, true);

        // this.ui.toggle.prop('checked', allCompleted);
        // this.$el.parent().toggle(!!this.collection.length);
        // this.paper.clear()
    },

    onToggleAllClick: function (e) {
        var isChecked = e.currentTarget.checked;

        this.collection.each(function (todo) {
            todo.save({ 'completed': isChecked });
        });
    }

});

},{"./collection.hbs":23,"./item":26,"backbone.marionette":false,"raphael":9}],25:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  
  return "checked";
  }

  buffer += "<!-- <div id=\"element-";
  if (helper = helpers.id) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.id); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\"class=\"view\">\n    <input class=\"toggle\" type=\"checkbox\" ";
  stack1 = helpers['if'].call(depth0, (depth0 && depth0.completed), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += ">\n    <label>";
  if (helper = helpers.title) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.title); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</label>\n    <button class=\"destroy\"></button>\n</div>\n<input class=\"edit\" value=\"";
  if (helper = helpers.title) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.title); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\"> -->\n<!-- <input class=\"edit\" value=\"";
  if (helper = helpers.free_places) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.free_places); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\"> -->";
  return buffer;
  });

},{"hbsfy/runtime":8}],26:[function(require,module,exports){
var Marionette = require('backbone.marionette');

// var Raphael = require('raphael');


var tpl = require('./item.hbs');
var count = 1;
// Todo List Item View
// -------------------
//
// Display an individual todo item, and respond to changes
// that are made to the item, including marking completed.
module.exports = Marionette.ItemView.extend({
    // tagName: 'li',
    template: tpl,

    ui: {
        edit: '.edit'
    },

    // events: {
    //     'click .destroy':       'destroy',
    //     'click .toggle':        'toggle',
    //     'dblclick label':       'onEditClick',
    //     'keydown  @ui.edit':    'onEditKeypress',
    //     'focusout @ui.edit':    'onEditFocusout'
    // },

    modelEvents: {
        'change': 'render'
    },
    initialize: function(options){
        this.paper = options.paper
    },
    erase: function () {
        // console.log('destruido');
    },
    onBeforeDestroy: function() {
    // custom destroying and non-DOM related cleanup goes here
  },
    onRender: function () {
        // this.$el.removeClass('active completed');

        // if (this.model.get('completed')) {
        //     this.$el.addClass('completed');
        // } else {
        //     this.$el.addClass('active');
        // }
        model = this.model
        // var paper = Raphael("todo-list", 480, 940);
        paper = this.paper

        if(this.circle && this.lbl){
            this.circle.remove()
            this.lbl.remove()
        }
        x = model.get("position_x")
        // console.log(count)
        // x = (count*550)
        // if (count <= 1) count++
        y = parseInt(model.get("position_y"))

        color = model.getColor()
        this.circle = paper.circle(x, y, model.get("radio"))
        .attr({stroke: color, fill: color, "fill-opacity": .75})
        this.lbl = paper.text(x, y, model.get("free_places"))
        .attr({"font": '5em "Helvetica Neue", Arial', stroke: "none", fill: "#fff"})
    },
    destroy: function () {
        this.model.destroy();
    },

    toggle: function () {
        this.model.toggle().save();
    },

    onEditClick: function () {
        this.$el.addClass('editing');
        this.ui.edit.focus();
        this.ui.edit.val(this.ui.edit.val());
    },

    onEditFocusout: function () {
        var todoText = this.ui.edit.val().trim();
        if (todoText) {
            this.model.set('title', todoText).save();
            this.$el.removeClass('editing');
        } else {
            this.destroy();
        }
    },

    onEditKeypress: function (e) {
        var ENTER_KEY = 13, ESC_KEY = 27;

        if (e.which === ENTER_KEY) {
            this.onEditFocusout();
            return;
        }

        if (e.which === ESC_KEY) {
            this.ui.edit.val(this.model.get('title'));
            this.$el.removeClass('editing');
        }
    }
});


},{"./item.hbs":25,"backbone.marionette":false}],27:[function(require,module,exports){
var Marionette = require('backbone.marionette');
var Backbone = require('backbone');
var _ = require('underscore');


Backbone.RaphaelView = Marionette.ItemView.extend({

    setElement: function(element, delegate, undelegateEvents) {
        if (this.el && undelegateEvents) this.undelegateEvents();
        // el and $el will be the same, $el would have no special meaning...
        this.el = this.$el = element;
        if (delegate !== false) this.delegateEvents();
        return this;
    },

    delegateEvents: function(events, undelegateEvents) {
        if (!(events || (events = _.result(this, 'events')))) return this;
        if(undelegateEvents) this.undelegateEvents();
        for (var eventName in events) {
            var method = events[eventName];
            if (!_.isFunction(method)) method = this[events[eventName]];
            if (!method) continue;

            method = _.bind(method, this);
            //If it is one of the svg/vml events
            if(this.el[eventName]){
                this.el[eventName](method);
            }
            // Custom events for RaphaelView object
            else{
                this.on(eventName, method);
            }

        }
        return this;
    },

    // Clears all callbacks previously bound to the view with `delegateEvents`.
    undelegateEvents: function() {
        if(this.el.type) this.el.unbindAll();
        return this;
    }

});


},{"backbone":false,"backbone.marionette":false,"underscore":10}]},{},[11])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9uZWxzb24vRG9jdW1lbnRzL01hc3RlciBTRVRJL01pbmlQcm9qZXQvc2NyZWVuL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvbmVsc29uL0RvY3VtZW50cy9NYXN0ZXIgU0VUSS9NaW5pUHJvamV0L3NjcmVlbi9ub2RlX21vZHVsZXMvaGFuZGxlYmFycy9kaXN0L2Nqcy9oYW5kbGViYXJzLnJ1bnRpbWUuanMiLCIvVXNlcnMvbmVsc29uL0RvY3VtZW50cy9NYXN0ZXIgU0VUSS9NaW5pUHJvamV0L3NjcmVlbi9ub2RlX21vZHVsZXMvaGFuZGxlYmFycy9kaXN0L2Nqcy9oYW5kbGViYXJzL2Jhc2UuanMiLCIvVXNlcnMvbmVsc29uL0RvY3VtZW50cy9NYXN0ZXIgU0VUSS9NaW5pUHJvamV0L3NjcmVlbi9ub2RlX21vZHVsZXMvaGFuZGxlYmFycy9kaXN0L2Nqcy9oYW5kbGViYXJzL2V4Y2VwdGlvbi5qcyIsIi9Vc2Vycy9uZWxzb24vRG9jdW1lbnRzL01hc3RlciBTRVRJL01pbmlQcm9qZXQvc2NyZWVuL25vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2Rpc3QvY2pzL2hhbmRsZWJhcnMvcnVudGltZS5qcyIsIi9Vc2Vycy9uZWxzb24vRG9jdW1lbnRzL01hc3RlciBTRVRJL01pbmlQcm9qZXQvc2NyZWVuL25vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2Rpc3QvY2pzL2hhbmRsZWJhcnMvc2FmZS1zdHJpbmcuanMiLCIvVXNlcnMvbmVsc29uL0RvY3VtZW50cy9NYXN0ZXIgU0VUSS9NaW5pUHJvamV0L3NjcmVlbi9ub2RlX21vZHVsZXMvaGFuZGxlYmFycy9kaXN0L2Nqcy9oYW5kbGViYXJzL3V0aWxzLmpzIiwiL1VzZXJzL25lbHNvbi9Eb2N1bWVudHMvTWFzdGVyIFNFVEkvTWluaVByb2pldC9zY3JlZW4vbm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvcnVudGltZS5qcyIsIi9Vc2Vycy9uZWxzb24vRG9jdW1lbnRzL01hc3RlciBTRVRJL01pbmlQcm9qZXQvc2NyZWVuL25vZGVfbW9kdWxlcy9oYnNmeS9ydW50aW1lLmpzIiwiL1VzZXJzL25lbHNvbi9Eb2N1bWVudHMvTWFzdGVyIFNFVEkvTWluaVByb2pldC9zY3JlZW4vbm9kZV9tb2R1bGVzL3JhcGhhZWwvcmFwaGFlbC5taW4uanMiLCIvVXNlcnMvbmVsc29uL0RvY3VtZW50cy9NYXN0ZXIgU0VUSS9NaW5pUHJvamV0L3NjcmVlbi9ub2RlX21vZHVsZXMvdW5kZXJzY29yZS91bmRlcnNjb3JlLmpzIiwiL1VzZXJzL25lbHNvbi9Eb2N1bWVudHMvTWFzdGVyIFNFVEkvTWluaVByb2pldC9zY3JlZW4vc3JjL2FwcC5qcyIsIi9Vc2Vycy9uZWxzb24vRG9jdW1lbnRzL01hc3RlciBTRVRJL01pbmlQcm9qZXQvc2NyZWVuL3NyYy9tb2R1bGVzL3RvZG8vY29udHJvbGxlci5qcyIsIi9Vc2Vycy9uZWxzb24vRG9jdW1lbnRzL01hc3RlciBTRVRJL01pbmlQcm9qZXQvc2NyZWVuL3NyYy9tb2R1bGVzL3RvZG8vbW9kZWxzL3RhYmxlLmpzIiwiL1VzZXJzL25lbHNvbi9Eb2N1bWVudHMvTWFzdGVyIFNFVEkvTWluaVByb2pldC9zY3JlZW4vc3JjL21vZHVsZXMvdG9kby9tb2RlbHMvdG9kb3MuanMiLCIvVXNlcnMvbmVsc29uL0RvY3VtZW50cy9NYXN0ZXIgU0VUSS9NaW5pUHJvamV0L3NjcmVlbi9zcmMvbW9kdWxlcy90b2RvL21vZHVsZS5jb2ZmZWUiLCIvVXNlcnMvbmVsc29uL0RvY3VtZW50cy9NYXN0ZXIgU0VUSS9NaW5pUHJvamV0L3NjcmVlbi9zcmMvbW9kdWxlcy90b2RvL3JvdXRlci5qcyIsIi9Vc2Vycy9uZWxzb24vRG9jdW1lbnRzL01hc3RlciBTRVRJL01pbmlQcm9qZXQvc2NyZWVuL3NyYy9tb2R1bGVzL3RvZG8vdmlld3MvbGF5b3V0L2Zvb3Rlci9mb290ZXIuaGJzIiwiL1VzZXJzL25lbHNvbi9Eb2N1bWVudHMvTWFzdGVyIFNFVEkvTWluaVByb2pldC9zY3JlZW4vc3JjL21vZHVsZXMvdG9kby92aWV3cy9sYXlvdXQvZm9vdGVyL2Zvb3Rlci5qcyIsIi9Vc2Vycy9uZWxzb24vRG9jdW1lbnRzL01hc3RlciBTRVRJL01pbmlQcm9qZXQvc2NyZWVuL3NyYy9tb2R1bGVzL3RvZG8vdmlld3MvbGF5b3V0L2hlYWRlci9oZWFkZXIuaGJzIiwiL1VzZXJzL25lbHNvbi9Eb2N1bWVudHMvTWFzdGVyIFNFVEkvTWluaVByb2pldC9zY3JlZW4vc3JjL21vZHVsZXMvdG9kby92aWV3cy9sYXlvdXQvaGVhZGVyL2hlYWRlci5qcyIsIi9Vc2Vycy9uZWxzb24vRG9jdW1lbnRzL01hc3RlciBTRVRJL01pbmlQcm9qZXQvc2NyZWVuL3NyYy9tb2R1bGVzL3RvZG8vdmlld3MvbGF5b3V0L2xheW91dC5oYnMiLCIvVXNlcnMvbmVsc29uL0RvY3VtZW50cy9NYXN0ZXIgU0VUSS9NaW5pUHJvamV0L3NjcmVlbi9zcmMvbW9kdWxlcy90b2RvL3ZpZXdzL2xheW91dC9sYXlvdXQuanMiLCIvVXNlcnMvbmVsc29uL0RvY3VtZW50cy9NYXN0ZXIgU0VUSS9NaW5pUHJvamV0L3NjcmVlbi9zcmMvbW9kdWxlcy90b2RvL3ZpZXdzL3RvZG9zL2NvbGxlY3Rpb24uaGJzIiwiL1VzZXJzL25lbHNvbi9Eb2N1bWVudHMvTWFzdGVyIFNFVEkvTWluaVByb2pldC9zY3JlZW4vc3JjL21vZHVsZXMvdG9kby92aWV3cy90b2Rvcy9jb2xsZWN0aW9uLmpzIiwiL1VzZXJzL25lbHNvbi9Eb2N1bWVudHMvTWFzdGVyIFNFVEkvTWluaVByb2pldC9zY3JlZW4vc3JjL21vZHVsZXMvdG9kby92aWV3cy90b2Rvcy9pdGVtLmhicyIsIi9Vc2Vycy9uZWxzb24vRG9jdW1lbnRzL01hc3RlciBTRVRJL01pbmlQcm9qZXQvc2NyZWVuL3NyYy9tb2R1bGVzL3RvZG8vdmlld3MvdG9kb3MvaXRlbS5qcyIsIi9Vc2Vycy9uZWxzb24vRG9jdW1lbnRzL01hc3RlciBTRVRJL01pbmlQcm9qZXQvc2NyZWVuL3NyYy92ZW5kb3JzL2JhY2tib25lLnJhcGhhZWwuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNFQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTs7QUNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Z0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBLElBQUEsMENBQUE7RUFBQTtpU0FBQTs7QUFBQSxVQUFBLEdBQWEsT0FBQSxDQUFRLHFCQUFSLENBQWIsQ0FBQTs7QUFBQSxNQUVBLEdBQVMsT0FBQSxDQUFRLFVBQVIsQ0FGVCxDQUFBOztBQUFBLFVBR0EsR0FBYSxPQUFBLENBQVEsY0FBUixDQUhiLENBQUE7O0FBQUE7QUFTSSwrQkFBQSxDQUFBOzs7O0dBQUE7O0FBQUEsdUJBQUEsVUFBQSxHQUFZLFNBQUEsR0FBQTtXQUNSLElBQUksQ0FBQyxZQUFMLEdBQW9CLHFCQURaO0VBQUEsQ0FBWixDQUFBOztBQUFBLHVCQUlBLE9BQUEsR0FBUyxTQUFBLEdBQUE7QUFJTCxJQUFBLElBQUksQ0FBQyxnQkFBTCxDQUFBLENBQUEsQ0FBQTtBQUFBLElBQ0EsSUFBSSxDQUFDLFVBQUwsQ0FBQSxDQURBLENBQUE7V0FFQSxJQUFJLENBQUMsY0FBTCxDQUFBLEVBTks7RUFBQSxDQUpULENBQUE7O0FBQUEsdUJBWUEsTUFBQSxHQUFRLFNBQUEsR0FBQTtBQUdKLElBQUEsSUFBSSxDQUFDLGFBQUwsQ0FBQSxDQUFBLENBQUE7QUFBQSxJQUNBLElBQUksQ0FBQyxhQUFMLENBQUEsQ0FEQSxDQUFBO1dBRUEsSUFBSSxDQUFDLGlCQUFMLENBQUEsRUFMSTtFQUFBLENBWlIsQ0FBQTs7QUFBQSx1QkFxQkEsZ0JBQUEsR0FBa0IsU0FBQSxHQUFBO0FBQ2QsUUFBQSxJQUFBO0FBQUEsSUFBQSxJQUFBLEdBQU8sUUFBUSxDQUFDLGFBQVQsQ0FBdUIsS0FBdkIsQ0FBUCxDQUFBO0FBQUEsSUFDQSxJQUFJLENBQUMsRUFBTCxHQUFVLElBQUksQ0FBQyxZQURmLENBQUE7QUFBQSxJQUVBLElBQUksQ0FBQyxPQUFELENBQUosR0FBYSxTQUZiLENBQUE7V0FHQSxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQWQsQ0FBMEIsSUFBMUIsRUFKYztFQUFBLENBckJsQixDQUFBOztBQUFBLHVCQTJCQSxVQUFBLEdBQVksU0FBQSxHQUFBO1dBQ1IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFULENBQW9CO0FBQUEsTUFBQSxVQUFBLEVBQVksR0FBQSxHQUFNLElBQUksQ0FBQyxZQUF2QjtLQUFwQixFQURRO0VBQUEsQ0EzQlosQ0FBQTs7QUFBQSx1QkE4QkEsY0FBQSxHQUFnQixTQUFBLEdBQUE7QUFDWixRQUFBLE1BQUE7QUFBQSxJQUFBLElBQUksQ0FBQyxVQUFMLEdBQXNCLElBQUEsVUFBQSxDQUFXO0FBQUEsTUFBQSxVQUFBLEVBQVksSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFyQjtLQUFYLENBQXRCLENBQUE7V0FDQSxNQUFBLEdBQWEsSUFBQSxNQUFBLENBQU87QUFBQSxNQUFBLFVBQUEsRUFBWSxJQUFJLENBQUMsVUFBakI7S0FBUCxFQUZEO0VBQUEsQ0E5QmhCLENBQUE7O0FBQUEsdUJBcUNBLGlCQUFBLEdBQW1CLFNBQUEsR0FBQTtBQUNmLFFBQUEsSUFBQTtBQUFBLElBQUEsSUFBQSxHQUFPLFFBQVEsQ0FBQyxjQUFULENBQXdCLElBQUksQ0FBQyxZQUE3QixDQUFQLENBQUE7MEJBQ0EsSUFBSSxDQUFFLGFBQWEsQ0FBQyxXQUFwQixDQUFnQyxJQUFoQyxXQUZlO0VBQUEsQ0FyQ25CLENBQUE7O0FBQUEsdUJBeUNBLGFBQUEsR0FBZSxTQUFBLEdBQUE7V0FDWCxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVQsQ0FBc0IsWUFBdEIsRUFEVztFQUFBLENBekNmLENBQUE7O0FBQUEsdUJBNENBLGFBQUEsR0FBZSxTQUFBLEdBQUE7V0FDWCxJQUFJLENBQUMsVUFBVSxDQUFDLElBQWhCLENBQUEsRUFEVztFQUFBLENBNUNmLENBQUE7O29CQUFBOztHQUZxQixVQUFVLENBQUMsT0FQcEMsQ0FBQTs7QUFBQSxNQTZETSxDQUFDLE9BQVAsR0FBaUIsVUE3RGpCLENBQUE7Ozs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcInVzZSBzdHJpY3RcIjtcbi8qZ2xvYmFscyBIYW5kbGViYXJzOiB0cnVlICovXG52YXIgYmFzZSA9IHJlcXVpcmUoXCIuL2hhbmRsZWJhcnMvYmFzZVwiKTtcblxuLy8gRWFjaCBvZiB0aGVzZSBhdWdtZW50IHRoZSBIYW5kbGViYXJzIG9iamVjdC4gTm8gbmVlZCB0byBzZXR1cCBoZXJlLlxuLy8gKFRoaXMgaXMgZG9uZSB0byBlYXNpbHkgc2hhcmUgY29kZSBiZXR3ZWVuIGNvbW1vbmpzIGFuZCBicm93c2UgZW52cylcbnZhciBTYWZlU3RyaW5nID0gcmVxdWlyZShcIi4vaGFuZGxlYmFycy9zYWZlLXN0cmluZ1wiKVtcImRlZmF1bHRcIl07XG52YXIgRXhjZXB0aW9uID0gcmVxdWlyZShcIi4vaGFuZGxlYmFycy9leGNlcHRpb25cIilbXCJkZWZhdWx0XCJdO1xudmFyIFV0aWxzID0gcmVxdWlyZShcIi4vaGFuZGxlYmFycy91dGlsc1wiKTtcbnZhciBydW50aW1lID0gcmVxdWlyZShcIi4vaGFuZGxlYmFycy9ydW50aW1lXCIpO1xuXG4vLyBGb3IgY29tcGF0aWJpbGl0eSBhbmQgdXNhZ2Ugb3V0c2lkZSBvZiBtb2R1bGUgc3lzdGVtcywgbWFrZSB0aGUgSGFuZGxlYmFycyBvYmplY3QgYSBuYW1lc3BhY2VcbnZhciBjcmVhdGUgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGhiID0gbmV3IGJhc2UuSGFuZGxlYmFyc0Vudmlyb25tZW50KCk7XG5cbiAgVXRpbHMuZXh0ZW5kKGhiLCBiYXNlKTtcbiAgaGIuU2FmZVN0cmluZyA9IFNhZmVTdHJpbmc7XG4gIGhiLkV4Y2VwdGlvbiA9IEV4Y2VwdGlvbjtcbiAgaGIuVXRpbHMgPSBVdGlscztcblxuICBoYi5WTSA9IHJ1bnRpbWU7XG4gIGhiLnRlbXBsYXRlID0gZnVuY3Rpb24oc3BlYykge1xuICAgIHJldHVybiBydW50aW1lLnRlbXBsYXRlKHNwZWMsIGhiKTtcbiAgfTtcblxuICByZXR1cm4gaGI7XG59O1xuXG52YXIgSGFuZGxlYmFycyA9IGNyZWF0ZSgpO1xuSGFuZGxlYmFycy5jcmVhdGUgPSBjcmVhdGU7XG5cbmV4cG9ydHNbXCJkZWZhdWx0XCJdID0gSGFuZGxlYmFyczsiLCJcInVzZSBzdHJpY3RcIjtcbnZhciBVdGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpO1xudmFyIEV4Y2VwdGlvbiA9IHJlcXVpcmUoXCIuL2V4Y2VwdGlvblwiKVtcImRlZmF1bHRcIl07XG5cbnZhciBWRVJTSU9OID0gXCIxLjMuMFwiO1xuZXhwb3J0cy5WRVJTSU9OID0gVkVSU0lPTjt2YXIgQ09NUElMRVJfUkVWSVNJT04gPSA0O1xuZXhwb3J0cy5DT01QSUxFUl9SRVZJU0lPTiA9IENPTVBJTEVSX1JFVklTSU9OO1xudmFyIFJFVklTSU9OX0NIQU5HRVMgPSB7XG4gIDE6ICc8PSAxLjAucmMuMicsIC8vIDEuMC5yYy4yIGlzIGFjdHVhbGx5IHJldjIgYnV0IGRvZXNuJ3QgcmVwb3J0IGl0XG4gIDI6ICc9PSAxLjAuMC1yYy4zJyxcbiAgMzogJz09IDEuMC4wLXJjLjQnLFxuICA0OiAnPj0gMS4wLjAnXG59O1xuZXhwb3J0cy5SRVZJU0lPTl9DSEFOR0VTID0gUkVWSVNJT05fQ0hBTkdFUztcbnZhciBpc0FycmF5ID0gVXRpbHMuaXNBcnJheSxcbiAgICBpc0Z1bmN0aW9uID0gVXRpbHMuaXNGdW5jdGlvbixcbiAgICB0b1N0cmluZyA9IFV0aWxzLnRvU3RyaW5nLFxuICAgIG9iamVjdFR5cGUgPSAnW29iamVjdCBPYmplY3RdJztcblxuZnVuY3Rpb24gSGFuZGxlYmFyc0Vudmlyb25tZW50KGhlbHBlcnMsIHBhcnRpYWxzKSB7XG4gIHRoaXMuaGVscGVycyA9IGhlbHBlcnMgfHwge307XG4gIHRoaXMucGFydGlhbHMgPSBwYXJ0aWFscyB8fCB7fTtcblxuICByZWdpc3RlckRlZmF1bHRIZWxwZXJzKHRoaXMpO1xufVxuXG5leHBvcnRzLkhhbmRsZWJhcnNFbnZpcm9ubWVudCA9IEhhbmRsZWJhcnNFbnZpcm9ubWVudDtIYW5kbGViYXJzRW52aXJvbm1lbnQucHJvdG90eXBlID0ge1xuICBjb25zdHJ1Y3RvcjogSGFuZGxlYmFyc0Vudmlyb25tZW50LFxuXG4gIGxvZ2dlcjogbG9nZ2VyLFxuICBsb2c6IGxvZyxcblxuICByZWdpc3RlckhlbHBlcjogZnVuY3Rpb24obmFtZSwgZm4sIGludmVyc2UpIHtcbiAgICBpZiAodG9TdHJpbmcuY2FsbChuYW1lKSA9PT0gb2JqZWN0VHlwZSkge1xuICAgICAgaWYgKGludmVyc2UgfHwgZm4pIHsgdGhyb3cgbmV3IEV4Y2VwdGlvbignQXJnIG5vdCBzdXBwb3J0ZWQgd2l0aCBtdWx0aXBsZSBoZWxwZXJzJyk7IH1cbiAgICAgIFV0aWxzLmV4dGVuZCh0aGlzLmhlbHBlcnMsIG5hbWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoaW52ZXJzZSkgeyBmbi5ub3QgPSBpbnZlcnNlOyB9XG4gICAgICB0aGlzLmhlbHBlcnNbbmFtZV0gPSBmbjtcbiAgICB9XG4gIH0sXG5cbiAgcmVnaXN0ZXJQYXJ0aWFsOiBmdW5jdGlvbihuYW1lLCBzdHIpIHtcbiAgICBpZiAodG9TdHJpbmcuY2FsbChuYW1lKSA9PT0gb2JqZWN0VHlwZSkge1xuICAgICAgVXRpbHMuZXh0ZW5kKHRoaXMucGFydGlhbHMsICBuYW1lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5wYXJ0aWFsc1tuYW1lXSA9IHN0cjtcbiAgICB9XG4gIH1cbn07XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyRGVmYXVsdEhlbHBlcnMoaW5zdGFuY2UpIHtcbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ2hlbHBlck1pc3NpbmcnLCBmdW5jdGlvbihhcmcpIHtcbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAyKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKFwiTWlzc2luZyBoZWxwZXI6ICdcIiArIGFyZyArIFwiJ1wiKTtcbiAgICB9XG4gIH0pO1xuXG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCdibG9ja0hlbHBlck1pc3NpbmcnLCBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gICAgdmFyIGludmVyc2UgPSBvcHRpb25zLmludmVyc2UgfHwgZnVuY3Rpb24oKSB7fSwgZm4gPSBvcHRpb25zLmZuO1xuXG4gICAgaWYgKGlzRnVuY3Rpb24oY29udGV4dCkpIHsgY29udGV4dCA9IGNvbnRleHQuY2FsbCh0aGlzKTsgfVxuXG4gICAgaWYoY29udGV4dCA9PT0gdHJ1ZSkge1xuICAgICAgcmV0dXJuIGZuKHRoaXMpO1xuICAgIH0gZWxzZSBpZihjb250ZXh0ID09PSBmYWxzZSB8fCBjb250ZXh0ID09IG51bGwpIHtcbiAgICAgIHJldHVybiBpbnZlcnNlKHRoaXMpO1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheShjb250ZXh0KSkge1xuICAgICAgaWYoY29udGV4dC5sZW5ndGggPiAwKSB7XG4gICAgICAgIHJldHVybiBpbnN0YW5jZS5oZWxwZXJzLmVhY2goY29udGV4dCwgb3B0aW9ucyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gaW52ZXJzZSh0aGlzKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGZuKGNvbnRleHQpO1xuICAgIH1cbiAgfSk7XG5cbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ2VhY2gnLCBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gICAgdmFyIGZuID0gb3B0aW9ucy5mbiwgaW52ZXJzZSA9IG9wdGlvbnMuaW52ZXJzZTtcbiAgICB2YXIgaSA9IDAsIHJldCA9IFwiXCIsIGRhdGE7XG5cbiAgICBpZiAoaXNGdW5jdGlvbihjb250ZXh0KSkgeyBjb250ZXh0ID0gY29udGV4dC5jYWxsKHRoaXMpOyB9XG5cbiAgICBpZiAob3B0aW9ucy5kYXRhKSB7XG4gICAgICBkYXRhID0gY3JlYXRlRnJhbWUob3B0aW9ucy5kYXRhKTtcbiAgICB9XG5cbiAgICBpZihjb250ZXh0ICYmIHR5cGVvZiBjb250ZXh0ID09PSAnb2JqZWN0Jykge1xuICAgICAgaWYgKGlzQXJyYXkoY29udGV4dCkpIHtcbiAgICAgICAgZm9yKHZhciBqID0gY29udGV4dC5sZW5ndGg7IGk8ajsgaSsrKSB7XG4gICAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICAgIGRhdGEuaW5kZXggPSBpO1xuICAgICAgICAgICAgZGF0YS5maXJzdCA9IChpID09PSAwKTtcbiAgICAgICAgICAgIGRhdGEubGFzdCAgPSAoaSA9PT0gKGNvbnRleHQubGVuZ3RoLTEpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0ID0gcmV0ICsgZm4oY29udGV4dFtpXSwgeyBkYXRhOiBkYXRhIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb3IodmFyIGtleSBpbiBjb250ZXh0KSB7XG4gICAgICAgICAgaWYoY29udGV4dC5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICBpZihkYXRhKSB7IFxuICAgICAgICAgICAgICBkYXRhLmtleSA9IGtleTsgXG4gICAgICAgICAgICAgIGRhdGEuaW5kZXggPSBpO1xuICAgICAgICAgICAgICBkYXRhLmZpcnN0ID0gKGkgPT09IDApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0ID0gcmV0ICsgZm4oY29udGV4dFtrZXldLCB7ZGF0YTogZGF0YX0pO1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmKGkgPT09IDApe1xuICAgICAgcmV0ID0gaW52ZXJzZSh0aGlzKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmV0O1xuICB9KTtcblxuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcignaWYnLCBmdW5jdGlvbihjb25kaXRpb25hbCwgb3B0aW9ucykge1xuICAgIGlmIChpc0Z1bmN0aW9uKGNvbmRpdGlvbmFsKSkgeyBjb25kaXRpb25hbCA9IGNvbmRpdGlvbmFsLmNhbGwodGhpcyk7IH1cblxuICAgIC8vIERlZmF1bHQgYmVoYXZpb3IgaXMgdG8gcmVuZGVyIHRoZSBwb3NpdGl2ZSBwYXRoIGlmIHRoZSB2YWx1ZSBpcyB0cnV0aHkgYW5kIG5vdCBlbXB0eS5cbiAgICAvLyBUaGUgYGluY2x1ZGVaZXJvYCBvcHRpb24gbWF5IGJlIHNldCB0byB0cmVhdCB0aGUgY29uZHRpb25hbCBhcyBwdXJlbHkgbm90IGVtcHR5IGJhc2VkIG9uIHRoZVxuICAgIC8vIGJlaGF2aW9yIG9mIGlzRW1wdHkuIEVmZmVjdGl2ZWx5IHRoaXMgZGV0ZXJtaW5lcyBpZiAwIGlzIGhhbmRsZWQgYnkgdGhlIHBvc2l0aXZlIHBhdGggb3IgbmVnYXRpdmUuXG4gICAgaWYgKCghb3B0aW9ucy5oYXNoLmluY2x1ZGVaZXJvICYmICFjb25kaXRpb25hbCkgfHwgVXRpbHMuaXNFbXB0eShjb25kaXRpb25hbCkpIHtcbiAgICAgIHJldHVybiBvcHRpb25zLmludmVyc2UodGhpcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBvcHRpb25zLmZuKHRoaXMpO1xuICAgIH1cbiAgfSk7XG5cbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ3VubGVzcycsIGZ1bmN0aW9uKGNvbmRpdGlvbmFsLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIGluc3RhbmNlLmhlbHBlcnNbJ2lmJ10uY2FsbCh0aGlzLCBjb25kaXRpb25hbCwge2ZuOiBvcHRpb25zLmludmVyc2UsIGludmVyc2U6IG9wdGlvbnMuZm4sIGhhc2g6IG9wdGlvbnMuaGFzaH0pO1xuICB9KTtcblxuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcignd2l0aCcsIGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICBpZiAoaXNGdW5jdGlvbihjb250ZXh0KSkgeyBjb250ZXh0ID0gY29udGV4dC5jYWxsKHRoaXMpOyB9XG5cbiAgICBpZiAoIVV0aWxzLmlzRW1wdHkoY29udGV4dCkpIHJldHVybiBvcHRpb25zLmZuKGNvbnRleHQpO1xuICB9KTtcblxuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcignbG9nJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgIHZhciBsZXZlbCA9IG9wdGlvbnMuZGF0YSAmJiBvcHRpb25zLmRhdGEubGV2ZWwgIT0gbnVsbCA/IHBhcnNlSW50KG9wdGlvbnMuZGF0YS5sZXZlbCwgMTApIDogMTtcbiAgICBpbnN0YW5jZS5sb2cobGV2ZWwsIGNvbnRleHQpO1xuICB9KTtcbn1cblxudmFyIGxvZ2dlciA9IHtcbiAgbWV0aG9kTWFwOiB7IDA6ICdkZWJ1ZycsIDE6ICdpbmZvJywgMjogJ3dhcm4nLCAzOiAnZXJyb3InIH0sXG5cbiAgLy8gU3RhdGUgZW51bVxuICBERUJVRzogMCxcbiAgSU5GTzogMSxcbiAgV0FSTjogMixcbiAgRVJST1I6IDMsXG4gIGxldmVsOiAzLFxuXG4gIC8vIGNhbiBiZSBvdmVycmlkZGVuIGluIHRoZSBob3N0IGVudmlyb25tZW50XG4gIGxvZzogZnVuY3Rpb24obGV2ZWwsIG9iaikge1xuICAgIGlmIChsb2dnZXIubGV2ZWwgPD0gbGV2ZWwpIHtcbiAgICAgIHZhciBtZXRob2QgPSBsb2dnZXIubWV0aG9kTWFwW2xldmVsXTtcbiAgICAgIGlmICh0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcgJiYgY29uc29sZVttZXRob2RdKSB7XG4gICAgICAgIGNvbnNvbGVbbWV0aG9kXS5jYWxsKGNvbnNvbGUsIG9iaik7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuZXhwb3J0cy5sb2dnZXIgPSBsb2dnZXI7XG5mdW5jdGlvbiBsb2cobGV2ZWwsIG9iaikgeyBsb2dnZXIubG9nKGxldmVsLCBvYmopOyB9XG5cbmV4cG9ydHMubG9nID0gbG9nO3ZhciBjcmVhdGVGcmFtZSA9IGZ1bmN0aW9uKG9iamVjdCkge1xuICB2YXIgb2JqID0ge307XG4gIFV0aWxzLmV4dGVuZChvYmosIG9iamVjdCk7XG4gIHJldHVybiBvYmo7XG59O1xuZXhwb3J0cy5jcmVhdGVGcmFtZSA9IGNyZWF0ZUZyYW1lOyIsIlwidXNlIHN0cmljdFwiO1xuXG52YXIgZXJyb3JQcm9wcyA9IFsnZGVzY3JpcHRpb24nLCAnZmlsZU5hbWUnLCAnbGluZU51bWJlcicsICdtZXNzYWdlJywgJ25hbWUnLCAnbnVtYmVyJywgJ3N0YWNrJ107XG5cbmZ1bmN0aW9uIEV4Y2VwdGlvbihtZXNzYWdlLCBub2RlKSB7XG4gIHZhciBsaW5lO1xuICBpZiAobm9kZSAmJiBub2RlLmZpcnN0TGluZSkge1xuICAgIGxpbmUgPSBub2RlLmZpcnN0TGluZTtcblxuICAgIG1lc3NhZ2UgKz0gJyAtICcgKyBsaW5lICsgJzonICsgbm9kZS5maXJzdENvbHVtbjtcbiAgfVxuXG4gIHZhciB0bXAgPSBFcnJvci5wcm90b3R5cGUuY29uc3RydWN0b3IuY2FsbCh0aGlzLCBtZXNzYWdlKTtcblxuICAvLyBVbmZvcnR1bmF0ZWx5IGVycm9ycyBhcmUgbm90IGVudW1lcmFibGUgaW4gQ2hyb21lIChhdCBsZWFzdCksIHNvIGBmb3IgcHJvcCBpbiB0bXBgIGRvZXNuJ3Qgd29yay5cbiAgZm9yICh2YXIgaWR4ID0gMDsgaWR4IDwgZXJyb3JQcm9wcy5sZW5ndGg7IGlkeCsrKSB7XG4gICAgdGhpc1tlcnJvclByb3BzW2lkeF1dID0gdG1wW2Vycm9yUHJvcHNbaWR4XV07XG4gIH1cblxuICBpZiAobGluZSkge1xuICAgIHRoaXMubGluZU51bWJlciA9IGxpbmU7XG4gICAgdGhpcy5jb2x1bW4gPSBub2RlLmZpcnN0Q29sdW1uO1xuICB9XG59XG5cbkV4Y2VwdGlvbi5wcm90b3R5cGUgPSBuZXcgRXJyb3IoKTtcblxuZXhwb3J0c1tcImRlZmF1bHRcIl0gPSBFeGNlcHRpb247IiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgVXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKTtcbnZhciBFeGNlcHRpb24gPSByZXF1aXJlKFwiLi9leGNlcHRpb25cIilbXCJkZWZhdWx0XCJdO1xudmFyIENPTVBJTEVSX1JFVklTSU9OID0gcmVxdWlyZShcIi4vYmFzZVwiKS5DT01QSUxFUl9SRVZJU0lPTjtcbnZhciBSRVZJU0lPTl9DSEFOR0VTID0gcmVxdWlyZShcIi4vYmFzZVwiKS5SRVZJU0lPTl9DSEFOR0VTO1xuXG5mdW5jdGlvbiBjaGVja1JldmlzaW9uKGNvbXBpbGVySW5mbykge1xuICB2YXIgY29tcGlsZXJSZXZpc2lvbiA9IGNvbXBpbGVySW5mbyAmJiBjb21waWxlckluZm9bMF0gfHwgMSxcbiAgICAgIGN1cnJlbnRSZXZpc2lvbiA9IENPTVBJTEVSX1JFVklTSU9OO1xuXG4gIGlmIChjb21waWxlclJldmlzaW9uICE9PSBjdXJyZW50UmV2aXNpb24pIHtcbiAgICBpZiAoY29tcGlsZXJSZXZpc2lvbiA8IGN1cnJlbnRSZXZpc2lvbikge1xuICAgICAgdmFyIHJ1bnRpbWVWZXJzaW9ucyA9IFJFVklTSU9OX0NIQU5HRVNbY3VycmVudFJldmlzaW9uXSxcbiAgICAgICAgICBjb21waWxlclZlcnNpb25zID0gUkVWSVNJT05fQ0hBTkdFU1tjb21waWxlclJldmlzaW9uXTtcbiAgICAgIHRocm93IG5ldyBFeGNlcHRpb24oXCJUZW1wbGF0ZSB3YXMgcHJlY29tcGlsZWQgd2l0aCBhbiBvbGRlciB2ZXJzaW9uIG9mIEhhbmRsZWJhcnMgdGhhbiB0aGUgY3VycmVudCBydW50aW1lLiBcIitcbiAgICAgICAgICAgIFwiUGxlYXNlIHVwZGF0ZSB5b3VyIHByZWNvbXBpbGVyIHRvIGEgbmV3ZXIgdmVyc2lvbiAoXCIrcnVudGltZVZlcnNpb25zK1wiKSBvciBkb3duZ3JhZGUgeW91ciBydW50aW1lIHRvIGFuIG9sZGVyIHZlcnNpb24gKFwiK2NvbXBpbGVyVmVyc2lvbnMrXCIpLlwiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVXNlIHRoZSBlbWJlZGRlZCB2ZXJzaW9uIGluZm8gc2luY2UgdGhlIHJ1bnRpbWUgZG9lc24ndCBrbm93IGFib3V0IHRoaXMgcmV2aXNpb24geWV0XG4gICAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKFwiVGVtcGxhdGUgd2FzIHByZWNvbXBpbGVkIHdpdGggYSBuZXdlciB2ZXJzaW9uIG9mIEhhbmRsZWJhcnMgdGhhbiB0aGUgY3VycmVudCBydW50aW1lLiBcIitcbiAgICAgICAgICAgIFwiUGxlYXNlIHVwZGF0ZSB5b3VyIHJ1bnRpbWUgdG8gYSBuZXdlciB2ZXJzaW9uIChcIitjb21waWxlckluZm9bMV0rXCIpLlwiKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0cy5jaGVja1JldmlzaW9uID0gY2hlY2tSZXZpc2lvbjsvLyBUT0RPOiBSZW1vdmUgdGhpcyBsaW5lIGFuZCBicmVhayB1cCBjb21waWxlUGFydGlhbFxuXG5mdW5jdGlvbiB0ZW1wbGF0ZSh0ZW1wbGF0ZVNwZWMsIGVudikge1xuICBpZiAoIWVudikge1xuICAgIHRocm93IG5ldyBFeGNlcHRpb24oXCJObyBlbnZpcm9ubWVudCBwYXNzZWQgdG8gdGVtcGxhdGVcIik7XG4gIH1cblxuICAvLyBOb3RlOiBVc2luZyBlbnYuVk0gcmVmZXJlbmNlcyByYXRoZXIgdGhhbiBsb2NhbCB2YXIgcmVmZXJlbmNlcyB0aHJvdWdob3V0IHRoaXMgc2VjdGlvbiB0byBhbGxvd1xuICAvLyBmb3IgZXh0ZXJuYWwgdXNlcnMgdG8gb3ZlcnJpZGUgdGhlc2UgYXMgcHN1ZWRvLXN1cHBvcnRlZCBBUElzLlxuICB2YXIgaW52b2tlUGFydGlhbFdyYXBwZXIgPSBmdW5jdGlvbihwYXJ0aWFsLCBuYW1lLCBjb250ZXh0LCBoZWxwZXJzLCBwYXJ0aWFscywgZGF0YSkge1xuICAgIHZhciByZXN1bHQgPSBlbnYuVk0uaW52b2tlUGFydGlhbC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIGlmIChyZXN1bHQgIT0gbnVsbCkgeyByZXR1cm4gcmVzdWx0OyB9XG5cbiAgICBpZiAoZW52LmNvbXBpbGUpIHtcbiAgICAgIHZhciBvcHRpb25zID0geyBoZWxwZXJzOiBoZWxwZXJzLCBwYXJ0aWFsczogcGFydGlhbHMsIGRhdGE6IGRhdGEgfTtcbiAgICAgIHBhcnRpYWxzW25hbWVdID0gZW52LmNvbXBpbGUocGFydGlhbCwgeyBkYXRhOiBkYXRhICE9PSB1bmRlZmluZWQgfSwgZW52KTtcbiAgICAgIHJldHVybiBwYXJ0aWFsc1tuYW1lXShjb250ZXh0LCBvcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEV4Y2VwdGlvbihcIlRoZSBwYXJ0aWFsIFwiICsgbmFtZSArIFwiIGNvdWxkIG5vdCBiZSBjb21waWxlZCB3aGVuIHJ1bm5pbmcgaW4gcnVudGltZS1vbmx5IG1vZGVcIik7XG4gICAgfVxuICB9O1xuXG4gIC8vIEp1c3QgYWRkIHdhdGVyXG4gIHZhciBjb250YWluZXIgPSB7XG4gICAgZXNjYXBlRXhwcmVzc2lvbjogVXRpbHMuZXNjYXBlRXhwcmVzc2lvbixcbiAgICBpbnZva2VQYXJ0aWFsOiBpbnZva2VQYXJ0aWFsV3JhcHBlcixcbiAgICBwcm9ncmFtczogW10sXG4gICAgcHJvZ3JhbTogZnVuY3Rpb24oaSwgZm4sIGRhdGEpIHtcbiAgICAgIHZhciBwcm9ncmFtV3JhcHBlciA9IHRoaXMucHJvZ3JhbXNbaV07XG4gICAgICBpZihkYXRhKSB7XG4gICAgICAgIHByb2dyYW1XcmFwcGVyID0gcHJvZ3JhbShpLCBmbiwgZGF0YSk7XG4gICAgICB9IGVsc2UgaWYgKCFwcm9ncmFtV3JhcHBlcikge1xuICAgICAgICBwcm9ncmFtV3JhcHBlciA9IHRoaXMucHJvZ3JhbXNbaV0gPSBwcm9ncmFtKGksIGZuKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBwcm9ncmFtV3JhcHBlcjtcbiAgICB9LFxuICAgIG1lcmdlOiBmdW5jdGlvbihwYXJhbSwgY29tbW9uKSB7XG4gICAgICB2YXIgcmV0ID0gcGFyYW0gfHwgY29tbW9uO1xuXG4gICAgICBpZiAocGFyYW0gJiYgY29tbW9uICYmIChwYXJhbSAhPT0gY29tbW9uKSkge1xuICAgICAgICByZXQgPSB7fTtcbiAgICAgICAgVXRpbHMuZXh0ZW5kKHJldCwgY29tbW9uKTtcbiAgICAgICAgVXRpbHMuZXh0ZW5kKHJldCwgcGFyYW0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJldDtcbiAgICB9LFxuICAgIHByb2dyYW1XaXRoRGVwdGg6IGVudi5WTS5wcm9ncmFtV2l0aERlcHRoLFxuICAgIG5vb3A6IGVudi5WTS5ub29wLFxuICAgIGNvbXBpbGVySW5mbzogbnVsbFxuICB9O1xuXG4gIHJldHVybiBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIG5hbWVzcGFjZSA9IG9wdGlvbnMucGFydGlhbCA/IG9wdGlvbnMgOiBlbnYsXG4gICAgICAgIGhlbHBlcnMsXG4gICAgICAgIHBhcnRpYWxzO1xuXG4gICAgaWYgKCFvcHRpb25zLnBhcnRpYWwpIHtcbiAgICAgIGhlbHBlcnMgPSBvcHRpb25zLmhlbHBlcnM7XG4gICAgICBwYXJ0aWFscyA9IG9wdGlvbnMucGFydGlhbHM7XG4gICAgfVxuICAgIHZhciByZXN1bHQgPSB0ZW1wbGF0ZVNwZWMuY2FsbChcbiAgICAgICAgICBjb250YWluZXIsXG4gICAgICAgICAgbmFtZXNwYWNlLCBjb250ZXh0LFxuICAgICAgICAgIGhlbHBlcnMsXG4gICAgICAgICAgcGFydGlhbHMsXG4gICAgICAgICAgb3B0aW9ucy5kYXRhKTtcblxuICAgIGlmICghb3B0aW9ucy5wYXJ0aWFsKSB7XG4gICAgICBlbnYuVk0uY2hlY2tSZXZpc2lvbihjb250YWluZXIuY29tcGlsZXJJbmZvKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xufVxuXG5leHBvcnRzLnRlbXBsYXRlID0gdGVtcGxhdGU7ZnVuY3Rpb24gcHJvZ3JhbVdpdGhEZXB0aChpLCBmbiwgZGF0YSAvKiwgJGRlcHRoICovKSB7XG4gIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAzKTtcblxuICB2YXIgcHJvZyA9IGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBbY29udGV4dCwgb3B0aW9ucy5kYXRhIHx8IGRhdGFdLmNvbmNhdChhcmdzKSk7XG4gIH07XG4gIHByb2cucHJvZ3JhbSA9IGk7XG4gIHByb2cuZGVwdGggPSBhcmdzLmxlbmd0aDtcbiAgcmV0dXJuIHByb2c7XG59XG5cbmV4cG9ydHMucHJvZ3JhbVdpdGhEZXB0aCA9IHByb2dyYW1XaXRoRGVwdGg7ZnVuY3Rpb24gcHJvZ3JhbShpLCBmbiwgZGF0YSkge1xuICB2YXIgcHJvZyA9IGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgIHJldHVybiBmbihjb250ZXh0LCBvcHRpb25zLmRhdGEgfHwgZGF0YSk7XG4gIH07XG4gIHByb2cucHJvZ3JhbSA9IGk7XG4gIHByb2cuZGVwdGggPSAwO1xuICByZXR1cm4gcHJvZztcbn1cblxuZXhwb3J0cy5wcm9ncmFtID0gcHJvZ3JhbTtmdW5jdGlvbiBpbnZva2VQYXJ0aWFsKHBhcnRpYWwsIG5hbWUsIGNvbnRleHQsIGhlbHBlcnMsIHBhcnRpYWxzLCBkYXRhKSB7XG4gIHZhciBvcHRpb25zID0geyBwYXJ0aWFsOiB0cnVlLCBoZWxwZXJzOiBoZWxwZXJzLCBwYXJ0aWFsczogcGFydGlhbHMsIGRhdGE6IGRhdGEgfTtcblxuICBpZihwYXJ0aWFsID09PSB1bmRlZmluZWQpIHtcbiAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKFwiVGhlIHBhcnRpYWwgXCIgKyBuYW1lICsgXCIgY291bGQgbm90IGJlIGZvdW5kXCIpO1xuICB9IGVsc2UgaWYocGFydGlhbCBpbnN0YW5jZW9mIEZ1bmN0aW9uKSB7XG4gICAgcmV0dXJuIHBhcnRpYWwoY29udGV4dCwgb3B0aW9ucyk7XG4gIH1cbn1cblxuZXhwb3J0cy5pbnZva2VQYXJ0aWFsID0gaW52b2tlUGFydGlhbDtmdW5jdGlvbiBub29wKCkgeyByZXR1cm4gXCJcIjsgfVxuXG5leHBvcnRzLm5vb3AgPSBub29wOyIsIlwidXNlIHN0cmljdFwiO1xuLy8gQnVpbGQgb3V0IG91ciBiYXNpYyBTYWZlU3RyaW5nIHR5cGVcbmZ1bmN0aW9uIFNhZmVTdHJpbmcoc3RyaW5nKSB7XG4gIHRoaXMuc3RyaW5nID0gc3RyaW5nO1xufVxuXG5TYWZlU3RyaW5nLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gXCJcIiArIHRoaXMuc3RyaW5nO1xufTtcblxuZXhwb3J0c1tcImRlZmF1bHRcIl0gPSBTYWZlU3RyaW5nOyIsIlwidXNlIHN0cmljdFwiO1xuLypqc2hpbnQgLVcwMDQgKi9cbnZhciBTYWZlU3RyaW5nID0gcmVxdWlyZShcIi4vc2FmZS1zdHJpbmdcIilbXCJkZWZhdWx0XCJdO1xuXG52YXIgZXNjYXBlID0ge1xuICBcIiZcIjogXCImYW1wO1wiLFxuICBcIjxcIjogXCImbHQ7XCIsXG4gIFwiPlwiOiBcIiZndDtcIixcbiAgJ1wiJzogXCImcXVvdDtcIixcbiAgXCInXCI6IFwiJiN4Mjc7XCIsXG4gIFwiYFwiOiBcIiYjeDYwO1wiXG59O1xuXG52YXIgYmFkQ2hhcnMgPSAvWyY8PlwiJ2BdL2c7XG52YXIgcG9zc2libGUgPSAvWyY8PlwiJ2BdLztcblxuZnVuY3Rpb24gZXNjYXBlQ2hhcihjaHIpIHtcbiAgcmV0dXJuIGVzY2FwZVtjaHJdIHx8IFwiJmFtcDtcIjtcbn1cblxuZnVuY3Rpb24gZXh0ZW5kKG9iaiwgdmFsdWUpIHtcbiAgZm9yKHZhciBrZXkgaW4gdmFsdWUpIHtcbiAgICBpZihPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodmFsdWUsIGtleSkpIHtcbiAgICAgIG9ialtrZXldID0gdmFsdWVba2V5XTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0cy5leHRlbmQgPSBleHRlbmQ7dmFyIHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZztcbmV4cG9ydHMudG9TdHJpbmcgPSB0b1N0cmluZztcbi8vIFNvdXJjZWQgZnJvbSBsb2Rhc2hcbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9iZXN0aWVqcy9sb2Rhc2gvYmxvYi9tYXN0ZXIvTElDRU5TRS50eHRcbnZhciBpc0Z1bmN0aW9uID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJztcbn07XG4vLyBmYWxsYmFjayBmb3Igb2xkZXIgdmVyc2lvbnMgb2YgQ2hyb21lIGFuZCBTYWZhcmlcbmlmIChpc0Z1bmN0aW9uKC94LykpIHtcbiAgaXNGdW5jdGlvbiA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJyAmJiB0b1N0cmluZy5jYWxsKHZhbHVlKSA9PT0gJ1tvYmplY3QgRnVuY3Rpb25dJztcbiAgfTtcbn1cbnZhciBpc0Z1bmN0aW9uO1xuZXhwb3J0cy5pc0Z1bmN0aW9uID0gaXNGdW5jdGlvbjtcbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbih2YWx1ZSkge1xuICByZXR1cm4gKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpID8gdG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT09ICdbb2JqZWN0IEFycmF5XScgOiBmYWxzZTtcbn07XG5leHBvcnRzLmlzQXJyYXkgPSBpc0FycmF5O1xuXG5mdW5jdGlvbiBlc2NhcGVFeHByZXNzaW9uKHN0cmluZykge1xuICAvLyBkb24ndCBlc2NhcGUgU2FmZVN0cmluZ3MsIHNpbmNlIHRoZXkncmUgYWxyZWFkeSBzYWZlXG4gIGlmIChzdHJpbmcgaW5zdGFuY2VvZiBTYWZlU3RyaW5nKSB7XG4gICAgcmV0dXJuIHN0cmluZy50b1N0cmluZygpO1xuICB9IGVsc2UgaWYgKCFzdHJpbmcgJiYgc3RyaW5nICE9PSAwKSB7XG4gICAgcmV0dXJuIFwiXCI7XG4gIH1cblxuICAvLyBGb3JjZSBhIHN0cmluZyBjb252ZXJzaW9uIGFzIHRoaXMgd2lsbCBiZSBkb25lIGJ5IHRoZSBhcHBlbmQgcmVnYXJkbGVzcyBhbmRcbiAgLy8gdGhlIHJlZ2V4IHRlc3Qgd2lsbCBkbyB0aGlzIHRyYW5zcGFyZW50bHkgYmVoaW5kIHRoZSBzY2VuZXMsIGNhdXNpbmcgaXNzdWVzIGlmXG4gIC8vIGFuIG9iamVjdCdzIHRvIHN0cmluZyBoYXMgZXNjYXBlZCBjaGFyYWN0ZXJzIGluIGl0LlxuICBzdHJpbmcgPSBcIlwiICsgc3RyaW5nO1xuXG4gIGlmKCFwb3NzaWJsZS50ZXN0KHN0cmluZykpIHsgcmV0dXJuIHN0cmluZzsgfVxuICByZXR1cm4gc3RyaW5nLnJlcGxhY2UoYmFkQ2hhcnMsIGVzY2FwZUNoYXIpO1xufVxuXG5leHBvcnRzLmVzY2FwZUV4cHJlc3Npb24gPSBlc2NhcGVFeHByZXNzaW9uO2Z1bmN0aW9uIGlzRW1wdHkodmFsdWUpIHtcbiAgaWYgKCF2YWx1ZSAmJiB2YWx1ZSAhPT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9IGVsc2UgaWYgKGlzQXJyYXkodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG5leHBvcnRzLmlzRW1wdHkgPSBpc0VtcHR5OyIsIi8vIENyZWF0ZSBhIHNpbXBsZSBwYXRoIGFsaWFzIHRvIGFsbG93IGJyb3dzZXJpZnkgdG8gcmVzb2x2ZVxuLy8gdGhlIHJ1bnRpbWUgb24gYSBzdXBwb3J0ZWQgcGF0aC5cbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9kaXN0L2Nqcy9oYW5kbGViYXJzLnJ1bnRpbWUnKTtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImhhbmRsZWJhcnMvcnVudGltZVwiKVtcImRlZmF1bHRcIl07XG4iLCIhZnVuY3Rpb24gdChlLHIpe1wib2JqZWN0XCI9PXR5cGVvZiBleHBvcnRzJiZcIm9iamVjdFwiPT10eXBlb2YgbW9kdWxlP21vZHVsZS5leHBvcnRzPXIoKTpcImZ1bmN0aW9uXCI9PXR5cGVvZiBkZWZpbmUmJmRlZmluZS5hbWQ/ZGVmaW5lKFtdLHIpOlwib2JqZWN0XCI9PXR5cGVvZiBleHBvcnRzP2V4cG9ydHMuUmFwaGFlbD1yKCk6ZS5SYXBoYWVsPXIoKX0odGhpcyxmdW5jdGlvbigpe3JldHVybiBmdW5jdGlvbih0KXtmdW5jdGlvbiBlKGkpe2lmKHJbaV0pcmV0dXJuIHJbaV0uZXhwb3J0czt2YXIgbj1yW2ldPXtleHBvcnRzOnt9LGlkOmksbG9hZGVkOiExfTtyZXR1cm4gdFtpXS5jYWxsKG4uZXhwb3J0cyxuLG4uZXhwb3J0cyxlKSxuLmxvYWRlZD0hMCxuLmV4cG9ydHN9dmFyIHI9e307cmV0dXJuIGUubT10LGUuYz1yLGUucD1cIlwiLGUoMCl9KFtmdW5jdGlvbih0LGUscil7dmFyIGksbjtpPVtyKDEpLHIoMykscig0KV0sbj1mdW5jdGlvbih0KXtyZXR1cm4gdH0uYXBwbHkoZSxpKSwhKHZvaWQgMCE9PW4mJih0LmV4cG9ydHM9bikpfSxmdW5jdGlvbih0LGUscil7dmFyIGksbjtpPVtyKDIpXSxuPWZ1bmN0aW9uKHQpe2Z1bmN0aW9uIGUocil7aWYoZS5pcyhyLFwiZnVuY3Rpb25cIikpcmV0dXJuIHc/cigpOnQub24oXCJyYXBoYWVsLkRPTWxvYWRcIixyKTtpZihlLmlzKHIsUSkpcmV0dXJuIGUuX2VuZ2luZS5jcmVhdGVbel0oZSxyLnNwbGljZSgwLDMrZS5pcyhyWzBdLCQpKSkuYWRkKHIpO3ZhciBpPUFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywwKTtpZihlLmlzKGlbaS5sZW5ndGgtMV0sXCJmdW5jdGlvblwiKSl7dmFyIG49aS5wb3AoKTtyZXR1cm4gdz9uLmNhbGwoZS5fZW5naW5lLmNyZWF0ZVt6XShlLGkpKTp0Lm9uKFwicmFwaGFlbC5ET01sb2FkXCIsZnVuY3Rpb24oKXtuLmNhbGwoZS5fZW5naW5lLmNyZWF0ZVt6XShlLGkpKX0pfXJldHVybiBlLl9lbmdpbmUuY3JlYXRlW3pdKGUsYXJndW1lbnRzKX1mdW5jdGlvbiByKHQpe2lmKFwiZnVuY3Rpb25cIj09dHlwZW9mIHR8fE9iamVjdCh0KSE9PXQpcmV0dXJuIHQ7dmFyIGU9bmV3IHQuY29uc3RydWN0b3I7Zm9yKHZhciBpIGluIHQpdFtBXShpKSYmKGVbaV09cih0W2ldKSk7cmV0dXJuIGV9ZnVuY3Rpb24gaSh0LGUpe2Zvcih2YXIgcj0wLGk9dC5sZW5ndGg7cjxpO3IrKylpZih0W3JdPT09ZSlyZXR1cm4gdC5wdXNoKHQuc3BsaWNlKHIsMSlbMF0pfWZ1bmN0aW9uIG4odCxlLHIpe2Z1bmN0aW9uIG4oKXt2YXIgYT1BcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsMCkscz1hLmpvaW4oXCLikIBcIiksbz1uLmNhY2hlPW4uY2FjaGV8fHt9LGw9bi5jb3VudD1uLmNvdW50fHxbXTtyZXR1cm4gb1tBXShzKT8oaShsLHMpLHI/cihvW3NdKTpvW3NdKToobC5sZW5ndGg+PTFlMyYmZGVsZXRlIG9bbC5zaGlmdCgpXSxsLnB1c2gocyksb1tzXT10W3pdKGUsYSkscj9yKG9bc10pOm9bc10pfXJldHVybiBufWZ1bmN0aW9uIGEoKXtyZXR1cm4gdGhpcy5oZXh9ZnVuY3Rpb24gcyh0LGUpe2Zvcih2YXIgcj1bXSxpPTAsbj10Lmxlbmd0aDtuLTIqIWU+aTtpKz0yKXt2YXIgYT1be3g6K3RbaS0yXSx5Oit0W2ktMV19LHt4Oit0W2ldLHk6K3RbaSsxXX0se3g6K3RbaSsyXSx5Oit0W2krM119LHt4Oit0W2krNF0seTordFtpKzVdfV07ZT9pP24tND09aT9hWzNdPXt4Oit0WzBdLHk6K3RbMV19Om4tMj09aSYmKGFbMl09e3g6K3RbMF0seTordFsxXX0sYVszXT17eDordFsyXSx5Oit0WzNdfSk6YVswXT17eDordFtuLTJdLHk6K3Rbbi0xXX06bi00PT1pP2FbM109YVsyXTppfHwoYVswXT17eDordFtpXSx5Oit0W2krMV19KSxyLnB1c2goW1wiQ1wiLCgtYVswXS54KzYqYVsxXS54K2FbMl0ueCkvNiwoLWFbMF0ueSs2KmFbMV0ueSthWzJdLnkpLzYsKGFbMV0ueCs2KmFbMl0ueC1hWzNdLngpLzYsKGFbMV0ueSs2KmFbMl0ueS1hWzNdLnkpLzYsYVsyXS54LGFbMl0ueV0pfXJldHVybiByfWZ1bmN0aW9uIG8odCxlLHIsaSxuKXt2YXIgYT0tMyplKzkqci05KmkrMypuLHM9dCphKzYqZS0xMipyKzYqaTtyZXR1cm4gdCpzLTMqZSszKnJ9ZnVuY3Rpb24gbCh0LGUscixpLG4sYSxzLGwsaCl7bnVsbD09aCYmKGg9MSksaD1oPjE/MTpoPDA/MDpoO2Zvcih2YXIgdT1oLzIsYz0xMixmPVstLjEyNTIsLjEyNTIsLS4zNjc4LC4zNjc4LC0uNTg3MywuNTg3MywtLjc2OTksLjc2OTksLS45MDQxLC45MDQxLC0uOTgxNiwuOTgxNl0scD1bLjI0OTEsLjI0OTEsLjIzMzUsLjIzMzUsLjIwMzIsLjIwMzIsLjE2MDEsLjE2MDEsLjEwNjksLjEwNjksLjA0NzIsLjA0NzJdLGQ9MCxnPTA7ZzxjO2crKyl7dmFyIHY9dSpmW2ddK3UseD1vKHYsdCxyLG4scykseT1vKHYsZSxpLGEsbCksbT14KngreSp5O2QrPXBbZ10qWS5zcXJ0KG0pfXJldHVybiB1KmR9ZnVuY3Rpb24gaCh0LGUscixpLG4sYSxzLG8saCl7aWYoIShoPDB8fGwodCxlLHIsaSxuLGEscyxvKTxoKSl7dmFyIHU9MSxjPXUvMixmPXUtYyxwLGQ9LjAxO2ZvcihwPWwodCxlLHIsaSxuLGEscyxvLGYpO0gocC1oKT5kOyljLz0yLGYrPShwPGg/MTotMSkqYyxwPWwodCxlLHIsaSxuLGEscyxvLGYpO3JldHVybiBmfX1mdW5jdGlvbiB1KHQsZSxyLGksbixhLHMsbyl7aWYoIShXKHQscik8RyhuLHMpfHxHKHQscik+VyhuLHMpfHxXKGUsaSk8RyhhLG8pfHxHKGUsaSk+VyhhLG8pKSl7dmFyIGw9KHQqaS1lKnIpKihuLXMpLSh0LXIpKihuKm8tYSpzKSxoPSh0KmktZSpyKSooYS1vKS0oZS1pKSoobipvLWEqcyksdT0odC1yKSooYS1vKS0oZS1pKSoobi1zKTtpZih1KXt2YXIgYz1sL3UsZj1oL3UscD0rYy50b0ZpeGVkKDIpLGQ9K2YudG9GaXhlZCgyKTtpZighKHA8K0codCxyKS50b0ZpeGVkKDIpfHxwPitXKHQscikudG9GaXhlZCgyKXx8cDwrRyhuLHMpLnRvRml4ZWQoMil8fHA+K1cobixzKS50b0ZpeGVkKDIpfHxkPCtHKGUsaSkudG9GaXhlZCgyKXx8ZD4rVyhlLGkpLnRvRml4ZWQoMil8fGQ8K0coYSxvKS50b0ZpeGVkKDIpfHxkPitXKGEsbykudG9GaXhlZCgyKSkpcmV0dXJue3g6Yyx5OmZ9fX19ZnVuY3Rpb24gYyh0LGUpe3JldHVybiBwKHQsZSl9ZnVuY3Rpb24gZih0LGUpe3JldHVybiBwKHQsZSwxKX1mdW5jdGlvbiBwKHQscixpKXt2YXIgbj1lLmJlemllckJCb3godCksYT1lLmJlemllckJCb3gocik7aWYoIWUuaXNCQm94SW50ZXJzZWN0KG4sYSkpcmV0dXJuIGk/MDpbXTtmb3IodmFyIHM9bC5hcHBseSgwLHQpLG89bC5hcHBseSgwLHIpLGg9Vyh+fihzLzUpLDEpLGM9Vyh+fihvLzUpLDEpLGY9W10scD1bXSxkPXt9LGc9aT8wOltdLHY9MDt2PGgrMTt2Kyspe3ZhciB4PWUuZmluZERvdHNBdFNlZ21lbnQuYXBwbHkoZSx0LmNvbmNhdCh2L2gpKTtmLnB1c2goe3g6eC54LHk6eC55LHQ6di9ofSl9Zm9yKHY9MDt2PGMrMTt2KyspeD1lLmZpbmREb3RzQXRTZWdtZW50LmFwcGx5KGUsci5jb25jYXQodi9jKSkscC5wdXNoKHt4OngueCx5OngueSx0OnYvY30pO2Zvcih2PTA7djxoO3YrKylmb3IodmFyIHk9MDt5PGM7eSsrKXt2YXIgbT1mW3ZdLGI9Zlt2KzFdLF89cFt5XSx3PXBbeSsxXSxrPUgoYi54LW0ueCk8LjAwMT9cInlcIjpcInhcIixCPUgody54LV8ueCk8LjAwMT9cInlcIjpcInhcIixDPXUobS54LG0ueSxiLngsYi55LF8ueCxfLnksdy54LHcueSk7aWYoQyl7aWYoZFtDLngudG9GaXhlZCg0KV09PUMueS50b0ZpeGVkKDQpKWNvbnRpbnVlO2RbQy54LnRvRml4ZWQoNCldPUMueS50b0ZpeGVkKDQpO3ZhciBTPW0udCtIKChDW2tdLW1ba10pLyhiW2tdLW1ba10pKSooYi50LW0udCksQT1fLnQrSCgoQ1tCXS1fW0JdKS8od1tCXS1fW0JdKSkqKHcudC1fLnQpO1M+PTAmJlM8PTEuMDAxJiZBPj0wJiZBPD0xLjAwMSYmKGk/ZysrOmcucHVzaCh7eDpDLngseTpDLnksdDE6RyhTLDEpLHQyOkcoQSwxKX0pKX19cmV0dXJuIGd9ZnVuY3Rpb24gZCh0LHIsaSl7dD1lLl9wYXRoMmN1cnZlKHQpLHI9ZS5fcGF0aDJjdXJ2ZShyKTtmb3IodmFyIG4sYSxzLG8sbCxoLHUsYyxmLGQsZz1pPzA6W10sdj0wLHg9dC5sZW5ndGg7djx4O3YrKyl7dmFyIHk9dFt2XTtpZihcIk1cIj09eVswXSluPWw9eVsxXSxhPWg9eVsyXTtlbHNle1wiQ1wiPT15WzBdPyhmPVtuLGFdLmNvbmNhdCh5LnNsaWNlKDEpKSxuPWZbNl0sYT1mWzddKTooZj1bbixhLG4sYSxsLGgsbCxoXSxuPWwsYT1oKTtmb3IodmFyIG09MCxiPXIubGVuZ3RoO208YjttKyspe3ZhciBfPXJbbV07aWYoXCJNXCI9PV9bMF0pcz11PV9bMV0sbz1jPV9bMl07ZWxzZXtcIkNcIj09X1swXT8oZD1bcyxvXS5jb25jYXQoXy5zbGljZSgxKSkscz1kWzZdLG89ZFs3XSk6KGQ9W3MsbyxzLG8sdSxjLHUsY10scz11LG89Yyk7dmFyIHc9cChmLGQsaSk7aWYoaSlnKz13O2Vsc2V7Zm9yKHZhciBrPTAsQj13Lmxlbmd0aDtrPEI7aysrKXdba10uc2VnbWVudDE9dix3W2tdLnNlZ21lbnQyPW0sd1trXS5iZXoxPWYsd1trXS5iZXoyPWQ7Zz1nLmNvbmNhdCh3KX19fX19cmV0dXJuIGd9ZnVuY3Rpb24gZyh0LGUscixpLG4sYSl7bnVsbCE9dD8odGhpcy5hPSt0LHRoaXMuYj0rZSx0aGlzLmM9K3IsdGhpcy5kPStpLHRoaXMuZT0rbix0aGlzLmY9K2EpOih0aGlzLmE9MSx0aGlzLmI9MCx0aGlzLmM9MCx0aGlzLmQ9MSx0aGlzLmU9MCx0aGlzLmY9MCl9ZnVuY3Rpb24gdigpe3JldHVybiB0aGlzLngrait0aGlzLnl9ZnVuY3Rpb24geCgpe3JldHVybiB0aGlzLngrait0aGlzLnkrait0aGlzLndpZHRoK1wiIMOXIFwiK3RoaXMuaGVpZ2h0fWZ1bmN0aW9uIHkodCxlLHIsaSxuLGEpe2Z1bmN0aW9uIHModCl7cmV0dXJuKChjKnQrdSkqdCtoKSp0fWZ1bmN0aW9uIG8odCxlKXt2YXIgcj1sKHQsZSk7cmV0dXJuKChkKnIrcCkqcitmKSpyfWZ1bmN0aW9uIGwodCxlKXt2YXIgcixpLG4sYSxvLGw7Zm9yKG49dCxsPTA7bDw4O2wrKyl7aWYoYT1zKG4pLXQsSChhKTxlKXJldHVybiBuO2lmKG89KDMqYypuKzIqdSkqbitoLEgobyk8MWUtNilicmVhaztuLT1hL299aWYocj0wLGk9MSxuPXQsbjxyKXJldHVybiByO2lmKG4+aSlyZXR1cm4gaTtmb3IoO3I8aTspe2lmKGE9cyhuKSxIKGEtdCk8ZSlyZXR1cm4gbjt0PmE/cj1uOmk9bixuPShpLXIpLzIrcn1yZXR1cm4gbn12YXIgaD0zKmUsdT0zKihpLWUpLWgsYz0xLWgtdSxmPTMqcixwPTMqKG4tciktZixkPTEtZi1wO3JldHVybiBvKHQsMS8oMjAwKmEpKX1mdW5jdGlvbiBtKHQsZSl7dmFyIHI9W10saT17fTtpZih0aGlzLm1zPWUsdGhpcy50aW1lcz0xLHQpe2Zvcih2YXIgbiBpbiB0KXRbQV0obikmJihpW2h0KG4pXT10W25dLHIucHVzaChodChuKSkpO3Iuc29ydChCdCl9dGhpcy5hbmltPWksdGhpcy50b3A9cltyLmxlbmd0aC0xXSx0aGlzLnBlcmNlbnRzPXJ9ZnVuY3Rpb24gYihyLGksbixhLHMsbyl7bj1odChuKTt2YXIgbCxoLHUsYz1bXSxmLHAsZCx2PXIubXMseD17fSxtPXt9LGI9e307aWYoYSlmb3Iodz0wLEI9RWUubGVuZ3RoO3c8Qjt3Kyspe3ZhciBfPUVlW3ddO2lmKF8uZWwuaWQ9PWkuaWQmJl8uYW5pbT09cil7Xy5wZXJjZW50IT1uPyhFZS5zcGxpY2UodywxKSx1PTEpOmg9XyxpLmF0dHIoXy50b3RhbE9yaWdpbik7YnJlYWt9fWVsc2UgYT0rbTtmb3IodmFyIHc9MCxCPXIucGVyY2VudHMubGVuZ3RoO3c8Qjt3Kyspe2lmKHIucGVyY2VudHNbd109PW58fHIucGVyY2VudHNbd10+YSpyLnRvcCl7bj1yLnBlcmNlbnRzW3ddLHA9ci5wZXJjZW50c1t3LTFdfHwwLHY9di9yLnRvcCoobi1wKSxmPXIucGVyY2VudHNbdysxXSxsPXIuYW5pbVtuXTticmVha31hJiZpLmF0dHIoci5hbmltW3IucGVyY2VudHNbd11dKX1pZihsKXtpZihoKWguaW5pdHN0YXR1cz1hLGguc3RhcnQ9bmV3IERhdGUtaC5tcyphO2Vsc2V7Zm9yKHZhciBDIGluIGwpaWYobFtBXShDKSYmKHB0W0FdKEMpfHxpLnBhcGVyLmN1c3RvbUF0dHJpYnV0ZXNbQV0oQykpKXN3aXRjaCh4W0NdPWkuYXR0cihDKSxudWxsPT14W0NdJiYoeFtDXT1mdFtDXSksbVtDXT1sW0NdLHB0W0NdKXtjYXNlICQ6YltDXT0obVtDXS14W0NdKS92O2JyZWFrO2Nhc2VcImNvbG91clwiOnhbQ109ZS5nZXRSR0IoeFtDXSk7dmFyIFM9ZS5nZXRSR0IobVtDXSk7YltDXT17cjooUy5yLXhbQ10ucikvdixnOihTLmcteFtDXS5nKS92LGI6KFMuYi14W0NdLmIpL3Z9O2JyZWFrO2Nhc2VcInBhdGhcIjp2YXIgVD1RdCh4W0NdLG1bQ10pLEU9VFsxXTtmb3IoeFtDXT1UWzBdLGJbQ109W10sdz0wLEI9eFtDXS5sZW5ndGg7dzxCO3crKyl7YltDXVt3XT1bMF07Zm9yKHZhciBNPTEsTj14W0NdW3ddLmxlbmd0aDtNPE47TSsrKWJbQ11bd11bTV09KEVbd11bTV0teFtDXVt3XVtNXSkvdn1icmVhaztjYXNlXCJ0cmFuc2Zvcm1cIjp2YXIgTD1pLl8sej1sZShMW0NdLG1bQ10pO2lmKHopZm9yKHhbQ109ei5mcm9tLG1bQ109ei50byxiW0NdPVtdLGJbQ10ucmVhbD0hMCx3PTAsQj14W0NdLmxlbmd0aDt3PEI7dysrKWZvcihiW0NdW3ddPVt4W0NdW3ddWzBdXSxNPTEsTj14W0NdW3ddLmxlbmd0aDtNPE47TSsrKWJbQ11bd11bTV09KG1bQ11bd11bTV0teFtDXVt3XVtNXSkvdjtlbHNle3ZhciBGPWkubWF0cml4fHxuZXcgZyxSPXtfOnt0cmFuc2Zvcm06TC50cmFuc2Zvcm19LGdldEJCb3g6ZnVuY3Rpb24oKXtyZXR1cm4gaS5nZXRCQm94KDEpfX07eFtDXT1bRi5hLEYuYixGLmMsRi5kLEYuZSxGLmZdLHNlKFIsbVtDXSksbVtDXT1SLl8udHJhbnNmb3JtLGJbQ109WyhSLm1hdHJpeC5hLUYuYSkvdiwoUi5tYXRyaXguYi1GLmIpL3YsKFIubWF0cml4LmMtRi5jKS92LChSLm1hdHJpeC5kLUYuZCkvdiwoUi5tYXRyaXguZS1GLmUpL3YsKFIubWF0cml4LmYtRi5mKS92XX1icmVhaztjYXNlXCJjc3ZcIjp2YXIgaj1JKGxbQ10pW3FdKGspLEQ9SSh4W0NdKVtxXShrKTtpZihcImNsaXAtcmVjdFwiPT1DKWZvcih4W0NdPUQsYltDXT1bXSx3PUQubGVuZ3RoO3ctLTspYltDXVt3XT0oalt3XS14W0NdW3ddKS92O21bQ109ajticmVhaztkZWZhdWx0OmZvcihqPVtdW1BdKGxbQ10pLEQ9W11bUF0oeFtDXSksYltDXT1bXSx3PWkucGFwZXIuY3VzdG9tQXR0cmlidXRlc1tDXS5sZW5ndGg7dy0tOyliW0NdW3ddPSgoalt3XXx8MCktKERbd118fDApKS92fXZhciBWPWwuZWFzaW5nLE89ZS5lYXNpbmdfZm9ybXVsYXNbVl07aWYoIU8paWYoTz1JKFYpLm1hdGNoKHN0KSxPJiY1PT1PLmxlbmd0aCl7dmFyIFk9TztPPWZ1bmN0aW9uKHQpe3JldHVybiB5KHQsK1lbMV0sK1lbMl0sK1lbM10sK1lbNF0sdil9fWVsc2UgTz1TdDtpZihkPWwuc3RhcnR8fHIuc3RhcnR8fCtuZXcgRGF0ZSxfPXthbmltOnIscGVyY2VudDpuLHRpbWVzdGFtcDpkLHN0YXJ0OmQrKHIuZGVsfHwwKSxzdGF0dXM6MCxpbml0c3RhdHVzOmF8fDAsc3RvcDohMSxtczp2LGVhc2luZzpPLGZyb206eCxkaWZmOmIsdG86bSxlbDppLGNhbGxiYWNrOmwuY2FsbGJhY2sscHJldjpwLG5leHQ6ZixyZXBlYXQ6b3x8ci50aW1lcyxvcmlnaW46aS5hdHRyKCksdG90YWxPcmlnaW46c30sRWUucHVzaChfKSxhJiYhaCYmIXUmJihfLnN0b3A9ITAsXy5zdGFydD1uZXcgRGF0ZS12KmEsMT09RWUubGVuZ3RoKSlyZXR1cm4gTmUoKTt1JiYoXy5zdGFydD1uZXcgRGF0ZS1fLm1zKmEpLDE9PUVlLmxlbmd0aCYmTWUoTmUpfXQoXCJyYXBoYWVsLmFuaW0uc3RhcnQuXCIraS5pZCxpLHIpfX1mdW5jdGlvbiBfKHQpe2Zvcih2YXIgZT0wO2U8RWUubGVuZ3RoO2UrKylFZVtlXS5lbC5wYXBlcj09dCYmRWUuc3BsaWNlKGUtLSwxKX1lLnZlcnNpb249XCIyLjIuMFwiLGUuZXZlPXQ7dmFyIHcsaz0vWywgXSsvLEI9e2NpcmNsZToxLHJlY3Q6MSxwYXRoOjEsZWxsaXBzZToxLHRleHQ6MSxpbWFnZToxfSxDPS9cXHsoXFxkKylcXH0vZyxTPVwicHJvdG90eXBlXCIsQT1cImhhc093blByb3BlcnR5XCIsVD17ZG9jOmRvY3VtZW50LHdpbjp3aW5kb3d9LEU9e3dhczpPYmplY3QucHJvdG90eXBlW0FdLmNhbGwoVC53aW4sXCJSYXBoYWVsXCIpLGlzOlQud2luLlJhcGhhZWx9LE09ZnVuY3Rpb24oKXt0aGlzLmNhPXRoaXMuY3VzdG9tQXR0cmlidXRlcz17fX0sTixMPVwiYXBwZW5kQ2hpbGRcIix6PVwiYXBwbHlcIixQPVwiY29uY2F0XCIsRj1cIm9udG91Y2hzdGFydFwiaW4gVC53aW58fFQud2luLkRvY3VtZW50VG91Y2gmJlQuZG9jIGluc3RhbmNlb2YgRG9jdW1lbnRUb3VjaCxSPVwiXCIsaj1cIiBcIixJPVN0cmluZyxxPVwic3BsaXRcIixEPVwiY2xpY2sgZGJsY2xpY2sgbW91c2Vkb3duIG1vdXNlbW92ZSBtb3VzZW91dCBtb3VzZW92ZXIgbW91c2V1cCB0b3VjaHN0YXJ0IHRvdWNobW92ZSB0b3VjaGVuZCB0b3VjaGNhbmNlbFwiW3FdKGopLFY9e21vdXNlZG93bjpcInRvdWNoc3RhcnRcIixtb3VzZW1vdmU6XCJ0b3VjaG1vdmVcIixtb3VzZXVwOlwidG91Y2hlbmRcIn0sTz1JLnByb3RvdHlwZS50b0xvd2VyQ2FzZSxZPU1hdGgsVz1ZLm1heCxHPVkubWluLEg9WS5hYnMsWD1ZLnBvdyxVPVkuUEksJD1cIm51bWJlclwiLFo9XCJzdHJpbmdcIixRPVwiYXJyYXlcIixKPVwidG9TdHJpbmdcIixLPVwiZmlsbFwiLHR0PU9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcsZXQ9e30scnQ9XCJwdXNoXCIsaXQ9ZS5fSVNVUkw9L151cmxcXChbJ1wiXT8oLis/KVsnXCJdP1xcKSQvaSxudD0vXlxccyooKCNbYS1mXFxkXXs2fSl8KCNbYS1mXFxkXXszfSl8cmdiYT9cXChcXHMqKFtcXGRcXC5dKyU/XFxzKixcXHMqW1xcZFxcLl0rJT9cXHMqLFxccypbXFxkXFwuXSslPyg/OlxccyosXFxzKltcXGRcXC5dKyU/KT8pXFxzKlxcKXxoc2JhP1xcKFxccyooW1xcZFxcLl0rKD86ZGVnfFxceGIwfCUpP1xccyosXFxzKltcXGRcXC5dKyU/XFxzKixcXHMqW1xcZFxcLl0rKD86JT9cXHMqLFxccypbXFxkXFwuXSspPyklP1xccypcXCl8aHNsYT9cXChcXHMqKFtcXGRcXC5dKyg/OmRlZ3xcXHhiMHwlKT9cXHMqLFxccypbXFxkXFwuXSslP1xccyosXFxzKltcXGRcXC5dKyg/OiU/XFxzKixcXHMqW1xcZFxcLl0rKT8pJT9cXHMqXFwpKVxccyokL2ksYXQ9e05hTjoxLEluZmluaXR5OjEsXCItSW5maW5pdHlcIjoxfSxzdD0vXig/OmN1YmljLSk/YmV6aWVyXFwoKFteLF0rKSwoW14sXSspLChbXixdKyksKFteXFwpXSspXFwpLyxvdD1ZLnJvdW5kLGx0PVwic2V0QXR0cmlidXRlXCIsaHQ9cGFyc2VGbG9hdCx1dD1wYXJzZUludCxjdD1JLnByb3RvdHlwZS50b1VwcGVyQ2FzZSxmdD1lLl9hdmFpbGFibGVBdHRycz17XCJhcnJvdy1lbmRcIjpcIm5vbmVcIixcImFycm93LXN0YXJ0XCI6XCJub25lXCIsYmx1cjowLFwiY2xpcC1yZWN0XCI6XCIwIDAgMWU5IDFlOVwiLGN1cnNvcjpcImRlZmF1bHRcIixjeDowLGN5OjAsZmlsbDpcIiNmZmZcIixcImZpbGwtb3BhY2l0eVwiOjEsZm9udDonMTBweCBcIkFyaWFsXCInLFwiZm9udC1mYW1pbHlcIjonXCJBcmlhbFwiJyxcImZvbnQtc2l6ZVwiOlwiMTBcIixcImZvbnQtc3R5bGVcIjpcIm5vcm1hbFwiLFwiZm9udC13ZWlnaHRcIjo0MDAsZ3JhZGllbnQ6MCxoZWlnaHQ6MCxocmVmOlwiaHR0cDovL3JhcGhhZWxqcy5jb20vXCIsXCJsZXR0ZXItc3BhY2luZ1wiOjAsb3BhY2l0eToxLHBhdGg6XCJNMCwwXCIscjowLHJ4OjAscnk6MCxzcmM6XCJcIixzdHJva2U6XCIjMDAwXCIsXCJzdHJva2UtZGFzaGFycmF5XCI6XCJcIixcInN0cm9rZS1saW5lY2FwXCI6XCJidXR0XCIsXCJzdHJva2UtbGluZWpvaW5cIjpcImJ1dHRcIixcInN0cm9rZS1taXRlcmxpbWl0XCI6MCxcInN0cm9rZS1vcGFjaXR5XCI6MSxcInN0cm9rZS13aWR0aFwiOjEsdGFyZ2V0OlwiX2JsYW5rXCIsXCJ0ZXh0LWFuY2hvclwiOlwibWlkZGxlXCIsdGl0bGU6XCJSYXBoYWVsXCIsdHJhbnNmb3JtOlwiXCIsd2lkdGg6MCx4OjAseTowLFwiY2xhc3NcIjpcIlwifSxwdD1lLl9hdmFpbGFibGVBbmltQXR0cnM9e2JsdXI6JCxcImNsaXAtcmVjdFwiOlwiY3N2XCIsY3g6JCxjeTokLGZpbGw6XCJjb2xvdXJcIixcImZpbGwtb3BhY2l0eVwiOiQsXCJmb250LXNpemVcIjokLGhlaWdodDokLG9wYWNpdHk6JCxwYXRoOlwicGF0aFwiLHI6JCxyeDokLHJ5OiQsc3Ryb2tlOlwiY29sb3VyXCIsXCJzdHJva2Utb3BhY2l0eVwiOiQsXCJzdHJva2Utd2lkdGhcIjokLHRyYW5zZm9ybTpcInRyYW5zZm9ybVwiLHdpZHRoOiQseDokLHk6JH0sZHQ9L1tcXHgwOVxceDBhXFx4MGJcXHgwY1xceDBkXFx4MjBcXHhhMFxcdTE2ODBcXHUxODBlXFx1MjAwMFxcdTIwMDFcXHUyMDAyXFx1MjAwM1xcdTIwMDRcXHUyMDA1XFx1MjAwNlxcdTIwMDdcXHUyMDA4XFx1MjAwOVxcdTIwMGFcXHUyMDJmXFx1MjA1ZlxcdTMwMDBcXHUyMDI4XFx1MjAyOV0vZyxndD0vW1xceDA5XFx4MGFcXHgwYlxceDBjXFx4MGRcXHgyMFxceGEwXFx1MTY4MFxcdTE4MGVcXHUyMDAwXFx1MjAwMVxcdTIwMDJcXHUyMDAzXFx1MjAwNFxcdTIwMDVcXHUyMDA2XFx1MjAwN1xcdTIwMDhcXHUyMDA5XFx1MjAwYVxcdTIwMmZcXHUyMDVmXFx1MzAwMFxcdTIwMjhcXHUyMDI5XSosW1xceDA5XFx4MGFcXHgwYlxceDBjXFx4MGRcXHgyMFxceGEwXFx1MTY4MFxcdTE4MGVcXHUyMDAwXFx1MjAwMVxcdTIwMDJcXHUyMDAzXFx1MjAwNFxcdTIwMDVcXHUyMDA2XFx1MjAwN1xcdTIwMDhcXHUyMDA5XFx1MjAwYVxcdTIwMmZcXHUyMDVmXFx1MzAwMFxcdTIwMjhcXHUyMDI5XSovLHZ0PXtoczoxLHJnOjF9LHh0PS8sPyhbYWNobG1xcnN0dnh6XSksPy9naSx5dD0vKFthY2hsbXJxc3R2el0pW1xceDA5XFx4MGFcXHgwYlxceDBjXFx4MGRcXHgyMFxceGEwXFx1MTY4MFxcdTE4MGVcXHUyMDAwXFx1MjAwMVxcdTIwMDJcXHUyMDAzXFx1MjAwNFxcdTIwMDVcXHUyMDA2XFx1MjAwN1xcdTIwMDhcXHUyMDA5XFx1MjAwYVxcdTIwMmZcXHUyMDVmXFx1MzAwMFxcdTIwMjhcXHUyMDI5LF0qKCgtP1xcZCpcXC4/XFxkKig/OmVbXFwtK10/XFxkKyk/W1xceDA5XFx4MGFcXHgwYlxceDBjXFx4MGRcXHgyMFxceGEwXFx1MTY4MFxcdTE4MGVcXHUyMDAwXFx1MjAwMVxcdTIwMDJcXHUyMDAzXFx1MjAwNFxcdTIwMDVcXHUyMDA2XFx1MjAwN1xcdTIwMDhcXHUyMDA5XFx1MjAwYVxcdTIwMmZcXHUyMDVmXFx1MzAwMFxcdTIwMjhcXHUyMDI5XSosP1tcXHgwOVxceDBhXFx4MGJcXHgwY1xceDBkXFx4MjBcXHhhMFxcdTE2ODBcXHUxODBlXFx1MjAwMFxcdTIwMDFcXHUyMDAyXFx1MjAwM1xcdTIwMDRcXHUyMDA1XFx1MjAwNlxcdTIwMDdcXHUyMDA4XFx1MjAwOVxcdTIwMGFcXHUyMDJmXFx1MjA1ZlxcdTMwMDBcXHUyMDI4XFx1MjAyOV0qKSspL2dpLG10PS8oW3JzdG1dKVtcXHgwOVxceDBhXFx4MGJcXHgwY1xceDBkXFx4MjBcXHhhMFxcdTE2ODBcXHUxODBlXFx1MjAwMFxcdTIwMDFcXHUyMDAyXFx1MjAwM1xcdTIwMDRcXHUyMDA1XFx1MjAwNlxcdTIwMDdcXHUyMDA4XFx1MjAwOVxcdTIwMGFcXHUyMDJmXFx1MjA1ZlxcdTMwMDBcXHUyMDI4XFx1MjAyOSxdKigoLT9cXGQqXFwuP1xcZCooPzplW1xcLStdP1xcZCspP1tcXHgwOVxceDBhXFx4MGJcXHgwY1xceDBkXFx4MjBcXHhhMFxcdTE2ODBcXHUxODBlXFx1MjAwMFxcdTIwMDFcXHUyMDAyXFx1MjAwM1xcdTIwMDRcXHUyMDA1XFx1MjAwNlxcdTIwMDdcXHUyMDA4XFx1MjAwOVxcdTIwMGFcXHUyMDJmXFx1MjA1ZlxcdTMwMDBcXHUyMDI4XFx1MjAyOV0qLD9bXFx4MDlcXHgwYVxceDBiXFx4MGNcXHgwZFxceDIwXFx4YTBcXHUxNjgwXFx1MTgwZVxcdTIwMDBcXHUyMDAxXFx1MjAwMlxcdTIwMDNcXHUyMDA0XFx1MjAwNVxcdTIwMDZcXHUyMDA3XFx1MjAwOFxcdTIwMDlcXHUyMDBhXFx1MjAyZlxcdTIwNWZcXHUzMDAwXFx1MjAyOFxcdTIwMjldKikrKS9naSxidD0vKC0/XFxkKlxcLj9cXGQqKD86ZVtcXC0rXT9cXGQrKT8pW1xceDA5XFx4MGFcXHgwYlxceDBjXFx4MGRcXHgyMFxceGEwXFx1MTY4MFxcdTE4MGVcXHUyMDAwXFx1MjAwMVxcdTIwMDJcXHUyMDAzXFx1MjAwNFxcdTIwMDVcXHUyMDA2XFx1MjAwN1xcdTIwMDhcXHUyMDA5XFx1MjAwYVxcdTIwMmZcXHUyMDVmXFx1MzAwMFxcdTIwMjhcXHUyMDI5XSosP1tcXHgwOVxceDBhXFx4MGJcXHgwY1xceDBkXFx4MjBcXHhhMFxcdTE2ODBcXHUxODBlXFx1MjAwMFxcdTIwMDFcXHUyMDAyXFx1MjAwM1xcdTIwMDRcXHUyMDA1XFx1MjAwNlxcdTIwMDdcXHUyMDA4XFx1MjAwOVxcdTIwMGFcXHUyMDJmXFx1MjA1ZlxcdTMwMDBcXHUyMDI4XFx1MjAyOV0qL2dpLF90PWUuX3JhZGlhbF9ncmFkaWVudD0vXnIoPzpcXCgoW14sXSs/KVtcXHgwOVxceDBhXFx4MGJcXHgwY1xceDBkXFx4MjBcXHhhMFxcdTE2ODBcXHUxODBlXFx1MjAwMFxcdTIwMDFcXHUyMDAyXFx1MjAwM1xcdTIwMDRcXHUyMDA1XFx1MjAwNlxcdTIwMDdcXHUyMDA4XFx1MjAwOVxcdTIwMGFcXHUyMDJmXFx1MjA1ZlxcdTMwMDBcXHUyMDI4XFx1MjAyOV0qLFtcXHgwOVxceDBhXFx4MGJcXHgwY1xceDBkXFx4MjBcXHhhMFxcdTE2ODBcXHUxODBlXFx1MjAwMFxcdTIwMDFcXHUyMDAyXFx1MjAwM1xcdTIwMDRcXHUyMDA1XFx1MjAwNlxcdTIwMDdcXHUyMDA4XFx1MjAwOVxcdTIwMGFcXHUyMDJmXFx1MjA1ZlxcdTMwMDBcXHUyMDI4XFx1MjAyOV0qKFteXFwpXSs/KVxcKSk/Lyx3dD17fSxrdD1mdW5jdGlvbih0LGUpe3JldHVybiB0LmtleS1lLmtleX0sQnQ9ZnVuY3Rpb24odCxlKXtyZXR1cm4gaHQodCktaHQoZSl9LEN0PWZ1bmN0aW9uKCl7fSxTdD1mdW5jdGlvbih0KXtyZXR1cm4gdH0sQXQ9ZS5fcmVjdFBhdGg9ZnVuY3Rpb24odCxlLHIsaSxuKXtyZXR1cm4gbj9bW1wiTVwiLHQrbixlXSxbXCJsXCIsci0yKm4sMF0sW1wiYVwiLG4sbiwwLDAsMSxuLG5dLFtcImxcIiwwLGktMipuXSxbXCJhXCIsbixuLDAsMCwxLC1uLG5dLFtcImxcIiwyKm4tciwwXSxbXCJhXCIsbixuLDAsMCwxLC1uLC1uXSxbXCJsXCIsMCwyKm4taV0sW1wiYVwiLG4sbiwwLDAsMSxuLC1uXSxbXCJ6XCJdXTpbW1wiTVwiLHQsZV0sW1wibFwiLHIsMF0sW1wibFwiLDAsaV0sW1wibFwiLC1yLDBdLFtcInpcIl1dfSxUdD1mdW5jdGlvbih0LGUscixpKXtyZXR1cm4gbnVsbD09aSYmKGk9ciksW1tcIk1cIix0LGVdLFtcIm1cIiwwLC1pXSxbXCJhXCIscixpLDAsMSwxLDAsMippXSxbXCJhXCIscixpLDAsMSwxLDAsLTIqaV0sW1wielwiXV19LEV0PWUuX2dldFBhdGg9e3BhdGg6ZnVuY3Rpb24odCl7cmV0dXJuIHQuYXR0cihcInBhdGhcIil9LGNpcmNsZTpmdW5jdGlvbih0KXt2YXIgZT10LmF0dHJzO3JldHVybiBUdChlLmN4LGUuY3ksZS5yKX0sZWxsaXBzZTpmdW5jdGlvbih0KXt2YXIgZT10LmF0dHJzO3JldHVybiBUdChlLmN4LGUuY3ksZS5yeCxlLnJ5KX0scmVjdDpmdW5jdGlvbih0KXt2YXIgZT10LmF0dHJzO3JldHVybiBBdChlLngsZS55LGUud2lkdGgsZS5oZWlnaHQsZS5yKX0saW1hZ2U6ZnVuY3Rpb24odCl7dmFyIGU9dC5hdHRycztyZXR1cm4gQXQoZS54LGUueSxlLndpZHRoLGUuaGVpZ2h0KX0sdGV4dDpmdW5jdGlvbih0KXt2YXIgZT10Ll9nZXRCQm94KCk7cmV0dXJuIEF0KGUueCxlLnksZS53aWR0aCxlLmhlaWdodCl9LHNldDpmdW5jdGlvbih0KXt2YXIgZT10Ll9nZXRCQm94KCk7cmV0dXJuIEF0KGUueCxlLnksZS53aWR0aCxlLmhlaWdodCl9fSxNdD1lLm1hcFBhdGg9ZnVuY3Rpb24odCxlKXtpZighZSlyZXR1cm4gdDt2YXIgcixpLG4sYSxzLG8sbDtmb3IodD1RdCh0KSxuPTAscz10Lmxlbmd0aDtuPHM7bisrKWZvcihsPXRbbl0sYT0xLG89bC5sZW5ndGg7YTxvO2ErPTIpcj1lLngobFthXSxsW2ErMV0pLGk9ZS55KGxbYV0sbFthKzFdKSxsW2FdPXIsbFthKzFdPWk7cmV0dXJuIHR9O2lmKGUuX2c9VCxlLnR5cGU9VC53aW4uU1ZHQW5nbGV8fFQuZG9jLmltcGxlbWVudGF0aW9uLmhhc0ZlYXR1cmUoXCJodHRwOi8vd3d3LnczLm9yZy9UUi9TVkcxMS9mZWF0dXJlI0Jhc2ljU3RydWN0dXJlXCIsXCIxLjFcIik/XCJTVkdcIjpcIlZNTFwiLFwiVk1MXCI9PWUudHlwZSl7dmFyIE50PVQuZG9jLmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksTHQ7aWYoTnQuaW5uZXJIVE1MPSc8djpzaGFwZSBhZGo9XCIxXCIvPicsTHQ9TnQuZmlyc3RDaGlsZCxMdC5zdHlsZS5iZWhhdmlvcj1cInVybCgjZGVmYXVsdCNWTUwpXCIsIUx0fHxcIm9iamVjdFwiIT10eXBlb2YgTHQuYWRqKXJldHVybiBlLnR5cGU9UjtOdD1udWxsfWUuc3ZnPSEoZS52bWw9XCJWTUxcIj09ZS50eXBlKSxlLl9QYXBlcj1NLGUuZm49Tj1NLnByb3RvdHlwZT1lLnByb3RvdHlwZSxlLl9pZD0wLGUuaXM9ZnVuY3Rpb24odCxlKXtyZXR1cm4gZT1PLmNhbGwoZSksXCJmaW5pdGVcIj09ZT8hYXRbQV0oK3QpOlwiYXJyYXlcIj09ZT90IGluc3RhbmNlb2YgQXJyYXk6XCJudWxsXCI9PWUmJm51bGw9PT10fHxlPT10eXBlb2YgdCYmbnVsbCE9PXR8fFwib2JqZWN0XCI9PWUmJnQ9PT1PYmplY3QodCl8fFwiYXJyYXlcIj09ZSYmQXJyYXkuaXNBcnJheSYmQXJyYXkuaXNBcnJheSh0KXx8dHQuY2FsbCh0KS5zbGljZSg4LC0xKS50b0xvd2VyQ2FzZSgpPT1lfSxlLmFuZ2xlPWZ1bmN0aW9uKHQscixpLG4sYSxzKXtpZihudWxsPT1hKXt2YXIgbz10LWksbD1yLW47cmV0dXJuIG98fGw/KDE4MCsxODAqWS5hdGFuMigtbCwtbykvVSszNjApJTM2MDowfXJldHVybiBlLmFuZ2xlKHQscixhLHMpLWUuYW5nbGUoaSxuLGEscyl9LGUucmFkPWZ1bmN0aW9uKHQpe3JldHVybiB0JTM2MCpVLzE4MH0sZS5kZWc9ZnVuY3Rpb24odCl7cmV0dXJuIE1hdGgucm91bmQoMTgwKnQvVSUzNjAqMWUzKS8xZTN9LGUuc25hcFRvPWZ1bmN0aW9uKHQscixpKXtpZihpPWUuaXMoaSxcImZpbml0ZVwiKT9pOjEwLGUuaXModCxRKSl7Zm9yKHZhciBuPXQubGVuZ3RoO24tLTspaWYoSCh0W25dLXIpPD1pKXJldHVybiB0W25dfWVsc2V7dD0rdDt2YXIgYT1yJXQ7aWYoYTxpKXJldHVybiByLWE7aWYoYT50LWkpcmV0dXJuIHItYSt0fXJldHVybiByfTt2YXIgenQ9ZS5jcmVhdGVVVUlEPWZ1bmN0aW9uKHQsZSl7cmV0dXJuIGZ1bmN0aW9uKCl7cmV0dXJuXCJ4eHh4eHh4eC14eHh4LTR4eHgteXh4eC14eHh4eHh4eHh4eHhcIi5yZXBsYWNlKHQsZSkudG9VcHBlckNhc2UoKX19KC9beHldL2csZnVuY3Rpb24odCl7dmFyIGU9MTYqWS5yYW5kb20oKXwwLHI9XCJ4XCI9PXQ/ZTozJmV8ODtyZXR1cm4gci50b1N0cmluZygxNil9KTtlLnNldFdpbmRvdz1mdW5jdGlvbihyKXt0KFwicmFwaGFlbC5zZXRXaW5kb3dcIixlLFQud2luLHIpLFQud2luPXIsVC5kb2M9VC53aW4uZG9jdW1lbnQsZS5fZW5naW5lLmluaXRXaW4mJmUuX2VuZ2luZS5pbml0V2luKFQud2luKX07dmFyIFB0PWZ1bmN0aW9uKHQpe2lmKGUudm1sKXt2YXIgcj0vXlxccyt8XFxzKyQvZyxpO3RyeXt2YXIgYT1uZXcgQWN0aXZlWE9iamVjdChcImh0bWxmaWxlXCIpO2Eud3JpdGUoXCI8Ym9keT5cIiksYS5jbG9zZSgpLGk9YS5ib2R5fWNhdGNoKHMpe2k9Y3JlYXRlUG9wdXAoKS5kb2N1bWVudC5ib2R5fXZhciBvPWkuY3JlYXRlVGV4dFJhbmdlKCk7UHQ9bihmdW5jdGlvbih0KXt0cnl7aS5zdHlsZS5jb2xvcj1JKHQpLnJlcGxhY2UocixSKTt2YXIgZT1vLnF1ZXJ5Q29tbWFuZFZhbHVlKFwiRm9yZUNvbG9yXCIpO3JldHVybiBlPSgyNTUmZSk8PDE2fDY1MjgwJmV8KDE2NzExNjgwJmUpPj4+MTYsXCIjXCIrKFwiMDAwMDAwXCIrZS50b1N0cmluZygxNikpLnNsaWNlKC02KX1jYXRjaChuKXtyZXR1cm5cIm5vbmVcIn19KX1lbHNle3ZhciBsPVQuZG9jLmNyZWF0ZUVsZW1lbnQoXCJpXCIpO2wudGl0bGU9XCJSYXBoYcOrbCBDb2xvdXIgUGlja2VyXCIsbC5zdHlsZS5kaXNwbGF5PVwibm9uZVwiLFQuZG9jLmJvZHkuYXBwZW5kQ2hpbGQobCksUHQ9bihmdW5jdGlvbih0KXtyZXR1cm4gbC5zdHlsZS5jb2xvcj10LFQuZG9jLmRlZmF1bHRWaWV3LmdldENvbXB1dGVkU3R5bGUobCxSKS5nZXRQcm9wZXJ0eVZhbHVlKFwiY29sb3JcIil9KX1yZXR1cm4gUHQodCl9LEZ0PWZ1bmN0aW9uKCl7cmV0dXJuXCJoc2IoXCIrW3RoaXMuaCx0aGlzLnMsdGhpcy5iXStcIilcIn0sUnQ9ZnVuY3Rpb24oKXtyZXR1cm5cImhzbChcIitbdGhpcy5oLHRoaXMucyx0aGlzLmxdK1wiKVwifSxqdD1mdW5jdGlvbigpe3JldHVybiB0aGlzLmhleH0sSXQ9ZnVuY3Rpb24odCxyLGkpe2lmKG51bGw9PXImJmUuaXModCxcIm9iamVjdFwiKSYmXCJyXCJpbiB0JiZcImdcImluIHQmJlwiYlwiaW4gdCYmKGk9dC5iLHI9dC5nLHQ9dC5yKSxudWxsPT1yJiZlLmlzKHQsWikpe3ZhciBuPWUuZ2V0UkdCKHQpO3Q9bi5yLHI9bi5nLGk9bi5ifXJldHVybih0PjF8fHI+MXx8aT4xKSYmKHQvPTI1NSxyLz0yNTUsaS89MjU1KSxbdCxyLGldfSxxdD1mdW5jdGlvbih0LHIsaSxuKXt0Kj0yNTUscio9MjU1LGkqPTI1NTt2YXIgYT17cjp0LGc6cixiOmksaGV4OmUucmdiKHQscixpKSx0b1N0cmluZzpqdH07cmV0dXJuIGUuaXMobixcImZpbml0ZVwiKSYmKGEub3BhY2l0eT1uKSxhfTtlLmNvbG9yPWZ1bmN0aW9uKHQpe3ZhciByO3JldHVybiBlLmlzKHQsXCJvYmplY3RcIikmJlwiaFwiaW4gdCYmXCJzXCJpbiB0JiZcImJcImluIHQ/KHI9ZS5oc2IycmdiKHQpLHQucj1yLnIsdC5nPXIuZyx0LmI9ci5iLHQuaGV4PXIuaGV4KTplLmlzKHQsXCJvYmplY3RcIikmJlwiaFwiaW4gdCYmXCJzXCJpbiB0JiZcImxcImluIHQ/KHI9ZS5oc2wycmdiKHQpLHQucj1yLnIsdC5nPXIuZyx0LmI9ci5iLHQuaGV4PXIuaGV4KTooZS5pcyh0LFwic3RyaW5nXCIpJiYodD1lLmdldFJHQih0KSksZS5pcyh0LFwib2JqZWN0XCIpJiZcInJcImluIHQmJlwiZ1wiaW4gdCYmXCJiXCJpbiB0PyhyPWUucmdiMmhzbCh0KSx0Lmg9ci5oLHQucz1yLnMsdC5sPXIubCxyPWUucmdiMmhzYih0KSx0LnY9ci5iKToodD17aGV4Olwibm9uZVwifSx0LnI9dC5nPXQuYj10Lmg9dC5zPXQudj10Lmw9LTEpKSx0LnRvU3RyaW5nPWp0LHR9LGUuaHNiMnJnYj1mdW5jdGlvbih0LGUscixpKXt0aGlzLmlzKHQsXCJvYmplY3RcIikmJlwiaFwiaW4gdCYmXCJzXCJpbiB0JiZcImJcImluIHQmJihyPXQuYixlPXQucyxpPXQubyx0PXQuaCksdCo9MzYwO3ZhciBuLGEscyxvLGw7cmV0dXJuIHQ9dCUzNjAvNjAsbD1yKmUsbz1sKigxLUgodCUyLTEpKSxuPWE9cz1yLWwsdD1+fnQsbis9W2wsbywwLDAsbyxsXVt0XSxhKz1bbyxsLGwsbywwLDBdW3RdLHMrPVswLDAsbyxsLGwsb11bdF0scXQobixhLHMsaSl9LGUuaHNsMnJnYj1mdW5jdGlvbih0LGUscixpKXt0aGlzLmlzKHQsXCJvYmplY3RcIikmJlwiaFwiaW4gdCYmXCJzXCJpbiB0JiZcImxcImluIHQmJihyPXQubCxlPXQucyx0PXQuaCksKHQ+MXx8ZT4xfHxyPjEpJiYodC89MzYwLGUvPTEwMCxyLz0xMDApLHQqPTM2MDt2YXIgbixhLHMsbyxsO3JldHVybiB0PXQlMzYwLzYwLGw9MiplKihyPC41P3I6MS1yKSxvPWwqKDEtSCh0JTItMSkpLG49YT1zPXItbC8yLHQ9fn50LG4rPVtsLG8sMCwwLG8sbF1bdF0sYSs9W28sbCxsLG8sMCwwXVt0XSxzKz1bMCwwLG8sbCxsLG9dW3RdLHF0KG4sYSxzLGkpfSxlLnJnYjJoc2I9ZnVuY3Rpb24odCxlLHIpe3I9SXQodCxlLHIpLHQ9clswXSxlPXJbMV0scj1yWzJdO3ZhciBpLG4sYSxzO3JldHVybiBhPVcodCxlLHIpLHM9YS1HKHQsZSxyKSxpPTA9PXM/bnVsbDphPT10PyhlLXIpL3M6YT09ZT8oci10KS9zKzI6KHQtZSkvcys0LGk9KGkrMzYwKSU2KjYwLzM2MCxuPTA9PXM/MDpzL2Ese2g6aSxzOm4sYjphLHRvU3RyaW5nOkZ0fX0sZS5yZ2IyaHNsPWZ1bmN0aW9uKHQsZSxyKXtyPUl0KHQsZSxyKSx0PXJbMF0sZT1yWzFdLHI9clsyXTt2YXIgaSxuLGEscyxvLGw7cmV0dXJuIHM9Vyh0LGUsciksbz1HKHQsZSxyKSxsPXMtbyxpPTA9PWw/bnVsbDpzPT10PyhlLXIpL2w6cz09ZT8oci10KS9sKzI6KHQtZSkvbCs0LGk9KGkrMzYwKSU2KjYwLzM2MCxhPShzK28pLzIsbj0wPT1sPzA6YTwuNT9sLygyKmEpOmwvKDItMiphKSx7aDppLHM6bixsOmEsdG9TdHJpbmc6UnR9fSxlLl9wYXRoMnN0cmluZz1mdW5jdGlvbigpe3JldHVybiB0aGlzLmpvaW4oXCIsXCIpLnJlcGxhY2UoeHQsXCIkMVwiKX07dmFyIER0PWUuX3ByZWxvYWQ9ZnVuY3Rpb24odCxlKXt2YXIgcj1ULmRvYy5jcmVhdGVFbGVtZW50KFwiaW1nXCIpO3Iuc3R5bGUuY3NzVGV4dD1cInBvc2l0aW9uOmFic29sdXRlO2xlZnQ6LTk5OTllbTt0b3A6LTk5OTllbVwiLHIub25sb2FkPWZ1bmN0aW9uKCl7ZS5jYWxsKHRoaXMpLHRoaXMub25sb2FkPW51bGwsVC5kb2MuYm9keS5yZW1vdmVDaGlsZCh0aGlzKX0sci5vbmVycm9yPWZ1bmN0aW9uKCl7VC5kb2MuYm9keS5yZW1vdmVDaGlsZCh0aGlzKX0sVC5kb2MuYm9keS5hcHBlbmRDaGlsZChyKSxyLnNyYz10fTtlLmdldFJHQj1uKGZ1bmN0aW9uKHQpe2lmKCF0fHwodD1JKHQpKS5pbmRleE9mKFwiLVwiKSsxKXJldHVybntyOi0xLGc6LTEsYjotMSxoZXg6XCJub25lXCIsZXJyb3I6MSx0b1N0cmluZzphfTtpZihcIm5vbmVcIj09dClyZXR1cm57cjotMSxnOi0xLGI6LTEsaGV4Olwibm9uZVwiLHRvU3RyaW5nOmF9OyEodnRbQV0odC50b0xvd2VyQ2FzZSgpLnN1YnN0cmluZygwLDIpKXx8XCIjXCI9PXQuY2hhckF0KCkpJiYodD1QdCh0KSk7dmFyIHIsaSxuLHMsbyxsLGgsdT10Lm1hdGNoKG50KTtyZXR1cm4gdT8odVsyXSYmKHM9dXQodVsyXS5zdWJzdHJpbmcoNSksMTYpLG49dXQodVsyXS5zdWJzdHJpbmcoMyw1KSwxNiksaT11dCh1WzJdLnN1YnN0cmluZygxLDMpLDE2KSksdVszXSYmKHM9dXQoKGw9dVszXS5jaGFyQXQoMykpK2wsMTYpLG49dXQoKGw9dVszXS5jaGFyQXQoMikpK2wsMTYpLGk9dXQoKGw9dVszXS5jaGFyQXQoMSkpK2wsMTYpKSx1WzRdJiYoaD11WzRdW3FdKGd0KSxpPWh0KGhbMF0pLFwiJVwiPT1oWzBdLnNsaWNlKC0xKSYmKGkqPTIuNTUpLG49aHQoaFsxXSksXCIlXCI9PWhbMV0uc2xpY2UoLTEpJiYobio9Mi41NSkscz1odChoWzJdKSxcIiVcIj09aFsyXS5zbGljZSgtMSkmJihzKj0yLjU1KSxcInJnYmFcIj09dVsxXS50b0xvd2VyQ2FzZSgpLnNsaWNlKDAsNCkmJihvPWh0KGhbM10pKSxoWzNdJiZcIiVcIj09aFszXS5zbGljZSgtMSkmJihvLz0xMDApKSx1WzVdPyhoPXVbNV1bcV0oZ3QpLGk9aHQoaFswXSksXCIlXCI9PWhbMF0uc2xpY2UoLTEpJiYoaSo9Mi41NSksbj1odChoWzFdKSxcIiVcIj09aFsxXS5zbGljZSgtMSkmJihuKj0yLjU1KSxzPWh0KGhbMl0pLFwiJVwiPT1oWzJdLnNsaWNlKC0xKSYmKHMqPTIuNTUpLChcImRlZ1wiPT1oWzBdLnNsaWNlKC0zKXx8XCLCsFwiPT1oWzBdLnNsaWNlKC0xKSkmJihpLz0zNjApLFwiaHNiYVwiPT11WzFdLnRvTG93ZXJDYXNlKCkuc2xpY2UoMCw0KSYmKG89aHQoaFszXSkpLGhbM10mJlwiJVwiPT1oWzNdLnNsaWNlKC0xKSYmKG8vPTEwMCksZS5oc2IycmdiKGksbixzLG8pKTp1WzZdPyhoPXVbNl1bcV0oZ3QpLGk9aHQoaFswXSksXCIlXCI9PWhbMF0uc2xpY2UoLTEpJiYoaSo9Mi41NSksbj1odChoWzFdKSxcIiVcIj09aFsxXS5zbGljZSgtMSkmJihuKj0yLjU1KSxzPWh0KGhbMl0pLFwiJVwiPT1oWzJdLnNsaWNlKC0xKSYmKHMqPTIuNTUpLChcImRlZ1wiPT1oWzBdLnNsaWNlKC0zKXx8XCLCsFwiPT1oWzBdLnNsaWNlKC0xKSkmJihpLz0zNjApLFwiaHNsYVwiPT11WzFdLnRvTG93ZXJDYXNlKCkuc2xpY2UoMCw0KSYmKG89aHQoaFszXSkpLGhbM10mJlwiJVwiPT1oWzNdLnNsaWNlKC0xKSYmKG8vPTEwMCksZS5oc2wycmdiKGksbixzLG8pKToodT17cjppLGc6bixiOnMsdG9TdHJpbmc6YX0sdS5oZXg9XCIjXCIrKDE2Nzc3MjE2fHN8bjw8OHxpPDwxNikudG9TdHJpbmcoMTYpLnNsaWNlKDEpLGUuaXMobyxcImZpbml0ZVwiKSYmKHUub3BhY2l0eT1vKSx1KSk6e3I6LTEsZzotMSxiOi0xLGhleDpcIm5vbmVcIixlcnJvcjoxLHRvU3RyaW5nOmF9fSxlKSxlLmhzYj1uKGZ1bmN0aW9uKHQscixpKXtyZXR1cm4gZS5oc2IycmdiKHQscixpKS5oZXh9KSxlLmhzbD1uKGZ1bmN0aW9uKHQscixpKXtyZXR1cm4gZS5oc2wycmdiKHQscixpKS5oZXh9KSxlLnJnYj1uKGZ1bmN0aW9uKHQsZSxyKXtmdW5jdGlvbiBpKHQpe3JldHVybiB0Ky41fDB9cmV0dXJuXCIjXCIrKDE2Nzc3MjE2fGkocil8aShlKTw8OHxpKHQpPDwxNikudG9TdHJpbmcoMTYpLnNsaWNlKDEpfSksZS5nZXRDb2xvcj1mdW5jdGlvbih0KXt2YXIgZT10aGlzLmdldENvbG9yLnN0YXJ0PXRoaXMuZ2V0Q29sb3Iuc3RhcnR8fHtoOjAsczoxLGI6dHx8Ljc1fSxyPXRoaXMuaHNiMnJnYihlLmgsZS5zLGUuYik7cmV0dXJuIGUuaCs9LjA3NSxlLmg+MSYmKGUuaD0wLGUucy09LjIsZS5zPD0wJiYodGhpcy5nZXRDb2xvci5zdGFydD17aDowLHM6MSxiOmUuYn0pKSxyLmhleH0sZS5nZXRDb2xvci5yZXNldD1mdW5jdGlvbigpe2RlbGV0ZSB0aGlzLnN0YXJ0fSxlLnBhcnNlUGF0aFN0cmluZz1mdW5jdGlvbih0KXtpZighdClyZXR1cm4gbnVsbDt2YXIgcj1WdCh0KTtpZihyLmFycilyZXR1cm4gWXQoci5hcnIpO3ZhciBpPXthOjcsYzo2LGg6MSxsOjIsbToyLHI6NCxxOjQsczo0LHQ6Mix2OjEsejowfSxuPVtdO3JldHVybiBlLmlzKHQsUSkmJmUuaXModFswXSxRKSYmKG49WXQodCkpLG4ubGVuZ3RofHxJKHQpLnJlcGxhY2UoeXQsZnVuY3Rpb24odCxlLHIpe3ZhciBhPVtdLHM9ZS50b0xvd2VyQ2FzZSgpO2lmKHIucmVwbGFjZShidCxmdW5jdGlvbih0LGUpe2UmJmEucHVzaCgrZSl9KSxcIm1cIj09cyYmYS5sZW5ndGg+MiYmKG4ucHVzaChbZV1bUF0oYS5zcGxpY2UoMCwyKSkpLHM9XCJsXCIsZT1cIm1cIj09ZT9cImxcIjpcIkxcIiksXCJyXCI9PXMpbi5wdXNoKFtlXVtQXShhKSk7ZWxzZSBmb3IoO2EubGVuZ3RoPj1pW3NdJiYobi5wdXNoKFtlXVtQXShhLnNwbGljZSgwLGlbc10pKSksaVtzXSk7KTt9KSxuLnRvU3RyaW5nPWUuX3BhdGgyc3RyaW5nLHIuYXJyPVl0KG4pLG59LGUucGFyc2VUcmFuc2Zvcm1TdHJpbmc9bihmdW5jdGlvbih0KXtpZighdClyZXR1cm4gbnVsbDt2YXIgcj17cjozLHM6NCx0OjIsbTo2fSxpPVtdO3JldHVybiBlLmlzKHQsUSkmJmUuaXModFswXSxRKSYmKGk9WXQodCkpLGkubGVuZ3RofHxJKHQpLnJlcGxhY2UobXQsZnVuY3Rpb24odCxlLHIpe3ZhciBuPVtdLGE9Ty5jYWxsKGUpO3IucmVwbGFjZShidCxmdW5jdGlvbih0LGUpe2UmJm4ucHVzaCgrZSl9KSxpLnB1c2goW2VdW1BdKG4pKX0pLGkudG9TdHJpbmc9ZS5fcGF0aDJzdHJpbmcsaX0pO3ZhciBWdD1mdW5jdGlvbih0KXt2YXIgZT1WdC5wcz1WdC5wc3x8e307cmV0dXJuIGVbdF0/ZVt0XS5zbGVlcD0xMDA6ZVt0XT17c2xlZXA6MTAwfSxzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7Zm9yKHZhciByIGluIGUpZVtBXShyKSYmciE9dCYmKGVbcl0uc2xlZXAtLSwhZVtyXS5zbGVlcCYmZGVsZXRlIGVbcl0pfSksZVt0XX07ZS5maW5kRG90c0F0U2VnbWVudD1mdW5jdGlvbih0LGUscixpLG4sYSxzLG8sbCl7dmFyIGg9MS1sLHU9WChoLDMpLGM9WChoLDIpLGY9bCpsLHA9ZipsLGQ9dSp0KzMqYypsKnIrMypoKmwqbCpuK3AqcyxnPXUqZSszKmMqbCppKzMqaCpsKmwqYStwKm8sdj10KzIqbCooci10KStmKihuLTIqcit0KSx4PWUrMipsKihpLWUpK2YqKGEtMippK2UpLHk9cisyKmwqKG4tcikrZioocy0yKm4rciksbT1pKzIqbCooYS1pKStmKihvLTIqYStpKSxiPWgqdCtsKnIsXz1oKmUrbCppLHc9aCpuK2wqcyxrPWgqYStsKm8sQj05MC0xODAqWS5hdGFuMih2LXkseC1tKS9VO3JldHVybih2Pnl8fHg8bSkmJihCKz0xODApLHt4OmQseTpnLG06e3g6dix5Onh9LG46e3g6eSx5Om19LHN0YXJ0Ont4OmIseTpffSxlbmQ6e3g6dyx5Omt9LGFscGhhOkJ9fSxlLmJlemllckJCb3g9ZnVuY3Rpb24odCxyLGksbixhLHMsbyxsKXtlLmlzKHQsXCJhcnJheVwiKXx8KHQ9W3QscixpLG4sYSxzLG8sbF0pO3ZhciBoPVp0LmFwcGx5KG51bGwsdCk7cmV0dXJue3g6aC5taW4ueCx5OmgubWluLnkseDI6aC5tYXgueCx5MjpoLm1heC55LHdpZHRoOmgubWF4LngtaC5taW4ueCxoZWlnaHQ6aC5tYXgueS1oLm1pbi55fX0sZS5pc1BvaW50SW5zaWRlQkJveD1mdW5jdGlvbih0LGUscil7cmV0dXJuIGU+PXQueCYmZTw9dC54MiYmcj49dC55JiZyPD10LnkyfSxlLmlzQkJveEludGVyc2VjdD1mdW5jdGlvbih0LHIpe3ZhciBpPWUuaXNQb2ludEluc2lkZUJCb3g7cmV0dXJuIGkocix0LngsdC55KXx8aShyLHQueDIsdC55KXx8aShyLHQueCx0LnkyKXx8aShyLHQueDIsdC55Mil8fGkodCxyLngsci55KXx8aSh0LHIueDIsci55KXx8aSh0LHIueCxyLnkyKXx8aSh0LHIueDIsci55Mil8fCh0Lng8ci54MiYmdC54PnIueHx8ci54PHQueDImJnIueD50LngpJiYodC55PHIueTImJnQueT5yLnl8fHIueTx0LnkyJiZyLnk+dC55KX0sZS5wYXRoSW50ZXJzZWN0aW9uPWZ1bmN0aW9uKHQsZSl7cmV0dXJuIGQodCxlKX0sZS5wYXRoSW50ZXJzZWN0aW9uTnVtYmVyPWZ1bmN0aW9uKHQsZSl7cmV0dXJuIGQodCxlLDEpfSxlLmlzUG9pbnRJbnNpZGVQYXRoPWZ1bmN0aW9uKHQscixpKXt2YXIgbj1lLnBhdGhCQm94KHQpO3JldHVybiBlLmlzUG9pbnRJbnNpZGVCQm94KG4scixpKSYmZCh0LFtbXCJNXCIscixpXSxbXCJIXCIsbi54MisxMF1dLDEpJTI9PTF9LGUuX3JlbW92ZWRGYWN0b3J5PWZ1bmN0aW9uKGUpe3JldHVybiBmdW5jdGlvbigpe3QoXCJyYXBoYWVsLmxvZ1wiLG51bGwsXCJSYXBoYcOrbDogeW91IGFyZSBjYWxsaW5nIHRvIG1ldGhvZCDigJxcIitlK1wi4oCdIG9mIHJlbW92ZWQgb2JqZWN0XCIsZSl9fTt2YXIgT3Q9ZS5wYXRoQkJveD1mdW5jdGlvbih0KXt2YXIgZT1WdCh0KTtpZihlLmJib3gpcmV0dXJuIHIoZS5iYm94KTtpZighdClyZXR1cm57eDowLHk6MCx3aWR0aDowLGhlaWdodDowLHgyOjAseTI6MH07dD1RdCh0KTtmb3IodmFyIGk9MCxuPTAsYT1bXSxzPVtdLG8sbD0wLGg9dC5sZW5ndGg7bDxoO2wrKylpZihvPXRbbF0sXCJNXCI9PW9bMF0paT1vWzFdLG49b1syXSxhLnB1c2goaSkscy5wdXNoKG4pO2Vsc2V7dmFyIHU9WnQoaSxuLG9bMV0sb1syXSxvWzNdLG9bNF0sb1s1XSxvWzZdKTthPWFbUF0odS5taW4ueCx1Lm1heC54KSxzPXNbUF0odS5taW4ueSx1Lm1heC55KSxpPW9bNV0sbj1vWzZdfXZhciBjPUdbel0oMCxhKSxmPUdbel0oMCxzKSxwPVdbel0oMCxhKSxkPVdbel0oMCxzKSxnPXAtYyx2PWQtZix4PXt4OmMseTpmLHgyOnAseTI6ZCx3aWR0aDpnLGhlaWdodDp2LGN4OmMrZy8yLGN5OmYrdi8yfTtyZXR1cm4gZS5iYm94PXIoeCkseH0sWXQ9ZnVuY3Rpb24odCl7dmFyIGk9cih0KTtyZXR1cm4gaS50b1N0cmluZz1lLl9wYXRoMnN0cmluZyxpfSxXdD1lLl9wYXRoVG9SZWxhdGl2ZT1mdW5jdGlvbih0KXt2YXIgcj1WdCh0KTtpZihyLnJlbClyZXR1cm4gWXQoci5yZWwpO2UuaXModCxRKSYmZS5pcyh0JiZ0WzBdLFEpfHwodD1lLnBhcnNlUGF0aFN0cmluZyh0KSk7dmFyIGk9W10sbj0wLGE9MCxzPTAsbz0wLGw9MDtcIk1cIj09dFswXVswXSYmKG49dFswXVsxXSxhPXRbMF1bMl0scz1uLG89YSxsKyssaS5wdXNoKFtcIk1cIixuLGFdKSk7Zm9yKHZhciBoPWwsdT10Lmxlbmd0aDtoPHU7aCsrKXt2YXIgYz1pW2hdPVtdLGY9dFtoXTtpZihmWzBdIT1PLmNhbGwoZlswXSkpc3dpdGNoKGNbMF09Ty5jYWxsKGZbMF0pLGNbMF0pe2Nhc2VcImFcIjpjWzFdPWZbMV0sY1syXT1mWzJdLGNbM109ZlszXSxjWzRdPWZbNF0sY1s1XT1mWzVdLGNbNl09KyhmWzZdLW4pLnRvRml4ZWQoMyksY1s3XT0rKGZbN10tYSkudG9GaXhlZCgzKTticmVhaztjYXNlXCJ2XCI6Y1sxXT0rKGZbMV0tYSkudG9GaXhlZCgzKTticmVhaztjYXNlXCJtXCI6cz1mWzFdLG89ZlsyXTtkZWZhdWx0OmZvcih2YXIgcD0xLGQ9Zi5sZW5ndGg7cDxkO3ArKyljW3BdPSsoZltwXS0ocCUyP246YSkpLnRvRml4ZWQoMyl9ZWxzZXtjPWlbaF09W10sXCJtXCI9PWZbMF0mJihzPWZbMV0rbixvPWZbMl0rYSk7Zm9yKHZhciBnPTAsdj1mLmxlbmd0aDtnPHY7ZysrKWlbaF1bZ109ZltnXX12YXIgeD1pW2hdLmxlbmd0aDtzd2l0Y2goaVtoXVswXSl7Y2FzZVwielwiOm49cyxhPW87YnJlYWs7Y2FzZVwiaFwiOm4rPStpW2hdW3gtMV07YnJlYWs7Y2FzZVwidlwiOmErPStpW2hdW3gtMV07YnJlYWs7ZGVmYXVsdDpuKz0raVtoXVt4LTJdLGErPStpW2hdW3gtMV19fXJldHVybiBpLnRvU3RyaW5nPWUuX3BhdGgyc3RyaW5nLHIucmVsPVl0KGkpLGl9LEd0PWUuX3BhdGhUb0Fic29sdXRlPWZ1bmN0aW9uKHQpe3ZhciByPVZ0KHQpO2lmKHIuYWJzKXJldHVybiBZdChyLmFicyk7aWYoZS5pcyh0LFEpJiZlLmlzKHQmJnRbMF0sUSl8fCh0PWUucGFyc2VQYXRoU3RyaW5nKHQpKSwhdHx8IXQubGVuZ3RoKXJldHVybltbXCJNXCIsMCwwXV07dmFyIGk9W10sbj0wLGE9MCxvPTAsbD0wLGg9MDtcIk1cIj09dFswXVswXSYmKG49K3RbMF1bMV0sYT0rdFswXVsyXSxvPW4sbD1hLGgrKyxpWzBdPVtcIk1cIixuLGFdKTtmb3IodmFyIHU9Mz09dC5sZW5ndGgmJlwiTVwiPT10WzBdWzBdJiZcIlJcIj09dFsxXVswXS50b1VwcGVyQ2FzZSgpJiZcIlpcIj09dFsyXVswXS50b1VwcGVyQ2FzZSgpLGMsZixwPWgsZD10Lmxlbmd0aDtwPGQ7cCsrKXtpZihpLnB1c2goYz1bXSksZj10W3BdLGZbMF0hPWN0LmNhbGwoZlswXSkpc3dpdGNoKGNbMF09Y3QuY2FsbChmWzBdKSxjWzBdKXtjYXNlXCJBXCI6Y1sxXT1mWzFdLGNbMl09ZlsyXSxjWzNdPWZbM10sY1s0XT1mWzRdLGNbNV09Zls1XSxjWzZdPSsoZls2XStuKSxjWzddPSsoZls3XSthKTticmVhaztjYXNlXCJWXCI6Y1sxXT0rZlsxXSthO2JyZWFrO2Nhc2VcIkhcIjpjWzFdPStmWzFdK247YnJlYWs7Y2FzZVwiUlwiOmZvcih2YXIgZz1bbixhXVtQXShmLnNsaWNlKDEpKSx2PTIseD1nLmxlbmd0aDt2PHg7disrKWdbdl09K2dbdl0rbixnWysrdl09K2dbdl0rYTtpLnBvcCgpLGk9aVtQXShzKGcsdSkpO2JyZWFrO2Nhc2VcIk1cIjpvPStmWzFdK24sbD0rZlsyXSthO2RlZmF1bHQ6Zm9yKHY9MSx4PWYubGVuZ3RoO3Y8eDt2KyspY1t2XT0rZlt2XSsodiUyP246YSl9ZWxzZSBpZihcIlJcIj09ZlswXSlnPVtuLGFdW1BdKGYuc2xpY2UoMSkpLGkucG9wKCksaT1pW1BdKHMoZyx1KSksYz1bXCJSXCJdW1BdKGYuc2xpY2UoLTIpKTtlbHNlIGZvcih2YXIgeT0wLG09Zi5sZW5ndGg7eTxtO3krKyljW3ldPWZbeV07c3dpdGNoKGNbMF0pe2Nhc2VcIlpcIjpuPW8sYT1sO2JyZWFrO2Nhc2VcIkhcIjpuPWNbMV07YnJlYWs7Y2FzZVwiVlwiOmE9Y1sxXTticmVhaztjYXNlXCJNXCI6bz1jW2MubGVuZ3RoLTJdLGw9Y1tjLmxlbmd0aC0xXTtkZWZhdWx0Om49Y1tjLmxlbmd0aC0yXSxhPWNbYy5sZW5ndGgtMV19fXJldHVybiBpLnRvU3RyaW5nPWUuX3BhdGgyc3RyaW5nLHIuYWJzPVl0KGkpLGl9LEh0PWZ1bmN0aW9uKHQsZSxyLGkpe3JldHVyblt0LGUscixpLHIsaV19LFh0PWZ1bmN0aW9uKHQsZSxyLGksbixhKXt2YXIgcz0xLzMsbz0yLzM7cmV0dXJuW3MqdCtvKnIscyplK28qaSxzKm4rbypyLHMqYStvKmksbixhXX0sVXQ9ZnVuY3Rpb24odCxlLHIsaSxhLHMsbyxsLGgsdSl7dmFyIGM9MTIwKlUvMTgwLGY9VS8xODAqKCthfHwwKSxwPVtdLGQsZz1uKGZ1bmN0aW9uKHQsZSxyKXt2YXIgaT10KlkuY29zKHIpLWUqWS5zaW4ociksbj10Klkuc2luKHIpK2UqWS5jb3Mocik7cmV0dXJue3g6aSx5Om59fSk7aWYodSlTPXVbMF0sQT11WzFdLEI9dVsyXSxDPXVbM107ZWxzZXtkPWcodCxlLC1mKSx0PWQueCxlPWQueSxkPWcobCxoLC1mKSxsPWQueCxoPWQueTt2YXIgdj1ZLmNvcyhVLzE4MCphKSx4PVkuc2luKFUvMTgwKmEpLHk9KHQtbCkvMixtPShlLWgpLzIsYj15KnkvKHIqcikrbSptLyhpKmkpO2I+MSYmKGI9WS5zcXJ0KGIpLHI9YipyLGk9YippKTt2YXIgXz1yKnIsdz1pKmksaz0ocz09bz8tMToxKSpZLnNxcnQoSCgoXyp3LV8qbSptLXcqeSp5KS8oXyptKm0rdyp5KnkpKSksQj1rKnIqbS9pKyh0K2wpLzIsQz1rKi1pKnkvcisoZStoKS8yLFM9WS5hc2luKCgoZS1DKS9pKS50b0ZpeGVkKDkpKSxBPVkuYXNpbigoKGgtQykvaSkudG9GaXhlZCg5KSk7Uz10PEI/VS1TOlMsQT1sPEI/VS1BOkEsUzwwJiYoUz0yKlUrUyksQTwwJiYoQT0yKlUrQSksbyYmUz5BJiYoUy09MipVKSwhbyYmQT5TJiYoQS09MipVKX12YXIgVD1BLVM7aWYoSChUKT5jKXt2YXIgRT1BLE09bCxOPWg7QT1TK2MqKG8mJkE+Uz8xOi0xKSxsPUIrcipZLmNvcyhBKSxoPUMraSpZLnNpbihBKSxwPVV0KGwsaCxyLGksYSwwLG8sTSxOLFtBLEUsQixDXSl9VD1BLVM7dmFyIEw9WS5jb3MoUyksej1ZLnNpbihTKSxGPVkuY29zKEEpLFI9WS5zaW4oQSksaj1ZLnRhbihULzQpLEk9NC8zKnIqaixEPTQvMyppKmosVj1bdCxlXSxPPVt0K0kqeixlLUQqTF0sVz1bbCtJKlIsaC1EKkZdLEc9W2wsaF07aWYoT1swXT0yKlZbMF0tT1swXSxPWzFdPTIqVlsxXS1PWzFdLHUpcmV0dXJuW08sVyxHXVtQXShwKTtwPVtPLFcsR11bUF0ocCkuam9pbigpW3FdKFwiLFwiKTtmb3IodmFyIFg9W10sJD0wLFo9cC5sZW5ndGg7JDxaOyQrKylYWyRdPSQlMj9nKHBbJC0xXSxwWyRdLGYpLnk6ZyhwWyRdLHBbJCsxXSxmKS54O3JldHVybiBYfSwkdD1mdW5jdGlvbih0LGUscixpLG4sYSxzLG8sbCl7dmFyIGg9MS1sO3JldHVybnt4OlgoaCwzKSp0KzMqWChoLDIpKmwqciszKmgqbCpsKm4rWChsLDMpKnMseTpYKGgsMykqZSszKlgoaCwyKSpsKmkrMypoKmwqbCphK1gobCwzKSpvfX0sWnQ9bihmdW5jdGlvbih0LGUscixpLG4sYSxzLG8pe3ZhciBsPW4tMipyK3QtKHMtMipuK3IpLGg9Miooci10KS0yKihuLXIpLHU9dC1yLGM9KC1oK1kuc3FydChoKmgtNCpsKnUpKS8yL2wsZj0oLWgtWS5zcXJ0KGgqaC00KmwqdSkpLzIvbCxwPVtlLG9dLGQ9W3Qsc10sZztyZXR1cm4gSChjKT5cIjFlMTJcIiYmKGM9LjUpLEgoZik+XCIxZTEyXCImJihmPS41KSxjPjAmJmM8MSYmKGc9JHQodCxlLHIsaSxuLGEscyxvLGMpLGQucHVzaChnLngpLHAucHVzaChnLnkpKSxmPjAmJmY8MSYmKGc9JHQodCxlLHIsaSxuLGEscyxvLGYpLGQucHVzaChnLngpLHAucHVzaChnLnkpKSxsPWEtMippK2UtKG8tMiphK2kpLGg9MiooaS1lKS0yKihhLWkpLHU9ZS1pLGM9KC1oK1kuc3FydChoKmgtNCpsKnUpKS8yL2wsZj0oLWgtWS5zcXJ0KGgqaC00KmwqdSkpLzIvbCxIKGMpPlwiMWUxMlwiJiYoYz0uNSksSChmKT5cIjFlMTJcIiYmKGY9LjUpLGM+MCYmYzwxJiYoZz0kdCh0LGUscixpLG4sYSxzLG8sYyksZC5wdXNoKGcueCkscC5wdXNoKGcueSkpLGY+MCYmZjwxJiYoZz0kdCh0LGUscixpLG4sYSxzLG8sZiksZC5wdXNoKGcueCkscC5wdXNoKGcueSkpLHttaW46e3g6R1t6XSgwLGQpLHk6R1t6XSgwLHApfSxtYXg6e3g6V1t6XSgwLGQpLHk6V1t6XSgwLHApfX19KSxRdD1lLl9wYXRoMmN1cnZlPW4oZnVuY3Rpb24odCxlKXt2YXIgcj0hZSYmVnQodCk7aWYoIWUmJnIuY3VydmUpcmV0dXJuIFl0KHIuY3VydmUpO2Zvcih2YXIgaT1HdCh0KSxuPWUmJkd0KGUpLGE9e3g6MCx5OjAsYng6MCxieTowLFg6MCxZOjAscXg6bnVsbCxxeTpudWxsfSxzPXt4OjAseTowLGJ4OjAsYnk6MCxYOjAsWTowLHF4Om51bGwscXk6bnVsbH0sbz0oZnVuY3Rpb24odCxlLHIpe3ZhciBpLG4sYT17VDoxLFE6MX07aWYoIXQpcmV0dXJuW1wiQ1wiLGUueCxlLnksZS54LGUueSxlLngsZS55XTtzd2l0Y2goISh0WzBdaW4gYSkmJihlLnF4PWUucXk9bnVsbCksdFswXSl7Y2FzZVwiTVwiOmUuWD10WzFdLGUuWT10WzJdO2JyZWFrO2Nhc2VcIkFcIjp0PVtcIkNcIl1bUF0oVXRbel0oMCxbZS54LGUueV1bUF0odC5zbGljZSgxKSkpKTticmVhaztjYXNlXCJTXCI6XCJDXCI9PXJ8fFwiU1wiPT1yPyhpPTIqZS54LWUuYngsbj0yKmUueS1lLmJ5KTooaT1lLngsbj1lLnkpLHQ9W1wiQ1wiLGksbl1bUF0odC5zbGljZSgxKSk7YnJlYWs7Y2FzZVwiVFwiOlwiUVwiPT1yfHxcIlRcIj09cj8oZS5xeD0yKmUueC1lLnF4LGUucXk9MiplLnktZS5xeSk6KGUucXg9ZS54LGUucXk9ZS55KSx0PVtcIkNcIl1bUF0oWHQoZS54LGUueSxlLnF4LGUucXksdFsxXSx0WzJdKSk7YnJlYWs7Y2FzZVwiUVwiOmUucXg9dFsxXSxlLnF5PXRbMl0sdD1bXCJDXCJdW1BdKFh0KGUueCxlLnksdFsxXSx0WzJdLHRbM10sdFs0XSkpO2JyZWFrO2Nhc2VcIkxcIjp0PVtcIkNcIl1bUF0oSHQoZS54LGUueSx0WzFdLHRbMl0pKTticmVhaztjYXNlXCJIXCI6dD1bXCJDXCJdW1BdKEh0KGUueCxlLnksdFsxXSxlLnkpKTticmVhaztjYXNlXCJWXCI6dD1bXCJDXCJdW1BdKEh0KGUueCxlLnksZS54LHRbMV0pKTticmVhaztjYXNlXCJaXCI6dD1bXCJDXCJdW1BdKEh0KGUueCxlLnksZS5YLGUuWSkpfXJldHVybiB0fSksbD1mdW5jdGlvbih0LGUpe2lmKHRbZV0ubGVuZ3RoPjcpe3RbZV0uc2hpZnQoKTtmb3IodmFyIHI9dFtlXTtyLmxlbmd0aDspdVtlXT1cIkFcIixuJiYoY1tlXT1cIkFcIiksdC5zcGxpY2UoZSsrLDAsW1wiQ1wiXVtQXShyLnNwbGljZSgwLDYpKSk7dC5zcGxpY2UoZSwxKSxnPVcoaS5sZW5ndGgsbiYmbi5sZW5ndGh8fDApfX0saD1mdW5jdGlvbih0LGUscixhLHMpe3QmJmUmJlwiTVwiPT10W3NdWzBdJiZcIk1cIiE9ZVtzXVswXSYmKGUuc3BsaWNlKHMsMCxbXCJNXCIsYS54LGEueV0pLHIuYng9MCxyLmJ5PTAsci54PXRbc11bMV0sci55PXRbc11bMl0sZz1XKGkubGVuZ3RoLG4mJm4ubGVuZ3RofHwwKSl9LHU9W10sYz1bXSxmPVwiXCIscD1cIlwiLGQ9MCxnPVcoaS5sZW5ndGgsbiYmbi5sZW5ndGh8fDApO2Q8ZztkKyspe2lbZF0mJihmPWlbZF1bMF0pLFwiQ1wiIT1mJiYodVtkXT1mLGQmJihwPXVbZC0xXSkpLGlbZF09byhpW2RdLGEscCksXCJBXCIhPXVbZF0mJlwiQ1wiPT1mJiYodVtkXT1cIkNcIiksbChpLGQpLG4mJihuW2RdJiYoZj1uW2RdWzBdKSxcIkNcIiE9ZiYmKGNbZF09ZixkJiYocD1jW2QtMV0pKSxuW2RdPW8obltkXSxzLHApLFwiQVwiIT1jW2RdJiZcIkNcIj09ZiYmKGNbZF09XCJDXCIpLGwobixkKSksaChpLG4sYSxzLGQpLGgobixpLHMsYSxkKTt2YXIgdj1pW2RdLHg9biYmbltkXSx5PXYubGVuZ3RoLG09biYmeC5sZW5ndGg7YS54PXZbeS0yXSxhLnk9dlt5LTFdLGEuYng9aHQodlt5LTRdKXx8YS54LGEuYnk9aHQodlt5LTNdKXx8YS55LHMuYng9biYmKGh0KHhbbS00XSl8fHMueCkscy5ieT1uJiYoaHQoeFttLTNdKXx8cy55KSxzLng9biYmeFttLTJdLHMueT1uJiZ4W20tMV19cmV0dXJuIG58fChyLmN1cnZlPVl0KGkpKSxuP1tpLG5dOml9LG51bGwsWXQpLEp0PWUuX3BhcnNlRG90cz1uKGZ1bmN0aW9uKHQpe2Zvcih2YXIgcj1bXSxpPTAsbj10Lmxlbmd0aDtpPG47aSsrKXt2YXIgYT17fSxzPXRbaV0ubWF0Y2goL14oW146XSopOj8oW1xcZFxcLl0qKS8pO2lmKGEuY29sb3I9ZS5nZXRSR0Ioc1sxXSksYS5jb2xvci5lcnJvcilyZXR1cm4gbnVsbDthLm9wYWNpdHk9YS5jb2xvci5vcGFjaXR5LGEuY29sb3I9YS5jb2xvci5oZXgsc1syXSYmKGEub2Zmc2V0PXNbMl0rXCIlXCIpLHIucHVzaChhKX1mb3IoaT0xLG49ci5sZW5ndGgtMTtpPG47aSsrKWlmKCFyW2ldLm9mZnNldCl7Zm9yKHZhciBvPWh0KHJbaS0xXS5vZmZzZXR8fDApLGw9MCxoPWkrMTtoPG47aCsrKWlmKHJbaF0ub2Zmc2V0KXtsPXJbaF0ub2Zmc2V0O2JyZWFrfWx8fChsPTEwMCxoPW4pLGw9aHQobCk7Zm9yKHZhciB1PShsLW8pLyhoLWkrMSk7aTxoO2krKylvKz11LHJbaV0ub2Zmc2V0PW8rXCIlXCJ9cmV0dXJuIHJ9KSxLdD1lLl90ZWFyPWZ1bmN0aW9uKHQsZSl7dD09ZS50b3AmJihlLnRvcD10LnByZXYpLHQ9PWUuYm90dG9tJiYoZS5ib3R0b209dC5uZXh0KSx0Lm5leHQmJih0Lm5leHQucHJldj10LnByZXYpLHQucHJldiYmKHQucHJldi5uZXh0PXQubmV4dCl9LHRlPWUuX3RvZnJvbnQ9ZnVuY3Rpb24odCxlKXtlLnRvcCE9PXQmJihLdCh0LGUpLHQubmV4dD1udWxsLHQucHJldj1lLnRvcCxlLnRvcC5uZXh0PXQsZS50b3A9dCl9LGVlPWUuX3RvYmFjaz1mdW5jdGlvbih0LGUpe2UuYm90dG9tIT09dCYmKEt0KHQsZSksdC5uZXh0PWUuYm90dG9tLHQucHJldj1udWxsLGUuYm90dG9tLnByZXY9dCxlLmJvdHRvbT10KX0scmU9ZS5faW5zZXJ0YWZ0ZXI9ZnVuY3Rpb24odCxlLHIpe0t0KHQsciksZT09ci50b3AmJihyLnRvcD10KSxlLm5leHQmJihlLm5leHQucHJldj10KSx0Lm5leHQ9ZS5uZXh0LHQucHJldj1lLGUubmV4dD10fSxpZT1lLl9pbnNlcnRiZWZvcmU9ZnVuY3Rpb24odCxlLHIpe0t0KHQsciksZT09ci5ib3R0b20mJihyLmJvdHRvbT10KSxlLnByZXYmJihlLnByZXYubmV4dD10KSx0LnByZXY9ZS5wcmV2LGUucHJldj10LHQubmV4dD1lfSxuZT1lLnRvTWF0cml4PWZ1bmN0aW9uKHQsZSl7dmFyIHI9T3QodCksaT17Xzp7dHJhbnNmb3JtOlJ9LGdldEJCb3g6ZnVuY3Rpb24oKXtyZXR1cm4gcn19O3JldHVybiBzZShpLGUpLGkubWF0cml4fSxhZT1lLnRyYW5zZm9ybVBhdGg9ZnVuY3Rpb24odCxlKXtyZXR1cm4gTXQodCxuZSh0LGUpKX0sc2U9ZS5fZXh0cmFjdFRyYW5zZm9ybT1mdW5jdGlvbih0LHIpe2lmKG51bGw9PXIpcmV0dXJuIHQuXy50cmFuc2Zvcm07cj1JKHIpLnJlcGxhY2UoL1xcLnszfXxcXHUyMDI2L2csdC5fLnRyYW5zZm9ybXx8Uik7dmFyIGk9ZS5wYXJzZVRyYW5zZm9ybVN0cmluZyhyKSxuPTAsYT0wLHM9MCxvPTEsbD0xLGg9dC5fLHU9bmV3IGc7aWYoaC50cmFuc2Zvcm09aXx8W10saSlmb3IodmFyIGM9MCxmPWkubGVuZ3RoO2M8ZjtjKyspe3ZhciBwPWlbY10sZD1wLmxlbmd0aCx2PUkocFswXSkudG9Mb3dlckNhc2UoKSx4PXBbMF0hPXYseT14P3UuaW52ZXJ0KCk6MCxtLGIsXyx3LGs7XCJ0XCI9PXYmJjM9PWQ/eD8obT15LngoMCwwKSxiPXkueSgwLDApLF89eS54KHBbMV0scFsyXSksdz15LnkocFsxXSxwWzJdKSx1LnRyYW5zbGF0ZShfLW0sdy1iKSk6dS50cmFuc2xhdGUocFsxXSxwWzJdKTpcInJcIj09dj8yPT1kPyhrPWt8fHQuZ2V0QkJveCgxKSx1LnJvdGF0ZShwWzFdLGsueCtrLndpZHRoLzIsay55K2suaGVpZ2h0LzIpLG4rPXBbMV0pOjQ9PWQmJih4PyhfPXkueChwWzJdLHBbM10pLHc9eS55KHBbMl0scFszXSksdS5yb3RhdGUocFsxXSxfLHcpKTp1LnJvdGF0ZShwWzFdLHBbMl0scFszXSksbis9cFsxXSk6XCJzXCI9PXY/Mj09ZHx8Mz09ZD8oaz1rfHx0LmdldEJCb3goMSksdS5zY2FsZShwWzFdLHBbZC0xXSxrLngray53aWR0aC8yLGsueStrLmhlaWdodC8yKSxvKj1wWzFdLGwqPXBbZC0xXSk6NT09ZCYmKHg/KF89eS54KHBbM10scFs0XSksdz15LnkocFszXSxwWzRdKSx1LnNjYWxlKHBbMV0scFsyXSxfLHcpKTp1LnNjYWxlKHBbMV0scFsyXSxwWzNdLHBbNF0pLG8qPXBbMV0sbCo9cFsyXSk6XCJtXCI9PXYmJjc9PWQmJnUuYWRkKHBbMV0scFsyXSxwWzNdLHBbNF0scFs1XSxwWzZdKSxoLmRpcnR5VD0xLHQubWF0cml4PXV9dC5tYXRyaXg9dSxoLnN4PW8saC5zeT1sLGguZGVnPW4saC5keD1hPXUuZSxoLmR5PXM9dS5mLDE9PW8mJjE9PWwmJiFuJiZoLmJib3g/KGguYmJveC54Kz0rYSxoLmJib3gueSs9K3MpOmguZGlydHlUPTF9LG9lPWZ1bmN0aW9uKHQpe3ZhciBlPXRbMF07c3dpdGNoKGUudG9Mb3dlckNhc2UoKSl7Y2FzZVwidFwiOnJldHVybltlLDAsMF07Y2FzZVwibVwiOnJldHVybltlLDEsMCwwLDEsMCwwXTtjYXNlXCJyXCI6cmV0dXJuIDQ9PXQubGVuZ3RoP1tlLDAsdFsyXSx0WzNdXTpbZSwwXTtjYXNlXCJzXCI6cmV0dXJuIDU9PXQubGVuZ3RoP1tlLDEsMSx0WzNdLHRbNF1dOjM9PXQubGVuZ3RoP1tlLDEsMV06W2UsMV19fSxsZT1lLl9lcXVhbGlzZVRyYW5zZm9ybT1mdW5jdGlvbih0LHIpe3I9SShyKS5yZXBsYWNlKC9cXC57M318XFx1MjAyNi9nLHQpLHQ9ZS5wYXJzZVRyYW5zZm9ybVN0cmluZyh0KXx8W10scj1lLnBhcnNlVHJhbnNmb3JtU3RyaW5nKHIpfHxbXTtmb3IodmFyIGk9Vyh0Lmxlbmd0aCxyLmxlbmd0aCksbj1bXSxhPVtdLHM9MCxvLGwsaCx1O3M8aTtzKyspe2lmKGg9dFtzXXx8b2UocltzXSksdT1yW3NdfHxvZShoKSxoWzBdIT11WzBdfHxcInJcIj09aFswXS50b0xvd2VyQ2FzZSgpJiYoaFsyXSE9dVsyXXx8aFszXSE9dVszXSl8fFwic1wiPT1oWzBdLnRvTG93ZXJDYXNlKCkmJihoWzNdIT11WzNdfHxoWzRdIT11WzRdKSlyZXR1cm47Zm9yKG5bc109W10sYVtzXT1bXSxvPTAsbD1XKGgubGVuZ3RoLHUubGVuZ3RoKTtvPGw7bysrKW8gaW4gaCYmKG5bc11bb109aFtvXSksbyBpbiB1JiYoYVtzXVtvXT11W29dKX1yZXR1cm57ZnJvbTpuLHRvOmF9fTtlLl9nZXRDb250YWluZXI9ZnVuY3Rpb24odCxyLGksbil7dmFyIGE7aWYoYT1udWxsIT1ufHxlLmlzKHQsXCJvYmplY3RcIik/dDpULmRvYy5nZXRFbGVtZW50QnlJZCh0KSxudWxsIT1hKXJldHVybiBhLnRhZ05hbWU/bnVsbD09cj97Y29udGFpbmVyOmEsd2lkdGg6YS5zdHlsZS5waXhlbFdpZHRofHxhLm9mZnNldFdpZHRoLGhlaWdodDphLnN0eWxlLnBpeGVsSGVpZ2h0fHxhLm9mZnNldEhlaWdodH06e2NvbnRhaW5lcjphLHdpZHRoOnIsaGVpZ2h0Oml9Ontjb250YWluZXI6MSx4OnQseTpyLHdpZHRoOmksaGVpZ2h0Om59fSxlLnBhdGhUb1JlbGF0aXZlPVd0LGUuX2VuZ2luZT17fSxlLnBhdGgyY3VydmU9UXQsZS5tYXRyaXg9ZnVuY3Rpb24odCxlLHIsaSxuLGEpe3JldHVybiBuZXcgZyh0LGUscixpLG4sYSl9LGZ1bmN0aW9uKHQpe2Z1bmN0aW9uIHIodCl7cmV0dXJuIHRbMF0qdFswXSt0WzFdKnRbMV19ZnVuY3Rpb24gaSh0KXt2YXIgZT1ZLnNxcnQocih0KSk7dFswXSYmKHRbMF0vPWUpLHRbMV0mJih0WzFdLz1lKX10LmFkZD1mdW5jdGlvbih0LGUscixpLG4sYSl7dmFyIHM9W1tdLFtdLFtdXSxvPVtbdGhpcy5hLHRoaXMuYyx0aGlzLmVdLFt0aGlzLmIsdGhpcy5kLHRoaXMuZl0sWzAsMCwxXV0sbD1bW3QscixuXSxbZSxpLGFdLFswLDAsMV1dLGgsdSxjLGY7Zm9yKHQmJnQgaW5zdGFuY2VvZiBnJiYobD1bW3QuYSx0LmMsdC5lXSxbdC5iLHQuZCx0LmZdLFswLDAsMV1dKSxoPTA7aDwzO2grKylmb3IodT0wO3U8Mzt1Kyspe2ZvcihmPTAsYz0wO2M8MztjKyspZis9b1toXVtjXSpsW2NdW3VdO3NbaF1bdV09Zn10aGlzLmE9c1swXVswXSx0aGlzLmI9c1sxXVswXSx0aGlzLmM9c1swXVsxXSx0aGlzLmQ9c1sxXVsxXSx0aGlzLmU9c1swXVsyXSx0aGlzLmY9c1sxXVsyXX0sdC5pbnZlcnQ9ZnVuY3Rpb24oKXt2YXIgdD10aGlzLGU9dC5hKnQuZC10LmIqdC5jO3JldHVybiBuZXcgZyh0LmQvZSwtdC5iL2UsLXQuYy9lLHQuYS9lLCh0LmMqdC5mLXQuZCp0LmUpL2UsKHQuYip0LmUtdC5hKnQuZikvZSl9LHQuY2xvbmU9ZnVuY3Rpb24oKXtyZXR1cm4gbmV3IGcodGhpcy5hLHRoaXMuYix0aGlzLmMsdGhpcy5kLHRoaXMuZSx0aGlzLmYpfSx0LnRyYW5zbGF0ZT1mdW5jdGlvbih0LGUpe1xudGhpcy5hZGQoMSwwLDAsMSx0LGUpfSx0LnNjYWxlPWZ1bmN0aW9uKHQsZSxyLGkpe251bGw9PWUmJihlPXQpLChyfHxpKSYmdGhpcy5hZGQoMSwwLDAsMSxyLGkpLHRoaXMuYWRkKHQsMCwwLGUsMCwwKSwocnx8aSkmJnRoaXMuYWRkKDEsMCwwLDEsLXIsLWkpfSx0LnJvdGF0ZT1mdW5jdGlvbih0LHIsaSl7dD1lLnJhZCh0KSxyPXJ8fDAsaT1pfHwwO3ZhciBuPStZLmNvcyh0KS50b0ZpeGVkKDkpLGE9K1kuc2luKHQpLnRvRml4ZWQoOSk7dGhpcy5hZGQobixhLC1hLG4scixpKSx0aGlzLmFkZCgxLDAsMCwxLC1yLC1pKX0sdC54PWZ1bmN0aW9uKHQsZSl7cmV0dXJuIHQqdGhpcy5hK2UqdGhpcy5jK3RoaXMuZX0sdC55PWZ1bmN0aW9uKHQsZSl7cmV0dXJuIHQqdGhpcy5iK2UqdGhpcy5kK3RoaXMuZn0sdC5nZXQ9ZnVuY3Rpb24odCl7cmV0dXJuK3RoaXNbSS5mcm9tQ2hhckNvZGUoOTcrdCldLnRvRml4ZWQoNCl9LHQudG9TdHJpbmc9ZnVuY3Rpb24oKXtyZXR1cm4gZS5zdmc/XCJtYXRyaXgoXCIrW3RoaXMuZ2V0KDApLHRoaXMuZ2V0KDEpLHRoaXMuZ2V0KDIpLHRoaXMuZ2V0KDMpLHRoaXMuZ2V0KDQpLHRoaXMuZ2V0KDUpXS5qb2luKCkrXCIpXCI6W3RoaXMuZ2V0KDApLHRoaXMuZ2V0KDIpLHRoaXMuZ2V0KDEpLHRoaXMuZ2V0KDMpLDAsMF0uam9pbigpfSx0LnRvRmlsdGVyPWZ1bmN0aW9uKCl7cmV0dXJuXCJwcm9naWQ6RFhJbWFnZVRyYW5zZm9ybS5NaWNyb3NvZnQuTWF0cml4KE0xMT1cIit0aGlzLmdldCgwKStcIiwgTTEyPVwiK3RoaXMuZ2V0KDIpK1wiLCBNMjE9XCIrdGhpcy5nZXQoMSkrXCIsIE0yMj1cIit0aGlzLmdldCgzKStcIiwgRHg9XCIrdGhpcy5nZXQoNCkrXCIsIER5PVwiK3RoaXMuZ2V0KDUpK1wiLCBzaXppbmdtZXRob2Q9J2F1dG8gZXhwYW5kJylcIn0sdC5vZmZzZXQ9ZnVuY3Rpb24oKXtyZXR1cm5bdGhpcy5lLnRvRml4ZWQoNCksdGhpcy5mLnRvRml4ZWQoNCldfSx0LnNwbGl0PWZ1bmN0aW9uKCl7dmFyIHQ9e307dC5keD10aGlzLmUsdC5keT10aGlzLmY7dmFyIG49W1t0aGlzLmEsdGhpcy5jXSxbdGhpcy5iLHRoaXMuZF1dO3Quc2NhbGV4PVkuc3FydChyKG5bMF0pKSxpKG5bMF0pLHQuc2hlYXI9blswXVswXSpuWzFdWzBdK25bMF1bMV0qblsxXVsxXSxuWzFdPVtuWzFdWzBdLW5bMF1bMF0qdC5zaGVhcixuWzFdWzFdLW5bMF1bMV0qdC5zaGVhcl0sdC5zY2FsZXk9WS5zcXJ0KHIoblsxXSkpLGkoblsxXSksdC5zaGVhci89dC5zY2FsZXk7dmFyIGE9LW5bMF1bMV0scz1uWzFdWzFdO3JldHVybiBzPDA/KHQucm90YXRlPWUuZGVnKFkuYWNvcyhzKSksYTwwJiYodC5yb3RhdGU9MzYwLXQucm90YXRlKSk6dC5yb3RhdGU9ZS5kZWcoWS5hc2luKGEpKSx0LmlzU2ltcGxlPSEoK3Quc2hlYXIudG9GaXhlZCg5KXx8dC5zY2FsZXgudG9GaXhlZCg5KSE9dC5zY2FsZXkudG9GaXhlZCg5KSYmdC5yb3RhdGUpLHQuaXNTdXBlclNpbXBsZT0hK3Quc2hlYXIudG9GaXhlZCg5KSYmdC5zY2FsZXgudG9GaXhlZCg5KT09dC5zY2FsZXkudG9GaXhlZCg5KSYmIXQucm90YXRlLHQubm9Sb3RhdGlvbj0hK3Quc2hlYXIudG9GaXhlZCg5KSYmIXQucm90YXRlLHR9LHQudG9UcmFuc2Zvcm1TdHJpbmc9ZnVuY3Rpb24odCl7dmFyIGU9dHx8dGhpc1txXSgpO3JldHVybiBlLmlzU2ltcGxlPyhlLnNjYWxleD0rZS5zY2FsZXgudG9GaXhlZCg0KSxlLnNjYWxleT0rZS5zY2FsZXkudG9GaXhlZCg0KSxlLnJvdGF0ZT0rZS5yb3RhdGUudG9GaXhlZCg0KSwoZS5keHx8ZS5keT9cInRcIitbZS5keCxlLmR5XTpSKSsoMSE9ZS5zY2FsZXh8fDEhPWUuc2NhbGV5P1wic1wiK1tlLnNjYWxleCxlLnNjYWxleSwwLDBdOlIpKyhlLnJvdGF0ZT9cInJcIitbZS5yb3RhdGUsMCwwXTpSKSk6XCJtXCIrW3RoaXMuZ2V0KDApLHRoaXMuZ2V0KDEpLHRoaXMuZ2V0KDIpLHRoaXMuZ2V0KDMpLHRoaXMuZ2V0KDQpLHRoaXMuZ2V0KDUpXX19KGcucHJvdG90eXBlKTtmb3IodmFyIGhlPWZ1bmN0aW9uKCl7dGhpcy5yZXR1cm5WYWx1ZT0hMX0sdWU9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5vcmlnaW5hbEV2ZW50LnByZXZlbnREZWZhdWx0KCl9LGNlPWZ1bmN0aW9uKCl7dGhpcy5jYW5jZWxCdWJibGU9ITB9LGZlPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMub3JpZ2luYWxFdmVudC5zdG9wUHJvcGFnYXRpb24oKX0scGU9ZnVuY3Rpb24odCl7dmFyIGU9VC5kb2MuZG9jdW1lbnRFbGVtZW50LnNjcm9sbFRvcHx8VC5kb2MuYm9keS5zY3JvbGxUb3Ascj1ULmRvYy5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsTGVmdHx8VC5kb2MuYm9keS5zY3JvbGxMZWZ0O3JldHVybnt4OnQuY2xpZW50WCtyLHk6dC5jbGllbnRZK2V9fSxkZT1mdW5jdGlvbigpe3JldHVybiBULmRvYy5hZGRFdmVudExpc3RlbmVyP2Z1bmN0aW9uKHQsZSxyLGkpe3ZhciBuPWZ1bmN0aW9uKHQpe3ZhciBlPXBlKHQpO3JldHVybiByLmNhbGwoaSx0LGUueCxlLnkpfTtpZih0LmFkZEV2ZW50TGlzdGVuZXIoZSxuLCExKSxGJiZWW2VdKXt2YXIgYT1mdW5jdGlvbihlKXtmb3IodmFyIG49cGUoZSksYT1lLHM9MCxvPWUudGFyZ2V0VG91Y2hlcyYmZS50YXJnZXRUb3VjaGVzLmxlbmd0aDtzPG87cysrKWlmKGUudGFyZ2V0VG91Y2hlc1tzXS50YXJnZXQ9PXQpe2U9ZS50YXJnZXRUb3VjaGVzW3NdLGUub3JpZ2luYWxFdmVudD1hLGUucHJldmVudERlZmF1bHQ9dWUsZS5zdG9wUHJvcGFnYXRpb249ZmU7YnJlYWt9cmV0dXJuIHIuY2FsbChpLGUsbi54LG4ueSl9O3QuYWRkRXZlbnRMaXN0ZW5lcihWW2VdLGEsITEpfXJldHVybiBmdW5jdGlvbigpe3JldHVybiB0LnJlbW92ZUV2ZW50TGlzdGVuZXIoZSxuLCExKSxGJiZWW2VdJiZ0LnJlbW92ZUV2ZW50TGlzdGVuZXIoVltlXSxhLCExKSwhMH19OlQuZG9jLmF0dGFjaEV2ZW50P2Z1bmN0aW9uKHQsZSxyLGkpe3ZhciBuPWZ1bmN0aW9uKHQpe3Q9dHx8VC53aW4uZXZlbnQ7dmFyIGU9VC5kb2MuZG9jdW1lbnRFbGVtZW50LnNjcm9sbFRvcHx8VC5kb2MuYm9keS5zY3JvbGxUb3Asbj1ULmRvYy5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsTGVmdHx8VC5kb2MuYm9keS5zY3JvbGxMZWZ0LGE9dC5jbGllbnRYK24scz10LmNsaWVudFkrZTtyZXR1cm4gdC5wcmV2ZW50RGVmYXVsdD10LnByZXZlbnREZWZhdWx0fHxoZSx0LnN0b3BQcm9wYWdhdGlvbj10LnN0b3BQcm9wYWdhdGlvbnx8Y2Usci5jYWxsKGksdCxhLHMpfTt0LmF0dGFjaEV2ZW50KFwib25cIitlLG4pO3ZhciBhPWZ1bmN0aW9uKCl7cmV0dXJuIHQuZGV0YWNoRXZlbnQoXCJvblwiK2UsbiksITB9O3JldHVybiBhfTp2b2lkIDB9KCksZ2U9W10sdmU9ZnVuY3Rpb24oZSl7Zm9yKHZhciByPWUuY2xpZW50WCxpPWUuY2xpZW50WSxuPVQuZG9jLmRvY3VtZW50RWxlbWVudC5zY3JvbGxUb3B8fFQuZG9jLmJvZHkuc2Nyb2xsVG9wLGE9VC5kb2MuZG9jdW1lbnRFbGVtZW50LnNjcm9sbExlZnR8fFQuZG9jLmJvZHkuc2Nyb2xsTGVmdCxzLG89Z2UubGVuZ3RoO28tLTspe2lmKHM9Z2Vbb10sRiYmZS50b3VjaGVzKXtmb3IodmFyIGw9ZS50b3VjaGVzLmxlbmd0aCxoO2wtLTspaWYoaD1lLnRvdWNoZXNbbF0saC5pZGVudGlmaWVyPT1zLmVsLl9kcmFnLmlkKXtyPWguY2xpZW50WCxpPWguY2xpZW50WSwoZS5vcmlnaW5hbEV2ZW50P2Uub3JpZ2luYWxFdmVudDplKS5wcmV2ZW50RGVmYXVsdCgpO2JyZWFrfX1lbHNlIGUucHJldmVudERlZmF1bHQoKTt2YXIgdT1zLmVsLm5vZGUsYyxmPXUubmV4dFNpYmxpbmcscD11LnBhcmVudE5vZGUsZD11LnN0eWxlLmRpc3BsYXk7VC53aW4ub3BlcmEmJnAucmVtb3ZlQ2hpbGQodSksdS5zdHlsZS5kaXNwbGF5PVwibm9uZVwiLGM9cy5lbC5wYXBlci5nZXRFbGVtZW50QnlQb2ludChyLGkpLHUuc3R5bGUuZGlzcGxheT1kLFQud2luLm9wZXJhJiYoZj9wLmluc2VydEJlZm9yZSh1LGYpOnAuYXBwZW5kQ2hpbGQodSkpLGMmJnQoXCJyYXBoYWVsLmRyYWcub3Zlci5cIitzLmVsLmlkLHMuZWwsYykscis9YSxpKz1uLHQoXCJyYXBoYWVsLmRyYWcubW92ZS5cIitzLmVsLmlkLHMubW92ZV9zY29wZXx8cy5lbCxyLXMuZWwuX2RyYWcueCxpLXMuZWwuX2RyYWcueSxyLGksZSl9fSx4ZT1mdW5jdGlvbihyKXtlLnVubW91c2Vtb3ZlKHZlKS51bm1vdXNldXAoeGUpO2Zvcih2YXIgaT1nZS5sZW5ndGgsbjtpLS07KW49Z2VbaV0sbi5lbC5fZHJhZz17fSx0KFwicmFwaGFlbC5kcmFnLmVuZC5cIituLmVsLmlkLG4uZW5kX3Njb3BlfHxuLnN0YXJ0X3Njb3BlfHxuLm1vdmVfc2NvcGV8fG4uZWwscik7Z2U9W119LHllPWUuZWw9e30sbWU9RC5sZW5ndGg7bWUtLTspIWZ1bmN0aW9uKHQpe2VbdF09eWVbdF09ZnVuY3Rpb24ocixpKXtyZXR1cm4gZS5pcyhyLFwiZnVuY3Rpb25cIikmJih0aGlzLmV2ZW50cz10aGlzLmV2ZW50c3x8W10sdGhpcy5ldmVudHMucHVzaCh7bmFtZTp0LGY6cix1bmJpbmQ6ZGUodGhpcy5zaGFwZXx8dGhpcy5ub2RlfHxULmRvYyx0LHIsaXx8dGhpcyl9KSksdGhpc30sZVtcInVuXCIrdF09eWVbXCJ1blwiK3RdPWZ1bmN0aW9uKHIpe2Zvcih2YXIgaT10aGlzLmV2ZW50c3x8W10sbj1pLmxlbmd0aDtuLS07KWlbbl0ubmFtZSE9dHx8IWUuaXMocixcInVuZGVmaW5lZFwiKSYmaVtuXS5mIT1yfHwoaVtuXS51bmJpbmQoKSxpLnNwbGljZShuLDEpLCFpLmxlbmd0aCYmZGVsZXRlIHRoaXMuZXZlbnRzKTtyZXR1cm4gdGhpc319KERbbWVdKTt5ZS5kYXRhPWZ1bmN0aW9uKHIsaSl7dmFyIG49d3RbdGhpcy5pZF09d3RbdGhpcy5pZF18fHt9O2lmKDA9PWFyZ3VtZW50cy5sZW5ndGgpcmV0dXJuIG47aWYoMT09YXJndW1lbnRzLmxlbmd0aCl7aWYoZS5pcyhyLFwib2JqZWN0XCIpKXtmb3IodmFyIGEgaW4gcilyW0FdKGEpJiZ0aGlzLmRhdGEoYSxyW2FdKTtyZXR1cm4gdGhpc31yZXR1cm4gdChcInJhcGhhZWwuZGF0YS5nZXQuXCIrdGhpcy5pZCx0aGlzLG5bcl0sciksbltyXX1yZXR1cm4gbltyXT1pLHQoXCJyYXBoYWVsLmRhdGEuc2V0LlwiK3RoaXMuaWQsdGhpcyxpLHIpLHRoaXN9LHllLnJlbW92ZURhdGE9ZnVuY3Rpb24odCl7cmV0dXJuIG51bGw9PXQ/d3RbdGhpcy5pZF09e306d3RbdGhpcy5pZF0mJmRlbGV0ZSB3dFt0aGlzLmlkXVt0XSx0aGlzfSx5ZS5nZXREYXRhPWZ1bmN0aW9uKCl7cmV0dXJuIHIod3RbdGhpcy5pZF18fHt9KX0seWUuaG92ZXI9ZnVuY3Rpb24odCxlLHIsaSl7cmV0dXJuIHRoaXMubW91c2VvdmVyKHQscikubW91c2VvdXQoZSxpfHxyKX0seWUudW5ob3Zlcj1mdW5jdGlvbih0LGUpe3JldHVybiB0aGlzLnVubW91c2VvdmVyKHQpLnVubW91c2VvdXQoZSl9O3ZhciBiZT1bXTt5ZS5kcmFnPWZ1bmN0aW9uKHIsaSxuLGEscyxvKXtmdW5jdGlvbiBsKGwpeyhsLm9yaWdpbmFsRXZlbnR8fGwpLnByZXZlbnREZWZhdWx0KCk7dmFyIGg9bC5jbGllbnRYLHU9bC5jbGllbnRZLGM9VC5kb2MuZG9jdW1lbnRFbGVtZW50LnNjcm9sbFRvcHx8VC5kb2MuYm9keS5zY3JvbGxUb3AsZj1ULmRvYy5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsTGVmdHx8VC5kb2MuYm9keS5zY3JvbGxMZWZ0O2lmKHRoaXMuX2RyYWcuaWQ9bC5pZGVudGlmaWVyLEYmJmwudG91Y2hlcylmb3IodmFyIHA9bC50b3VjaGVzLmxlbmd0aCxkO3AtLTspaWYoZD1sLnRvdWNoZXNbcF0sdGhpcy5fZHJhZy5pZD1kLmlkZW50aWZpZXIsZC5pZGVudGlmaWVyPT10aGlzLl9kcmFnLmlkKXtoPWQuY2xpZW50WCx1PWQuY2xpZW50WTticmVha310aGlzLl9kcmFnLng9aCtmLHRoaXMuX2RyYWcueT11K2MsIWdlLmxlbmd0aCYmZS5tb3VzZW1vdmUodmUpLm1vdXNldXAoeGUpLGdlLnB1c2goe2VsOnRoaXMsbW92ZV9zY29wZTphLHN0YXJ0X3Njb3BlOnMsZW5kX3Njb3BlOm99KSxpJiZ0Lm9uKFwicmFwaGFlbC5kcmFnLnN0YXJ0LlwiK3RoaXMuaWQsaSksciYmdC5vbihcInJhcGhhZWwuZHJhZy5tb3ZlLlwiK3RoaXMuaWQsciksbiYmdC5vbihcInJhcGhhZWwuZHJhZy5lbmQuXCIrdGhpcy5pZCxuKSx0KFwicmFwaGFlbC5kcmFnLnN0YXJ0LlwiK3RoaXMuaWQsc3x8YXx8dGhpcyxsLmNsaWVudFgrZixsLmNsaWVudFkrYyxsKX1yZXR1cm4gdGhpcy5fZHJhZz17fSxiZS5wdXNoKHtlbDp0aGlzLHN0YXJ0Omx9KSx0aGlzLm1vdXNlZG93bihsKSx0aGlzfSx5ZS5vbkRyYWdPdmVyPWZ1bmN0aW9uKGUpe2U/dC5vbihcInJhcGhhZWwuZHJhZy5vdmVyLlwiK3RoaXMuaWQsZSk6dC51bmJpbmQoXCJyYXBoYWVsLmRyYWcub3Zlci5cIit0aGlzLmlkKX0seWUudW5kcmFnPWZ1bmN0aW9uKCl7Zm9yKHZhciByPWJlLmxlbmd0aDtyLS07KWJlW3JdLmVsPT10aGlzJiYodGhpcy51bm1vdXNlZG93bihiZVtyXS5zdGFydCksYmUuc3BsaWNlKHIsMSksdC51bmJpbmQoXCJyYXBoYWVsLmRyYWcuKi5cIit0aGlzLmlkKSk7IWJlLmxlbmd0aCYmZS51bm1vdXNlbW92ZSh2ZSkudW5tb3VzZXVwKHhlKSxnZT1bXX0sTi5jaXJjbGU9ZnVuY3Rpb24odCxyLGkpe3ZhciBuPWUuX2VuZ2luZS5jaXJjbGUodGhpcyx0fHwwLHJ8fDAsaXx8MCk7cmV0dXJuIHRoaXMuX19zZXRfXyYmdGhpcy5fX3NldF9fLnB1c2gobiksbn0sTi5yZWN0PWZ1bmN0aW9uKHQscixpLG4sYSl7dmFyIHM9ZS5fZW5naW5lLnJlY3QodGhpcyx0fHwwLHJ8fDAsaXx8MCxufHwwLGF8fDApO3JldHVybiB0aGlzLl9fc2V0X18mJnRoaXMuX19zZXRfXy5wdXNoKHMpLHN9LE4uZWxsaXBzZT1mdW5jdGlvbih0LHIsaSxuKXt2YXIgYT1lLl9lbmdpbmUuZWxsaXBzZSh0aGlzLHR8fDAscnx8MCxpfHwwLG58fDApO3JldHVybiB0aGlzLl9fc2V0X18mJnRoaXMuX19zZXRfXy5wdXNoKGEpLGF9LE4ucGF0aD1mdW5jdGlvbih0KXt0JiYhZS5pcyh0LFopJiYhZS5pcyh0WzBdLFEpJiYodCs9Uik7dmFyIHI9ZS5fZW5naW5lLnBhdGgoZS5mb3JtYXRbel0oZSxhcmd1bWVudHMpLHRoaXMpO3JldHVybiB0aGlzLl9fc2V0X18mJnRoaXMuX19zZXRfXy5wdXNoKHIpLHJ9LE4uaW1hZ2U9ZnVuY3Rpb24odCxyLGksbixhKXt2YXIgcz1lLl9lbmdpbmUuaW1hZ2UodGhpcyx0fHxcImFib3V0OmJsYW5rXCIscnx8MCxpfHwwLG58fDAsYXx8MCk7cmV0dXJuIHRoaXMuX19zZXRfXyYmdGhpcy5fX3NldF9fLnB1c2gocyksc30sTi50ZXh0PWZ1bmN0aW9uKHQscixpKXt2YXIgbj1lLl9lbmdpbmUudGV4dCh0aGlzLHR8fDAscnx8MCxJKGkpKTtyZXR1cm4gdGhpcy5fX3NldF9fJiZ0aGlzLl9fc2V0X18ucHVzaChuKSxufSxOLnNldD1mdW5jdGlvbih0KXshZS5pcyh0LFwiYXJyYXlcIikmJih0PUFycmF5LnByb3RvdHlwZS5zcGxpY2UuY2FsbChhcmd1bWVudHMsMCxhcmd1bWVudHMubGVuZ3RoKSk7dmFyIHI9bmV3IHplKHQpO3JldHVybiB0aGlzLl9fc2V0X18mJnRoaXMuX19zZXRfXy5wdXNoKHIpLHIucGFwZXI9dGhpcyxyLnR5cGU9XCJzZXRcIixyfSxOLnNldFN0YXJ0PWZ1bmN0aW9uKHQpe3RoaXMuX19zZXRfXz10fHx0aGlzLnNldCgpfSxOLnNldEZpbmlzaD1mdW5jdGlvbih0KXt2YXIgZT10aGlzLl9fc2V0X187cmV0dXJuIGRlbGV0ZSB0aGlzLl9fc2V0X18sZX0sTi5nZXRTaXplPWZ1bmN0aW9uKCl7dmFyIHQ9dGhpcy5jYW52YXMucGFyZW50Tm9kZTtyZXR1cm57d2lkdGg6dC5vZmZzZXRXaWR0aCxoZWlnaHQ6dC5vZmZzZXRIZWlnaHR9fSxOLnNldFNpemU9ZnVuY3Rpb24odCxyKXtyZXR1cm4gZS5fZW5naW5lLnNldFNpemUuY2FsbCh0aGlzLHQscil9LE4uc2V0Vmlld0JveD1mdW5jdGlvbih0LHIsaSxuLGEpe3JldHVybiBlLl9lbmdpbmUuc2V0Vmlld0JveC5jYWxsKHRoaXMsdCxyLGksbixhKX0sTi50b3A9Ti5ib3R0b209bnVsbCxOLnJhcGhhZWw9ZTt2YXIgX2U9ZnVuY3Rpb24odCl7dmFyIGU9dC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxyPXQub3duZXJEb2N1bWVudCxpPXIuYm9keSxuPXIuZG9jdW1lbnRFbGVtZW50LGE9bi5jbGllbnRUb3B8fGkuY2xpZW50VG9wfHwwLHM9bi5jbGllbnRMZWZ0fHxpLmNsaWVudExlZnR8fDAsbz1lLnRvcCsoVC53aW4ucGFnZVlPZmZzZXR8fG4uc2Nyb2xsVG9wfHxpLnNjcm9sbFRvcCktYSxsPWUubGVmdCsoVC53aW4ucGFnZVhPZmZzZXR8fG4uc2Nyb2xsTGVmdHx8aS5zY3JvbGxMZWZ0KS1zO3JldHVybnt5Om8seDpsfX07Ti5nZXRFbGVtZW50QnlQb2ludD1mdW5jdGlvbih0LGUpe3ZhciByPXRoaXMsaT1yLmNhbnZhcyxuPVQuZG9jLmVsZW1lbnRGcm9tUG9pbnQodCxlKTtpZihULndpbi5vcGVyYSYmXCJzdmdcIj09bi50YWdOYW1lKXt2YXIgYT1fZShpKSxzPWkuY3JlYXRlU1ZHUmVjdCgpO3MueD10LWEueCxzLnk9ZS1hLnkscy53aWR0aD1zLmhlaWdodD0xO3ZhciBvPWkuZ2V0SW50ZXJzZWN0aW9uTGlzdChzLG51bGwpO28ubGVuZ3RoJiYobj1vW28ubGVuZ3RoLTFdKX1pZighbilyZXR1cm4gbnVsbDtmb3IoO24ucGFyZW50Tm9kZSYmbiE9aS5wYXJlbnROb2RlJiYhbi5yYXBoYWVsOyluPW4ucGFyZW50Tm9kZTtyZXR1cm4gbj09ci5jYW52YXMucGFyZW50Tm9kZSYmKG49aSksbj1uJiZuLnJhcGhhZWw/ci5nZXRCeUlkKG4ucmFwaGFlbGlkKTpudWxsfSxOLmdldEVsZW1lbnRzQnlCQm94PWZ1bmN0aW9uKHQpe3ZhciByPXRoaXMuc2V0KCk7cmV0dXJuIHRoaXMuZm9yRWFjaChmdW5jdGlvbihpKXtlLmlzQkJveEludGVyc2VjdChpLmdldEJCb3goKSx0KSYmci5wdXNoKGkpfSkscn0sTi5nZXRCeUlkPWZ1bmN0aW9uKHQpe2Zvcih2YXIgZT10aGlzLmJvdHRvbTtlOyl7aWYoZS5pZD09dClyZXR1cm4gZTtlPWUubmV4dH1yZXR1cm4gbnVsbH0sTi5mb3JFYWNoPWZ1bmN0aW9uKHQsZSl7Zm9yKHZhciByPXRoaXMuYm90dG9tO3I7KXtpZih0LmNhbGwoZSxyKT09PSExKXJldHVybiB0aGlzO3I9ci5uZXh0fXJldHVybiB0aGlzfSxOLmdldEVsZW1lbnRzQnlQb2ludD1mdW5jdGlvbih0LGUpe3ZhciByPXRoaXMuc2V0KCk7cmV0dXJuIHRoaXMuZm9yRWFjaChmdW5jdGlvbihpKXtpLmlzUG9pbnRJbnNpZGUodCxlKSYmci5wdXNoKGkpfSkscn0seWUuaXNQb2ludEluc2lkZT1mdW5jdGlvbih0LHIpe3ZhciBpPXRoaXMucmVhbFBhdGg9RXRbdGhpcy50eXBlXSh0aGlzKTtyZXR1cm4gdGhpcy5hdHRyKFwidHJhbnNmb3JtXCIpJiZ0aGlzLmF0dHIoXCJ0cmFuc2Zvcm1cIikubGVuZ3RoJiYoaT1lLnRyYW5zZm9ybVBhdGgoaSx0aGlzLmF0dHIoXCJ0cmFuc2Zvcm1cIikpKSxlLmlzUG9pbnRJbnNpZGVQYXRoKGksdCxyKX0seWUuZ2V0QkJveD1mdW5jdGlvbih0KXtpZih0aGlzLnJlbW92ZWQpcmV0dXJue307dmFyIGU9dGhpcy5fO3JldHVybiB0PyghZS5kaXJ0eSYmZS5iYm94d3R8fCh0aGlzLnJlYWxQYXRoPUV0W3RoaXMudHlwZV0odGhpcyksZS5iYm94d3Q9T3QodGhpcy5yZWFsUGF0aCksZS5iYm94d3QudG9TdHJpbmc9eCxlLmRpcnR5PTApLGUuYmJveHd0KTooKGUuZGlydHl8fGUuZGlydHlUfHwhZS5iYm94KSYmKCFlLmRpcnR5JiZ0aGlzLnJlYWxQYXRofHwoZS5iYm94d3Q9MCx0aGlzLnJlYWxQYXRoPUV0W3RoaXMudHlwZV0odGhpcykpLGUuYmJveD1PdChNdCh0aGlzLnJlYWxQYXRoLHRoaXMubWF0cml4KSksZS5iYm94LnRvU3RyaW5nPXgsZS5kaXJ0eT1lLmRpcnR5VD0wKSxlLmJib3gpfSx5ZS5jbG9uZT1mdW5jdGlvbigpe2lmKHRoaXMucmVtb3ZlZClyZXR1cm4gbnVsbDt2YXIgdD10aGlzLnBhcGVyW3RoaXMudHlwZV0oKS5hdHRyKHRoaXMuYXR0cigpKTtyZXR1cm4gdGhpcy5fX3NldF9fJiZ0aGlzLl9fc2V0X18ucHVzaCh0KSx0fSx5ZS5nbG93PWZ1bmN0aW9uKHQpe2lmKFwidGV4dFwiPT10aGlzLnR5cGUpcmV0dXJuIG51bGw7dD10fHx7fTt2YXIgZT17d2lkdGg6KHQud2lkdGh8fDEwKSsoK3RoaXMuYXR0cihcInN0cm9rZS13aWR0aFwiKXx8MSksZmlsbDp0LmZpbGx8fCExLG9wYWNpdHk6bnVsbD09dC5vcGFjaXR5Py41OnQub3BhY2l0eSxvZmZzZXR4OnQub2Zmc2V0eHx8MCxvZmZzZXR5OnQub2Zmc2V0eXx8MCxjb2xvcjp0LmNvbG9yfHxcIiMwMDBcIn0scj1lLndpZHRoLzIsaT10aGlzLnBhcGVyLG49aS5zZXQoKSxhPXRoaXMucmVhbFBhdGh8fEV0W3RoaXMudHlwZV0odGhpcyk7YT10aGlzLm1hdHJpeD9NdChhLHRoaXMubWF0cml4KTphO2Zvcih2YXIgcz0xO3M8cisxO3MrKyluLnB1c2goaS5wYXRoKGEpLmF0dHIoe3N0cm9rZTplLmNvbG9yLGZpbGw6ZS5maWxsP2UuY29sb3I6XCJub25lXCIsXCJzdHJva2UtbGluZWpvaW5cIjpcInJvdW5kXCIsXCJzdHJva2UtbGluZWNhcFwiOlwicm91bmRcIixcInN0cm9rZS13aWR0aFwiOisoZS53aWR0aC9yKnMpLnRvRml4ZWQoMyksb3BhY2l0eTorKGUub3BhY2l0eS9yKS50b0ZpeGVkKDMpfSkpO3JldHVybiBuLmluc2VydEJlZm9yZSh0aGlzKS50cmFuc2xhdGUoZS5vZmZzZXR4LGUub2Zmc2V0eSl9O3ZhciB3ZT17fSxrZT1mdW5jdGlvbih0LHIsaSxuLGEscyxvLHUsYyl7cmV0dXJuIG51bGw9PWM/bCh0LHIsaSxuLGEscyxvLHUpOmUuZmluZERvdHNBdFNlZ21lbnQodCxyLGksbixhLHMsbyx1LGgodCxyLGksbixhLHMsbyx1LGMpKX0sQmU9ZnVuY3Rpb24odCxyKXtyZXR1cm4gZnVuY3Rpb24oaSxuLGEpe2k9UXQoaSk7Zm9yKHZhciBzLG8sbCxoLHU9XCJcIixjPXt9LGYscD0wLGQ9MCxnPWkubGVuZ3RoO2Q8ZztkKyspe2lmKGw9aVtkXSxcIk1cIj09bFswXSlzPStsWzFdLG89K2xbMl07ZWxzZXtpZihoPWtlKHMsbyxsWzFdLGxbMl0sbFszXSxsWzRdLGxbNV0sbFs2XSkscCtoPm4pe2lmKHImJiFjLnN0YXJ0KXtpZihmPWtlKHMsbyxsWzFdLGxbMl0sbFszXSxsWzRdLGxbNV0sbFs2XSxuLXApLHUrPVtcIkNcIitmLnN0YXJ0LngsZi5zdGFydC55LGYubS54LGYubS55LGYueCxmLnldLGEpcmV0dXJuIHU7Yy5zdGFydD11LHU9W1wiTVwiK2YueCxmLnkrXCJDXCIrZi5uLngsZi5uLnksZi5lbmQueCxmLmVuZC55LGxbNV0sbFs2XV0uam9pbigpLHArPWgscz0rbFs1XSxvPStsWzZdO2NvbnRpbnVlfWlmKCF0JiYhcilyZXR1cm4gZj1rZShzLG8sbFsxXSxsWzJdLGxbM10sbFs0XSxsWzVdLGxbNl0sbi1wKSx7eDpmLngseTpmLnksYWxwaGE6Zi5hbHBoYX19cCs9aCxzPStsWzVdLG89K2xbNl19dSs9bC5zaGlmdCgpK2x9cmV0dXJuIGMuZW5kPXUsZj10P3A6cj9jOmUuZmluZERvdHNBdFNlZ21lbnQocyxvLGxbMF0sbFsxXSxsWzJdLGxbM10sbFs0XSxsWzVdLDEpLGYuYWxwaGEmJihmPXt4OmYueCx5OmYueSxhbHBoYTpmLmFscGhhfSksZn19LENlPUJlKDEpLFNlPUJlKCksQWU9QmUoMCwxKTtlLmdldFRvdGFsTGVuZ3RoPUNlLGUuZ2V0UG9pbnRBdExlbmd0aD1TZSxlLmdldFN1YnBhdGg9ZnVuY3Rpb24odCxlLHIpe2lmKHRoaXMuZ2V0VG90YWxMZW5ndGgodCktcjwxZS02KXJldHVybiBBZSh0LGUpLmVuZDt2YXIgaT1BZSh0LHIsMSk7cmV0dXJuIGU/QWUoaSxlKS5lbmQ6aX0seWUuZ2V0VG90YWxMZW5ndGg9ZnVuY3Rpb24oKXt2YXIgdD10aGlzLmdldFBhdGgoKTtpZih0KXJldHVybiB0aGlzLm5vZGUuZ2V0VG90YWxMZW5ndGg/dGhpcy5ub2RlLmdldFRvdGFsTGVuZ3RoKCk6Q2UodCl9LHllLmdldFBvaW50QXRMZW5ndGg9ZnVuY3Rpb24odCl7dmFyIGU9dGhpcy5nZXRQYXRoKCk7aWYoZSlyZXR1cm4gU2UoZSx0KX0seWUuZ2V0UGF0aD1mdW5jdGlvbigpe3ZhciB0LHI9ZS5fZ2V0UGF0aFt0aGlzLnR5cGVdO2lmKFwidGV4dFwiIT10aGlzLnR5cGUmJlwic2V0XCIhPXRoaXMudHlwZSlyZXR1cm4gciYmKHQ9cih0aGlzKSksdH0seWUuZ2V0U3VicGF0aD1mdW5jdGlvbih0LHIpe3ZhciBpPXRoaXMuZ2V0UGF0aCgpO2lmKGkpcmV0dXJuIGUuZ2V0U3VicGF0aChpLHQscil9O3ZhciBUZT1lLmVhc2luZ19mb3JtdWxhcz17bGluZWFyOmZ1bmN0aW9uKHQpe3JldHVybiB0fSxcIjxcIjpmdW5jdGlvbih0KXtyZXR1cm4gWCh0LDEuNyl9LFwiPlwiOmZ1bmN0aW9uKHQpe3JldHVybiBYKHQsLjQ4KX0sXCI8PlwiOmZ1bmN0aW9uKHQpe3ZhciBlPS40OC10LzEuMDQscj1ZLnNxcnQoLjE3MzQrZSplKSxpPXItZSxuPVgoSChpKSwxLzMpKihpPDA/LTE6MSksYT0tci1lLHM9WChIKGEpLDEvMykqKGE8MD8tMToxKSxvPW4rcysuNTtyZXR1cm4gMyooMS1vKSpvKm8rbypvKm99LGJhY2tJbjpmdW5jdGlvbih0KXt2YXIgZT0xLjcwMTU4O3JldHVybiB0KnQqKChlKzEpKnQtZSl9LGJhY2tPdXQ6ZnVuY3Rpb24odCl7dC09MTt2YXIgZT0xLjcwMTU4O3JldHVybiB0KnQqKChlKzEpKnQrZSkrMX0sZWxhc3RpYzpmdW5jdGlvbih0KXtyZXR1cm4gdD09ISF0P3Q6WCgyLC0xMCp0KSpZLnNpbigodC0uMDc1KSooMipVKS8uMykrMX0sYm91bmNlOmZ1bmN0aW9uKHQpe3ZhciBlPTcuNTYyNSxyPTIuNzUsaTtyZXR1cm4gdDwxL3I/aT1lKnQqdDp0PDIvcj8odC09MS41L3IsaT1lKnQqdCsuNzUpOnQ8Mi41L3I/KHQtPTIuMjUvcixpPWUqdCp0Ky45Mzc1KToodC09Mi42MjUvcixpPWUqdCp0Ky45ODQzNzUpLGl9fTtUZS5lYXNlSW49VGVbXCJlYXNlLWluXCJdPVRlW1wiPFwiXSxUZS5lYXNlT3V0PVRlW1wiZWFzZS1vdXRcIl09VGVbXCI+XCJdLFRlLmVhc2VJbk91dD1UZVtcImVhc2UtaW4tb3V0XCJdPVRlW1wiPD5cIl0sVGVbXCJiYWNrLWluXCJdPVRlLmJhY2tJbixUZVtcImJhY2stb3V0XCJdPVRlLmJhY2tPdXQ7dmFyIEVlPVtdLE1lPXdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWV8fHdpbmRvdy53ZWJraXRSZXF1ZXN0QW5pbWF0aW9uRnJhbWV8fHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWV8fHdpbmRvdy5vUmVxdWVzdEFuaW1hdGlvbkZyYW1lfHx3aW5kb3cubXNSZXF1ZXN0QW5pbWF0aW9uRnJhbWV8fGZ1bmN0aW9uKHQpe3NldFRpbWVvdXQodCwxNil9LE5lPWZ1bmN0aW9uKCl7Zm9yKHZhciByPStuZXcgRGF0ZSxpPTA7aTxFZS5sZW5ndGg7aSsrKXt2YXIgbj1FZVtpXTtpZighbi5lbC5yZW1vdmVkJiYhbi5wYXVzZWQpe3ZhciBhPXItbi5zdGFydCxzPW4ubXMsbz1uLmVhc2luZyxsPW4uZnJvbSxoPW4uZGlmZix1PW4udG8sYz1uLnQsZj1uLmVsLHA9e30sZCxnPXt9LHY7aWYobi5pbml0c3RhdHVzPyhhPShuLmluaXRzdGF0dXMqbi5hbmltLnRvcC1uLnByZXYpLyhuLnBlcmNlbnQtbi5wcmV2KSpzLG4uc3RhdHVzPW4uaW5pdHN0YXR1cyxkZWxldGUgbi5pbml0c3RhdHVzLG4uc3RvcCYmRWUuc3BsaWNlKGktLSwxKSk6bi5zdGF0dXM9KG4ucHJldisobi5wZXJjZW50LW4ucHJldikqKGEvcykpL24uYW5pbS50b3AsIShhPDApKWlmKGE8cyl7dmFyIHg9byhhL3MpO2Zvcih2YXIgeSBpbiBsKWlmKGxbQV0oeSkpe3N3aXRjaChwdFt5XSl7Y2FzZSAkOmQ9K2xbeV0reCpzKmhbeV07YnJlYWs7Y2FzZVwiY29sb3VyXCI6ZD1cInJnYihcIitbTGUob3QobFt5XS5yK3gqcypoW3ldLnIpKSxMZShvdChsW3ldLmcreCpzKmhbeV0uZykpLExlKG90KGxbeV0uYit4KnMqaFt5XS5iKSldLmpvaW4oXCIsXCIpK1wiKVwiO2JyZWFrO2Nhc2VcInBhdGhcIjpkPVtdO2Zvcih2YXIgbT0wLF89bFt5XS5sZW5ndGg7bTxfO20rKyl7ZFttXT1bbFt5XVttXVswXV07Zm9yKHZhciB3PTEsaz1sW3ldW21dLmxlbmd0aDt3PGs7dysrKWRbbV1bd109K2xbeV1bbV1bd10reCpzKmhbeV1bbV1bd107ZFttXT1kW21dLmpvaW4oail9ZD1kLmpvaW4oaik7YnJlYWs7Y2FzZVwidHJhbnNmb3JtXCI6aWYoaFt5XS5yZWFsKWZvcihkPVtdLG09MCxfPWxbeV0ubGVuZ3RoO208XzttKyspZm9yKGRbbV09W2xbeV1bbV1bMF1dLHc9MSxrPWxbeV1bbV0ubGVuZ3RoO3c8azt3KyspZFttXVt3XT1sW3ldW21dW3ddK3gqcypoW3ldW21dW3ddO2Vsc2V7dmFyIEI9ZnVuY3Rpb24odCl7cmV0dXJuK2xbeV1bdF0reCpzKmhbeV1bdF19O2Q9W1tcIm1cIixCKDApLEIoMSksQigyKSxCKDMpLEIoNCksQig1KV1dfWJyZWFrO2Nhc2VcImNzdlwiOmlmKFwiY2xpcC1yZWN0XCI9PXkpZm9yKGQ9W10sbT00O20tLTspZFttXT0rbFt5XVttXSt4KnMqaFt5XVttXTticmVhaztkZWZhdWx0OnZhciBDPVtdW1BdKGxbeV0pO2ZvcihkPVtdLG09Zi5wYXBlci5jdXN0b21BdHRyaWJ1dGVzW3ldLmxlbmd0aDttLS07KWRbbV09K0NbbV0reCpzKmhbeV1bbV19cFt5XT1kfWYuYXR0cihwKSxmdW5jdGlvbihlLHIsaSl7c2V0VGltZW91dChmdW5jdGlvbigpe3QoXCJyYXBoYWVsLmFuaW0uZnJhbWUuXCIrZSxyLGkpfSl9KGYuaWQsZixuLmFuaW0pfWVsc2V7aWYoZnVuY3Rpb24ocixpLG4pe3NldFRpbWVvdXQoZnVuY3Rpb24oKXt0KFwicmFwaGFlbC5hbmltLmZyYW1lLlwiK2kuaWQsaSxuKSx0KFwicmFwaGFlbC5hbmltLmZpbmlzaC5cIitpLmlkLGksbiksZS5pcyhyLFwiZnVuY3Rpb25cIikmJnIuY2FsbChpKX0pfShuLmNhbGxiYWNrLGYsbi5hbmltKSxmLmF0dHIodSksRWUuc3BsaWNlKGktLSwxKSxuLnJlcGVhdD4xJiYhbi5uZXh0KXtmb3IodiBpbiB1KXVbQV0odikmJihnW3ZdPW4udG90YWxPcmlnaW5bdl0pO24uZWwuYXR0cihnKSxiKG4uYW5pbSxuLmVsLG4uYW5pbS5wZXJjZW50c1swXSxudWxsLG4udG90YWxPcmlnaW4sbi5yZXBlYXQtMSl9bi5uZXh0JiYhbi5zdG9wJiZiKG4uYW5pbSxuLmVsLG4ubmV4dCxudWxsLG4udG90YWxPcmlnaW4sbi5yZXBlYXQpfX19RWUubGVuZ3RoJiZNZShOZSl9LExlPWZ1bmN0aW9uKHQpe3JldHVybiB0PjI1NT8yNTU6dDwwPzA6dH07eWUuYW5pbWF0ZVdpdGg9ZnVuY3Rpb24odCxyLGksbixhLHMpe3ZhciBvPXRoaXM7aWYoby5yZW1vdmVkKXJldHVybiBzJiZzLmNhbGwobyksbzt2YXIgbD1pIGluc3RhbmNlb2YgbT9pOmUuYW5pbWF0aW9uKGksbixhLHMpLGgsdTtiKGwsbyxsLnBlcmNlbnRzWzBdLG51bGwsby5hdHRyKCkpO2Zvcih2YXIgYz0wLGY9RWUubGVuZ3RoO2M8ZjtjKyspaWYoRWVbY10uYW5pbT09ciYmRWVbY10uZWw9PXQpe0VlW2YtMV0uc3RhcnQ9RWVbY10uc3RhcnQ7YnJlYWt9cmV0dXJuIG99LHllLm9uQW5pbWF0aW9uPWZ1bmN0aW9uKGUpe3JldHVybiBlP3Qub24oXCJyYXBoYWVsLmFuaW0uZnJhbWUuXCIrdGhpcy5pZCxlKTp0LnVuYmluZChcInJhcGhhZWwuYW5pbS5mcmFtZS5cIit0aGlzLmlkKSx0aGlzfSxtLnByb3RvdHlwZS5kZWxheT1mdW5jdGlvbih0KXt2YXIgZT1uZXcgbSh0aGlzLmFuaW0sdGhpcy5tcyk7cmV0dXJuIGUudGltZXM9dGhpcy50aW1lcyxlLmRlbD0rdHx8MCxlfSxtLnByb3RvdHlwZS5yZXBlYXQ9ZnVuY3Rpb24odCl7dmFyIGU9bmV3IG0odGhpcy5hbmltLHRoaXMubXMpO3JldHVybiBlLmRlbD10aGlzLmRlbCxlLnRpbWVzPVkuZmxvb3IoVyh0LDApKXx8MSxlfSxlLmFuaW1hdGlvbj1mdW5jdGlvbih0LHIsaSxuKXtpZih0IGluc3RhbmNlb2YgbSlyZXR1cm4gdDshZS5pcyhpLFwiZnVuY3Rpb25cIikmJml8fChuPW58fGl8fG51bGwsaT1udWxsKSx0PU9iamVjdCh0KSxyPStyfHwwO3ZhciBhPXt9LHMsbztmb3IobyBpbiB0KXRbQV0obykmJmh0KG8pIT1vJiZodChvKStcIiVcIiE9byYmKHM9ITAsYVtvXT10W29dKTtpZihzKXJldHVybiBpJiYoYS5lYXNpbmc9aSksbiYmKGEuY2FsbGJhY2s9biksbmV3IG0oezEwMDphfSxyKTtpZihuKXt2YXIgbD0wO2Zvcih2YXIgaCBpbiB0KXt2YXIgdT11dChoKTt0W0FdKGgpJiZ1PmwmJihsPXUpfWwrPVwiJVwiLCF0W2xdLmNhbGxiYWNrJiYodFtsXS5jYWxsYmFjaz1uKX1yZXR1cm4gbmV3IG0odCxyKX0seWUuYW5pbWF0ZT1mdW5jdGlvbih0LHIsaSxuKXt2YXIgYT10aGlzO2lmKGEucmVtb3ZlZClyZXR1cm4gbiYmbi5jYWxsKGEpLGE7dmFyIHM9dCBpbnN0YW5jZW9mIG0/dDplLmFuaW1hdGlvbih0LHIsaSxuKTtyZXR1cm4gYihzLGEscy5wZXJjZW50c1swXSxudWxsLGEuYXR0cigpKSxhfSx5ZS5zZXRUaW1lPWZ1bmN0aW9uKHQsZSl7cmV0dXJuIHQmJm51bGwhPWUmJnRoaXMuc3RhdHVzKHQsRyhlLHQubXMpL3QubXMpLHRoaXN9LHllLnN0YXR1cz1mdW5jdGlvbih0LGUpe3ZhciByPVtdLGk9MCxuLGE7aWYobnVsbCE9ZSlyZXR1cm4gYih0LHRoaXMsLTEsRyhlLDEpKSx0aGlzO2ZvcihuPUVlLmxlbmd0aDtpPG47aSsrKWlmKGE9RWVbaV0sYS5lbC5pZD09dGhpcy5pZCYmKCF0fHxhLmFuaW09PXQpKXtpZih0KXJldHVybiBhLnN0YXR1cztyLnB1c2goe2FuaW06YS5hbmltLHN0YXR1czphLnN0YXR1c30pfXJldHVybiB0PzA6cn0seWUucGF1c2U9ZnVuY3Rpb24oZSl7Zm9yKHZhciByPTA7cjxFZS5sZW5ndGg7cisrKUVlW3JdLmVsLmlkIT10aGlzLmlkfHxlJiZFZVtyXS5hbmltIT1lfHx0KFwicmFwaGFlbC5hbmltLnBhdXNlLlwiK3RoaXMuaWQsdGhpcyxFZVtyXS5hbmltKSE9PSExJiYoRWVbcl0ucGF1c2VkPSEwKTtyZXR1cm4gdGhpc30seWUucmVzdW1lPWZ1bmN0aW9uKGUpe2Zvcih2YXIgcj0wO3I8RWUubGVuZ3RoO3IrKylpZihFZVtyXS5lbC5pZD09dGhpcy5pZCYmKCFlfHxFZVtyXS5hbmltPT1lKSl7dmFyIGk9RWVbcl07dChcInJhcGhhZWwuYW5pbS5yZXN1bWUuXCIrdGhpcy5pZCx0aGlzLGkuYW5pbSkhPT0hMSYmKGRlbGV0ZSBpLnBhdXNlZCx0aGlzLnN0YXR1cyhpLmFuaW0saS5zdGF0dXMpKX1yZXR1cm4gdGhpc30seWUuc3RvcD1mdW5jdGlvbihlKXtmb3IodmFyIHI9MDtyPEVlLmxlbmd0aDtyKyspRWVbcl0uZWwuaWQhPXRoaXMuaWR8fGUmJkVlW3JdLmFuaW0hPWV8fHQoXCJyYXBoYWVsLmFuaW0uc3RvcC5cIit0aGlzLmlkLHRoaXMsRWVbcl0uYW5pbSkhPT0hMSYmRWUuc3BsaWNlKHItLSwxKTtyZXR1cm4gdGhpc30sdC5vbihcInJhcGhhZWwucmVtb3ZlXCIsXyksdC5vbihcInJhcGhhZWwuY2xlYXJcIixfKSx5ZS50b1N0cmluZz1mdW5jdGlvbigpe3JldHVyblwiUmFwaGHDq2zigJlzIG9iamVjdFwifTt2YXIgemU9ZnVuY3Rpb24odCl7aWYodGhpcy5pdGVtcz1bXSx0aGlzLmxlbmd0aD0wLHRoaXMudHlwZT1cInNldFwiLHQpZm9yKHZhciBlPTAscj10Lmxlbmd0aDtlPHI7ZSsrKSF0W2VdfHx0W2VdLmNvbnN0cnVjdG9yIT15ZS5jb25zdHJ1Y3RvciYmdFtlXS5jb25zdHJ1Y3RvciE9emV8fCh0aGlzW3RoaXMuaXRlbXMubGVuZ3RoXT10aGlzLml0ZW1zW3RoaXMuaXRlbXMubGVuZ3RoXT10W2VdLHRoaXMubGVuZ3RoKyspfSxQZT16ZS5wcm90b3R5cGU7UGUucHVzaD1mdW5jdGlvbigpe2Zvcih2YXIgdCxlLHI9MCxpPWFyZ3VtZW50cy5sZW5ndGg7cjxpO3IrKyl0PWFyZ3VtZW50c1tyXSwhdHx8dC5jb25zdHJ1Y3RvciE9eWUuY29uc3RydWN0b3ImJnQuY29uc3RydWN0b3IhPXplfHwoZT10aGlzLml0ZW1zLmxlbmd0aCx0aGlzW2VdPXRoaXMuaXRlbXNbZV09dCx0aGlzLmxlbmd0aCsrKTtyZXR1cm4gdGhpc30sUGUucG9wPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMubGVuZ3RoJiZkZWxldGUgdGhpc1t0aGlzLmxlbmd0aC0tXSx0aGlzLml0ZW1zLnBvcCgpfSxQZS5mb3JFYWNoPWZ1bmN0aW9uKHQsZSl7Zm9yKHZhciByPTAsaT10aGlzLml0ZW1zLmxlbmd0aDtyPGk7cisrKWlmKHQuY2FsbChlLHRoaXMuaXRlbXNbcl0scik9PT0hMSlyZXR1cm4gdGhpcztyZXR1cm4gdGhpc307Zm9yKHZhciBGZSBpbiB5ZSl5ZVtBXShGZSkmJihQZVtGZV09ZnVuY3Rpb24odCl7cmV0dXJuIGZ1bmN0aW9uKCl7dmFyIGU9YXJndW1lbnRzO3JldHVybiB0aGlzLmZvckVhY2goZnVuY3Rpb24ocil7clt0XVt6XShyLGUpfSl9fShGZSkpO3JldHVybiBQZS5hdHRyPWZ1bmN0aW9uKHQscil7aWYodCYmZS5pcyh0LFEpJiZlLmlzKHRbMF0sXCJvYmplY3RcIikpZm9yKHZhciBpPTAsbj10Lmxlbmd0aDtpPG47aSsrKXRoaXMuaXRlbXNbaV0uYXR0cih0W2ldKTtlbHNlIGZvcih2YXIgYT0wLHM9dGhpcy5pdGVtcy5sZW5ndGg7YTxzO2ErKyl0aGlzLml0ZW1zW2FdLmF0dHIodCxyKTtyZXR1cm4gdGhpc30sUGUuY2xlYXI9ZnVuY3Rpb24oKXtmb3IoO3RoaXMubGVuZ3RoOyl0aGlzLnBvcCgpfSxQZS5zcGxpY2U9ZnVuY3Rpb24odCxlLHIpe3Q9dDwwP1codGhpcy5sZW5ndGgrdCwwKTp0LGU9VygwLEcodGhpcy5sZW5ndGgtdCxlKSk7dmFyIGk9W10sbj1bXSxhPVtdLHM7Zm9yKHM9MjtzPGFyZ3VtZW50cy5sZW5ndGg7cysrKWEucHVzaChhcmd1bWVudHNbc10pO2ZvcihzPTA7czxlO3MrKyluLnB1c2godGhpc1t0K3NdKTtmb3IoO3M8dGhpcy5sZW5ndGgtdDtzKyspaS5wdXNoKHRoaXNbdCtzXSk7dmFyIG89YS5sZW5ndGg7Zm9yKHM9MDtzPG8raS5sZW5ndGg7cysrKXRoaXMuaXRlbXNbdCtzXT10aGlzW3Qrc109czxvP2Fbc106aVtzLW9dO2ZvcihzPXRoaXMuaXRlbXMubGVuZ3RoPXRoaXMubGVuZ3RoLT1lLW87dGhpc1tzXTspZGVsZXRlIHRoaXNbcysrXTtyZXR1cm4gbmV3IHplKG4pfSxQZS5leGNsdWRlPWZ1bmN0aW9uKHQpe2Zvcih2YXIgZT0wLHI9dGhpcy5sZW5ndGg7ZTxyO2UrKylpZih0aGlzW2VdPT10KXJldHVybiB0aGlzLnNwbGljZShlLDEpLCEwfSxQZS5hbmltYXRlPWZ1bmN0aW9uKHQscixpLG4peyhlLmlzKGksXCJmdW5jdGlvblwiKXx8IWkpJiYobj1pfHxudWxsKTt2YXIgYT10aGlzLml0ZW1zLmxlbmd0aCxzPWEsbyxsPXRoaXMsaDtpZighYSlyZXR1cm4gdGhpcztuJiYoaD1mdW5jdGlvbigpeyEtLWEmJm4uY2FsbChsKX0pLGk9ZS5pcyhpLFopP2k6aDt2YXIgdT1lLmFuaW1hdGlvbih0LHIsaSxoKTtmb3Iobz10aGlzLml0ZW1zWy0tc10uYW5pbWF0ZSh1KTtzLS07KXRoaXMuaXRlbXNbc10mJiF0aGlzLml0ZW1zW3NdLnJlbW92ZWQmJnRoaXMuaXRlbXNbc10uYW5pbWF0ZVdpdGgobyx1LHUpLHRoaXMuaXRlbXNbc10mJiF0aGlzLml0ZW1zW3NdLnJlbW92ZWR8fGEtLTtyZXR1cm4gdGhpc30sUGUuaW5zZXJ0QWZ0ZXI9ZnVuY3Rpb24odCl7Zm9yKHZhciBlPXRoaXMuaXRlbXMubGVuZ3RoO2UtLTspdGhpcy5pdGVtc1tlXS5pbnNlcnRBZnRlcih0KTtyZXR1cm4gdGhpc30sUGUuZ2V0QkJveD1mdW5jdGlvbigpe2Zvcih2YXIgdD1bXSxlPVtdLHI9W10saT1bXSxuPXRoaXMuaXRlbXMubGVuZ3RoO24tLTspaWYoIXRoaXMuaXRlbXNbbl0ucmVtb3ZlZCl7dmFyIGE9dGhpcy5pdGVtc1tuXS5nZXRCQm94KCk7dC5wdXNoKGEueCksZS5wdXNoKGEueSksci5wdXNoKGEueCthLndpZHRoKSxpLnB1c2goYS55K2EuaGVpZ2h0KX1yZXR1cm4gdD1HW3pdKDAsdCksZT1HW3pdKDAsZSkscj1XW3pdKDAsciksaT1XW3pdKDAsaSkse3g6dCx5OmUseDI6cix5MjppLHdpZHRoOnItdCxoZWlnaHQ6aS1lfX0sUGUuY2xvbmU9ZnVuY3Rpb24odCl7dD10aGlzLnBhcGVyLnNldCgpO2Zvcih2YXIgZT0wLHI9dGhpcy5pdGVtcy5sZW5ndGg7ZTxyO2UrKyl0LnB1c2godGhpcy5pdGVtc1tlXS5jbG9uZSgpKTtyZXR1cm4gdH0sUGUudG9TdHJpbmc9ZnVuY3Rpb24oKXtyZXR1cm5cIlJhcGhhw6ts4oCYcyBzZXRcIn0sUGUuZ2xvdz1mdW5jdGlvbih0KXt2YXIgZT10aGlzLnBhcGVyLnNldCgpO3JldHVybiB0aGlzLmZvckVhY2goZnVuY3Rpb24ocixpKXt2YXIgbj1yLmdsb3codCk7bnVsbCE9biYmbi5mb3JFYWNoKGZ1bmN0aW9uKHQscil7ZS5wdXNoKHQpfSl9KSxlfSxQZS5pc1BvaW50SW5zaWRlPWZ1bmN0aW9uKHQsZSl7dmFyIHI9ITE7cmV0dXJuIHRoaXMuZm9yRWFjaChmdW5jdGlvbihpKXtpZihpLmlzUG9pbnRJbnNpZGUodCxlKSlyZXR1cm4gcj0hMCwhMX0pLHJ9LGUucmVnaXN0ZXJGb250PWZ1bmN0aW9uKHQpe2lmKCF0LmZhY2UpcmV0dXJuIHQ7dGhpcy5mb250cz10aGlzLmZvbnRzfHx7fTt2YXIgZT17dzp0LncsZmFjZTp7fSxnbHlwaHM6e319LHI9dC5mYWNlW1wiZm9udC1mYW1pbHlcIl07Zm9yKHZhciBpIGluIHQuZmFjZSl0LmZhY2VbQV0oaSkmJihlLmZhY2VbaV09dC5mYWNlW2ldKTtpZih0aGlzLmZvbnRzW3JdP3RoaXMuZm9udHNbcl0ucHVzaChlKTp0aGlzLmZvbnRzW3JdPVtlXSwhdC5zdmcpe2UuZmFjZVtcInVuaXRzLXBlci1lbVwiXT11dCh0LmZhY2VbXCJ1bml0cy1wZXItZW1cIl0sMTApO2Zvcih2YXIgbiBpbiB0LmdseXBocylpZih0LmdseXBoc1tBXShuKSl7dmFyIGE9dC5nbHlwaHNbbl07aWYoZS5nbHlwaHNbbl09e3c6YS53LGs6e30sZDphLmQmJlwiTVwiK2EuZC5yZXBsYWNlKC9bbWxjeHRydl0vZyxmdW5jdGlvbih0KXtyZXR1cm57bDpcIkxcIixjOlwiQ1wiLHg6XCJ6XCIsdDpcIm1cIixyOlwibFwiLHY6XCJjXCJ9W3RdfHxcIk1cIn0pK1wielwifSxhLmspZm9yKHZhciBzIGluIGEuaylhW0FdKHMpJiYoZS5nbHlwaHNbbl0ua1tzXT1hLmtbc10pfX1yZXR1cm4gdH0sTi5nZXRGb250PWZ1bmN0aW9uKHQscixpLG4pe2lmKG49bnx8XCJub3JtYWxcIixpPWl8fFwibm9ybWFsXCIscj0rcnx8e25vcm1hbDo0MDAsYm9sZDo3MDAsbGlnaHRlcjozMDAsYm9sZGVyOjgwMH1bcl18fDQwMCxlLmZvbnRzKXt2YXIgYT1lLmZvbnRzW3RdO2lmKCFhKXt2YXIgcz1uZXcgUmVnRXhwKFwiKF58XFxcXHMpXCIrdC5yZXBsYWNlKC9bXlxcd1xcZFxccyshfi46Xy1dL2csUikrXCIoXFxcXHN8JClcIixcImlcIik7Zm9yKHZhciBvIGluIGUuZm9udHMpaWYoZS5mb250c1tBXShvKSYmcy50ZXN0KG8pKXthPWUuZm9udHNbb107YnJlYWt9fXZhciBsO2lmKGEpZm9yKHZhciBoPTAsdT1hLmxlbmd0aDtoPHUmJihsPWFbaF0sbC5mYWNlW1wiZm9udC13ZWlnaHRcIl0hPXJ8fGwuZmFjZVtcImZvbnQtc3R5bGVcIl0hPWkmJmwuZmFjZVtcImZvbnQtc3R5bGVcIl18fGwuZmFjZVtcImZvbnQtc3RyZXRjaFwiXSE9bik7aCsrKTtyZXR1cm4gbH19LE4ucHJpbnQ9ZnVuY3Rpb24odCxyLGksbixhLHMsbyxsKXtzPXN8fFwibWlkZGxlXCIsbz1XKEcob3x8MCwxKSwtMSksbD1XKEcobHx8MSwzKSwxKTt2YXIgaD1JKGkpW3FdKFIpLHU9MCxjPTAsZj1SLHA7aWYoZS5pcyhuLFwic3RyaW5nXCIpJiYobj10aGlzLmdldEZvbnQobikpLG4pe3A9KGF8fDE2KS9uLmZhY2VbXCJ1bml0cy1wZXItZW1cIl07Zm9yKHZhciBkPW4uZmFjZS5iYm94W3FdKGspLGc9K2RbMF0sdj1kWzNdLWRbMV0seD0wLHk9K2RbMV0rKFwiYmFzZWxpbmVcIj09cz92KyArbi5mYWNlLmRlc2NlbnQ6di8yKSxtPTAsYj1oLmxlbmd0aDttPGI7bSsrKXtpZihcIlxcblwiPT1oW21dKXU9MCx3PTAsYz0wLHgrPXYqbDtlbHNle3ZhciBfPWMmJm4uZ2x5cGhzW2hbbS0xXV18fHt9LHc9bi5nbHlwaHNbaFttXV07dSs9Yz8oXy53fHxuLncpKyhfLmsmJl8ua1toW21dXXx8MCkrbi53Km86MCxjPTF9dyYmdy5kJiYoZis9ZS50cmFuc2Zvcm1QYXRoKHcuZCxbXCJ0XCIsdSpwLHgqcCxcInNcIixwLHAsZyx5LFwidFwiLCh0LWcpL3AsKHIteSkvcF0pKX19cmV0dXJuIHRoaXMucGF0aChmKS5hdHRyKHtmaWxsOlwiIzAwMFwiLHN0cm9rZTpcIm5vbmVcIn0pfSxOLmFkZD1mdW5jdGlvbih0KXtpZihlLmlzKHQsXCJhcnJheVwiKSlmb3IodmFyIHI9dGhpcy5zZXQoKSxpPTAsbj10Lmxlbmd0aCxhO2k8bjtpKyspYT10W2ldfHx7fSxCW0FdKGEudHlwZSkmJnIucHVzaCh0aGlzW2EudHlwZV0oKS5hdHRyKGEpKTtyZXR1cm4gcn0sZS5mb3JtYXQ9ZnVuY3Rpb24odCxyKXt2YXIgaT1lLmlzKHIsUSk/WzBdW1BdKHIpOmFyZ3VtZW50cztyZXR1cm4gdCYmZS5pcyh0LFopJiZpLmxlbmd0aC0xJiYodD10LnJlcGxhY2UoQyxmdW5jdGlvbih0LGUpe3JldHVybiBudWxsPT1pWysrZV0/UjppW2VdfSkpLHR8fFJ9LGUuZnVsbGZpbGw9ZnVuY3Rpb24oKXt2YXIgdD0vXFx7KFteXFx9XSspXFx9L2csZT0vKD86KD86XnxcXC4pKC4rPykoPz1cXFt8XFwufCR8XFwoKXxcXFsoJ3xcIikoLis/KVxcMlxcXSkoXFwoXFwpKT8vZyxyPWZ1bmN0aW9uKHQscixpKXt2YXIgbj1pO3JldHVybiByLnJlcGxhY2UoZSxmdW5jdGlvbih0LGUscixpLGEpe2U9ZXx8aSxuJiYoZSBpbiBuJiYobj1uW2VdKSxcImZ1bmN0aW9uXCI9PXR5cGVvZiBuJiZhJiYobj1uKCkpKX0pLG49KG51bGw9PW58fG49PWk/dDpuKStcIlwifTtyZXR1cm4gZnVuY3Rpb24oZSxpKXtyZXR1cm4gU3RyaW5nKGUpLnJlcGxhY2UodCxmdW5jdGlvbih0LGUpe3JldHVybiByKHQsZSxpKX0pfX0oKSxlLm5pbmphPWZ1bmN0aW9uKCl7aWYoRS53YXMpVC53aW4uUmFwaGFlbD1FLmlzO2Vsc2V7d2luZG93LlJhcGhhZWw9dm9pZCAwO3RyeXtkZWxldGUgd2luZG93LlJhcGhhZWx9Y2F0Y2godCl7fX1yZXR1cm4gZX0sZS5zdD1QZSx0Lm9uKFwicmFwaGFlbC5ET01sb2FkXCIsZnVuY3Rpb24oKXt3PSEwfSksZnVuY3Rpb24odCxyLGkpe2Z1bmN0aW9uIG4oKXsvaW4vLnRlc3QodC5yZWFkeVN0YXRlKT9zZXRUaW1lb3V0KG4sOSk6ZS5ldmUoXCJyYXBoYWVsLkRPTWxvYWRcIil9bnVsbD09dC5yZWFkeVN0YXRlJiZ0LmFkZEV2ZW50TGlzdGVuZXImJih0LmFkZEV2ZW50TGlzdGVuZXIocixpPWZ1bmN0aW9uKCl7dC5yZW1vdmVFdmVudExpc3RlbmVyKHIsaSwhMSksdC5yZWFkeVN0YXRlPVwiY29tcGxldGVcIn0sITEpLHQucmVhZHlTdGF0ZT1cImxvYWRpbmdcIiksbigpfShkb2N1bWVudCxcIkRPTUNvbnRlbnRMb2FkZWRcIiksZX0uYXBwbHkoZSxpKSwhKHZvaWQgMCE9PW4mJih0LmV4cG9ydHM9bikpfSxmdW5jdGlvbih0LGUscil7dmFyIGksbjshZnVuY3Rpb24ocil7dmFyIGE9XCIwLjUuMFwiLHM9XCJoYXNPd25Qcm9wZXJ0eVwiLG89L1tcXC5cXC9dLyxsPS9cXHMqLFxccyovLGg9XCIqXCIsdT1mdW5jdGlvbigpe30sYz1mdW5jdGlvbih0LGUpe3JldHVybiB0LWV9LGYscCxkPXtuOnt9fSxnPWZ1bmN0aW9uKCl7Zm9yKHZhciB0PTAsZT10aGlzLmxlbmd0aDt0PGU7dCsrKWlmKFwidW5kZWZpbmVkXCIhPXR5cGVvZiB0aGlzW3RdKXJldHVybiB0aGlzW3RdfSx2PWZ1bmN0aW9uKCl7Zm9yKHZhciB0PXRoaXMubGVuZ3RoOy0tdDspaWYoXCJ1bmRlZmluZWRcIiE9dHlwZW9mIHRoaXNbdF0pcmV0dXJuIHRoaXNbdF19LHg9T2JqZWN0LnByb3RvdHlwZS50b1N0cmluZyx5PVN0cmluZyxtPUFycmF5LmlzQXJyYXl8fGZ1bmN0aW9uKHQpe3JldHVybiB0IGluc3RhbmNlb2YgQXJyYXl8fFwiW29iamVjdCBBcnJheV1cIj09eC5jYWxsKHQpfTtldmU9ZnVuY3Rpb24odCxlKXt2YXIgcj1kLGk9cCxuPUFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywyKSxhPWV2ZS5saXN0ZW5lcnModCkscz0wLG89ITEsbCxoPVtdLHU9e30seD1bXSx5PWYsbT1bXTt4LmZpcnN0RGVmaW5lZD1nLHgubGFzdERlZmluZWQ9dixmPXQscD0wO2Zvcih2YXIgYj0wLF89YS5sZW5ndGg7YjxfO2IrKylcInpJbmRleFwiaW4gYVtiXSYmKGgucHVzaChhW2JdLnpJbmRleCksYVtiXS56SW5kZXg8MCYmKHVbYVtiXS56SW5kZXhdPWFbYl0pKTtmb3IoaC5zb3J0KGMpO2hbc108MDspaWYobD11W2hbcysrXV0seC5wdXNoKGwuYXBwbHkoZSxuKSkscClyZXR1cm4gcD1pLHg7Zm9yKGI9MDtiPF87YisrKWlmKGw9YVtiXSxcInpJbmRleFwiaW4gbClpZihsLnpJbmRleD09aFtzXSl7aWYoeC5wdXNoKGwuYXBwbHkoZSxuKSkscClicmVhaztkbyBpZihzKyssbD11W2hbc11dLGwmJngucHVzaChsLmFwcGx5KGUsbikpLHApYnJlYWs7d2hpbGUobCl9ZWxzZSB1W2wuekluZGV4XT1sO2Vsc2UgaWYoeC5wdXNoKGwuYXBwbHkoZSxuKSkscClicmVhaztyZXR1cm4gcD1pLGY9eSx4fSxldmUuX2V2ZW50cz1kLGV2ZS5saXN0ZW5lcnM9ZnVuY3Rpb24odCl7dmFyIGU9bSh0KT90OnQuc3BsaXQobykscj1kLGksbixhLHMsbCx1LGMsZixwPVtyXSxnPVtdO2ZvcihzPTAsbD1lLmxlbmd0aDtzPGw7cysrKXtmb3IoZj1bXSx1PTAsYz1wLmxlbmd0aDt1PGM7dSsrKWZvcihyPXBbdV0ubixuPVtyW2Vbc11dLHJbaF1dLGE9MjthLS07KWk9blthXSxpJiYoZi5wdXNoKGkpLGc9Zy5jb25jYXQoaS5mfHxbXSkpO3A9Zn1yZXR1cm4gZ30sZXZlLnNlcGFyYXRvcj1mdW5jdGlvbih0KXt0Pyh0PXkodCkucmVwbGFjZSgvKD89W1xcLlxcXlxcXVxcW1xcLV0pL2csXCJcXFxcXCIpLHQ9XCJbXCIrdCtcIl1cIixvPW5ldyBSZWdFeHAodCkpOm89L1tcXC5cXC9dL30sZXZlLm9uPWZ1bmN0aW9uKHQsZSl7aWYoXCJmdW5jdGlvblwiIT10eXBlb2YgZSlyZXR1cm4gZnVuY3Rpb24oKXt9O2Zvcih2YXIgcj1tKHQpP20odFswXSk/dDpbdF06eSh0KS5zcGxpdChsKSxpPTAsbj1yLmxlbmd0aDtpPG47aSsrKSFmdW5jdGlvbih0KXtmb3IodmFyIHI9bSh0KT90OnkodCkuc3BsaXQobyksaT1kLG4sYT0wLHM9ci5sZW5ndGg7YTxzO2ErKylpPWkubixpPWkuaGFzT3duUHJvcGVydHkoclthXSkmJmlbclthXV18fChpW3JbYV1dPXtuOnt9fSk7Zm9yKGkuZj1pLmZ8fFtdLGE9MCxzPWkuZi5sZW5ndGg7YTxzO2ErKylpZihpLmZbYV09PWUpe249ITA7YnJlYWt9IW4mJmkuZi5wdXNoKGUpfShyW2ldKTtyZXR1cm4gZnVuY3Rpb24odCl7K3Q9PSt0JiYoZS56SW5kZXg9K3QpfX0sZXZlLmY9ZnVuY3Rpb24odCl7dmFyIGU9W10uc2xpY2UuY2FsbChhcmd1bWVudHMsMSk7cmV0dXJuIGZ1bmN0aW9uKCl7ZXZlLmFwcGx5KG51bGwsW3QsbnVsbF0uY29uY2F0KGUpLmNvbmNhdChbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywwKSkpfX0sZXZlLnN0b3A9ZnVuY3Rpb24oKXtwPTF9LGV2ZS5udD1mdW5jdGlvbih0KXt2YXIgZT1tKGYpP2Yuam9pbihcIi5cIik6ZjtyZXR1cm4gdD9uZXcgUmVnRXhwKFwiKD86XFxcXC58XFxcXC98XilcIit0K1wiKD86XFxcXC58XFxcXC98JClcIikudGVzdChlKTplfSxldmUubnRzPWZ1bmN0aW9uKCl7cmV0dXJuIG0oZik/ZjpmLnNwbGl0KG8pfSxldmUub2ZmPWV2ZS51bmJpbmQ9ZnVuY3Rpb24odCxlKXtpZighdClyZXR1cm4gdm9pZChldmUuX2V2ZW50cz1kPXtuOnt9fSk7dmFyIHI9bSh0KT9tKHRbMF0pP3Q6W3RdOnkodCkuc3BsaXQobCk7aWYoci5sZW5ndGg+MSlmb3IodmFyIGk9MCxuPXIubGVuZ3RoO2k8bjtpKyspZXZlLm9mZihyW2ldLGUpO2Vsc2V7cj1tKHQpP3Q6eSh0KS5zcGxpdChvKTt2YXIgYSx1LGMsaSxuLGYscCxnPVtkXTtmb3IoaT0wLG49ci5sZW5ndGg7aTxuO2krKylmb3IoZj0wO2Y8Zy5sZW5ndGg7Zis9Yy5sZW5ndGgtMil7aWYoYz1bZiwxXSxhPWdbZl0ubixyW2ldIT1oKWFbcltpXV0mJmMucHVzaChhW3JbaV1dKTtlbHNlIGZvcih1IGluIGEpYVtzXSh1KSYmYy5wdXNoKGFbdV0pO2cuc3BsaWNlLmFwcGx5KGcsYyl9Zm9yKGk9MCxuPWcubGVuZ3RoO2k8bjtpKyspZm9yKGE9Z1tpXTthLm47KXtpZihlKXtpZihhLmYpe2ZvcihmPTAscD1hLmYubGVuZ3RoO2Y8cDtmKyspaWYoYS5mW2ZdPT1lKXthLmYuc3BsaWNlKGYsMSk7YnJlYWt9IWEuZi5sZW5ndGgmJmRlbGV0ZSBhLmZ9Zm9yKHUgaW4gYS5uKWlmKGEubltzXSh1KSYmYS5uW3VdLmYpe3ZhciB2PWEublt1XS5mO2ZvcihmPTAscD12Lmxlbmd0aDtmPHA7ZisrKWlmKHZbZl09PWUpe3Yuc3BsaWNlKGYsMSk7YnJlYWt9IXYubGVuZ3RoJiZkZWxldGUgYS5uW3VdLmZ9fWVsc2V7ZGVsZXRlIGEuZjtmb3IodSBpbiBhLm4pYS5uW3NdKHUpJiZhLm5bdV0uZiYmZGVsZXRlIGEublt1XS5mfWE9YS5ufX19LGV2ZS5vbmNlPWZ1bmN0aW9uKHQsZSl7dmFyIHI9ZnVuY3Rpb24oKXtyZXR1cm4gZXZlLm9mZih0LHIpLGUuYXBwbHkodGhpcyxhcmd1bWVudHMpfTtyZXR1cm4gZXZlLm9uKHQscil9LGV2ZS52ZXJzaW9uPWEsZXZlLnRvU3RyaW5nPWZ1bmN0aW9uKCl7cmV0dXJuXCJZb3UgYXJlIHJ1bm5pbmcgRXZlIFwiK2F9LFwidW5kZWZpbmVkXCIhPXR5cGVvZiB0JiZ0LmV4cG9ydHM/dC5leHBvcnRzPWV2ZTooaT1bXSxuPWZ1bmN0aW9uKCl7cmV0dXJuIGV2ZX0uYXBwbHkoZSxpKSwhKHZvaWQgMCE9PW4mJih0LmV4cG9ydHM9bikpKX0odGhpcyl9LGZ1bmN0aW9uKHQsZSxyKXt2YXIgaSxuO2k9W3IoMSldLG49ZnVuY3Rpb24odCl7aWYoIXR8fHQuc3ZnKXt2YXIgZT1cImhhc093blByb3BlcnR5XCIscj1TdHJpbmcsaT1wYXJzZUZsb2F0LG49cGFyc2VJbnQsYT1NYXRoLHM9YS5tYXgsbz1hLmFicyxsPWEucG93LGg9L1ssIF0rLyx1PXQuZXZlLGM9XCJcIixmPVwiIFwiLHA9XCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rXCIsZD17YmxvY2s6XCJNNSwwIDAsMi41IDUsNXpcIixjbGFzc2ljOlwiTTUsMCAwLDIuNSA1LDUgMy41LDMgMy41LDJ6XCIsZGlhbW9uZDpcIk0yLjUsMCA1LDIuNSAyLjUsNSAwLDIuNXpcIixvcGVuOlwiTTYsMSAxLDMuNSA2LDZcIixvdmFsOlwiTTIuNSwwQTIuNSwyLjUsMCwwLDEsMi41LDUgMi41LDIuNSwwLDAsMSwyLjUsMHpcIn0sZz17fTt0LnRvU3RyaW5nPWZ1bmN0aW9uKCl7cmV0dXJuXCJZb3VyIGJyb3dzZXIgc3VwcG9ydHMgU1ZHLlxcbllvdSBhcmUgcnVubmluZyBSYXBoYcOrbCBcIit0aGlzLnZlcnNpb259O3ZhciB2PWZ1bmN0aW9uKGksbil7aWYobil7XCJzdHJpbmdcIj09dHlwZW9mIGkmJihpPXYoaSkpO2Zvcih2YXIgYSBpbiBuKW5bZV0oYSkmJihcInhsaW5rOlwiPT1hLnN1YnN0cmluZygwLDYpP2kuc2V0QXR0cmlidXRlTlMocCxhLnN1YnN0cmluZyg2KSxyKG5bYV0pKTppLnNldEF0dHJpYnV0ZShhLHIoblthXSkpKX1lbHNlIGk9dC5fZy5kb2MuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIixpKSxpLnN0eWxlJiYoaS5zdHlsZS53ZWJraXRUYXBIaWdobGlnaHRDb2xvcj1cInJnYmEoMCwwLDAsMClcIik7cmV0dXJuIGl9LHg9ZnVuY3Rpb24oZSxuKXt2YXIgaD1cImxpbmVhclwiLHU9ZS5pZCtuLGY9LjUscD0uNSxkPWUubm9kZSxnPWUucGFwZXIseD1kLnN0eWxlLHk9dC5fZy5kb2MuZ2V0RWxlbWVudEJ5SWQodSk7aWYoIXkpe2lmKG49cihuKS5yZXBsYWNlKHQuX3JhZGlhbF9ncmFkaWVudCxmdW5jdGlvbih0LGUscil7aWYoaD1cInJhZGlhbFwiLGUmJnIpe2Y9aShlKSxwPWkocik7dmFyIG49MioocD4uNSktMTtsKGYtLjUsMikrbChwLS41LDIpPi4yNSYmKHA9YS5zcXJ0KC4yNS1sKGYtLjUsMikpKm4rLjUpJiYuNSE9cCYmKHA9cC50b0ZpeGVkKDUpLTFlLTUqbil9cmV0dXJuIGN9KSxuPW4uc3BsaXQoL1xccypcXC1cXHMqLyksXCJsaW5lYXJcIj09aCl7dmFyIGI9bi5zaGlmdCgpO2lmKGI9LWkoYiksaXNOYU4oYikpcmV0dXJuIG51bGw7dmFyIF89WzAsMCxhLmNvcyh0LnJhZChiKSksYS5zaW4odC5yYWQoYikpXSx3PTEvKHMobyhfWzJdKSxvKF9bM10pKXx8MSk7X1syXSo9dyxfWzNdKj13LF9bMl08MCYmKF9bMF09LV9bMl0sX1syXT0wKSxfWzNdPDAmJihfWzFdPS1fWzNdLF9bM109MCl9dmFyIGs9dC5fcGFyc2VEb3RzKG4pO2lmKCFrKXJldHVybiBudWxsO2lmKHU9dS5yZXBsYWNlKC9bXFwoXFwpXFxzLFxceGIwI10vZyxcIl9cIiksZS5ncmFkaWVudCYmdSE9ZS5ncmFkaWVudC5pZCYmKGcuZGVmcy5yZW1vdmVDaGlsZChlLmdyYWRpZW50KSxkZWxldGUgZS5ncmFkaWVudCksIWUuZ3JhZGllbnQpe3k9dihoK1wiR3JhZGllbnRcIix7aWQ6dX0pLGUuZ3JhZGllbnQ9eSx2KHksXCJyYWRpYWxcIj09aD97Zng6ZixmeTpwfTp7eDE6X1swXSx5MTpfWzFdLHgyOl9bMl0seTI6X1szXSxncmFkaWVudFRyYW5zZm9ybTplLm1hdHJpeC5pbnZlcnQoKX0pLGcuZGVmcy5hcHBlbmRDaGlsZCh5KTtmb3IodmFyIEI9MCxDPWsubGVuZ3RoO0I8QztCKyspeS5hcHBlbmRDaGlsZCh2KFwic3RvcFwiLHtvZmZzZXQ6a1tCXS5vZmZzZXQ/a1tCXS5vZmZzZXQ6Qj9cIjEwMCVcIjpcIjAlXCIsXCJzdG9wLWNvbG9yXCI6a1tCXS5jb2xvcnx8XCIjZmZmXCIsXCJzdG9wLW9wYWNpdHlcIjppc0Zpbml0ZShrW0JdLm9wYWNpdHkpP2tbQl0ub3BhY2l0eToxfSkpfX1yZXR1cm4gdihkLHtmaWxsOm0odSksb3BhY2l0eToxLFwiZmlsbC1vcGFjaXR5XCI6MX0pLHguZmlsbD1jLHgub3BhY2l0eT0xLHguZmlsbE9wYWNpdHk9MSwxfSx5PWZ1bmN0aW9uKCl7dmFyIHQ9ZG9jdW1lbnQuZG9jdW1lbnRNb2RlO3JldHVybiB0JiYoOT09PXR8fDEwPT09dCl9LG09ZnVuY3Rpb24odCl7aWYoeSgpKXJldHVyblwidXJsKCcjXCIrdCtcIicpXCI7dmFyIGU9ZG9jdW1lbnQubG9jYXRpb24scj1lLnByb3RvY29sK1wiLy9cIitlLmhvc3QrZS5wYXRobmFtZStlLnNlYXJjaDtyZXR1cm5cInVybCgnXCIrcitcIiNcIit0K1wiJylcIn0sYj1mdW5jdGlvbih0KXt2YXIgZT10LmdldEJCb3goMSk7dih0LnBhdHRlcm4se3BhdHRlcm5UcmFuc2Zvcm06dC5tYXRyaXguaW52ZXJ0KCkrXCIgdHJhbnNsYXRlKFwiK2UueCtcIixcIitlLnkrXCIpXCJ9KX0sXz1mdW5jdGlvbihpLG4sYSl7aWYoXCJwYXRoXCI9PWkudHlwZSl7Zm9yKHZhciBzPXIobikudG9Mb3dlckNhc2UoKS5zcGxpdChcIi1cIiksbz1pLnBhcGVyLGw9YT9cImVuZFwiOlwic3RhcnRcIixoPWkubm9kZSx1PWkuYXR0cnMsZj11W1wic3Ryb2tlLXdpZHRoXCJdLHA9cy5sZW5ndGgseD1cImNsYXNzaWNcIix5LG0sYixfLHcsaz0zLEI9MyxDPTU7cC0tOylzd2l0Y2goc1twXSl7Y2FzZVwiYmxvY2tcIjpjYXNlXCJjbGFzc2ljXCI6Y2FzZVwib3ZhbFwiOmNhc2VcImRpYW1vbmRcIjpjYXNlXCJvcGVuXCI6Y2FzZVwibm9uZVwiOng9c1twXTticmVhaztjYXNlXCJ3aWRlXCI6Qj01O2JyZWFrO2Nhc2VcIm5hcnJvd1wiOkI9MjticmVhaztjYXNlXCJsb25nXCI6az01O2JyZWFrO2Nhc2VcInNob3J0XCI6az0yfWlmKFwib3BlblwiPT14PyhrKz0yLEIrPTIsQys9MixiPTEsXz1hPzQ6MSx3PXtmaWxsOlwibm9uZVwiLHN0cm9rZTp1LnN0cm9rZX0pOihfPWI9ay8yLHc9e2ZpbGw6dS5zdHJva2Usc3Ryb2tlOlwibm9uZVwifSksaS5fLmFycm93cz9hPyhpLl8uYXJyb3dzLmVuZFBhdGgmJmdbaS5fLmFycm93cy5lbmRQYXRoXS0tLGkuXy5hcnJvd3MuZW5kTWFya2VyJiZnW2kuXy5hcnJvd3MuZW5kTWFya2VyXS0tKTooaS5fLmFycm93cy5zdGFydFBhdGgmJmdbaS5fLmFycm93cy5zdGFydFBhdGhdLS0saS5fLmFycm93cy5zdGFydE1hcmtlciYmZ1tpLl8uYXJyb3dzLnN0YXJ0TWFya2VyXS0tKTppLl8uYXJyb3dzPXt9LFwibm9uZVwiIT14KXt2YXIgUz1cInJhcGhhZWwtbWFya2VyLVwiK3gsQT1cInJhcGhhZWwtbWFya2VyLVwiK2wreCtrK0IrXCItb2JqXCIraS5pZDt0Ll9nLmRvYy5nZXRFbGVtZW50QnlJZChTKT9nW1NdKys6KG8uZGVmcy5hcHBlbmRDaGlsZCh2KHYoXCJwYXRoXCIpLHtcInN0cm9rZS1saW5lY2FwXCI6XCJyb3VuZFwiLGQ6ZFt4XSxpZDpTfSkpLGdbU109MSk7dmFyIFQ9dC5fZy5kb2MuZ2V0RWxlbWVudEJ5SWQoQSksRTtUPyhnW0FdKyssRT1ULmdldEVsZW1lbnRzQnlUYWdOYW1lKFwidXNlXCIpWzBdKTooVD12KHYoXCJtYXJrZXJcIikse2lkOkEsbWFya2VySGVpZ2h0OkIsbWFya2VyV2lkdGg6ayxvcmllbnQ6XCJhdXRvXCIscmVmWDpfLHJlZlk6Qi8yfSksRT12KHYoXCJ1c2VcIikse1wieGxpbms6aHJlZlwiOlwiI1wiK1MsdHJhbnNmb3JtOihhP1wicm90YXRlKDE4MCBcIitrLzIrXCIgXCIrQi8yK1wiKSBcIjpjKStcInNjYWxlKFwiK2svQytcIixcIitCL0MrXCIpXCIsXCJzdHJva2Utd2lkdGhcIjooMS8oKGsvQytCL0MpLzIpKS50b0ZpeGVkKDQpfSksVC5hcHBlbmRDaGlsZChFKSxvLmRlZnMuYXBwZW5kQ2hpbGQoVCksZ1tBXT0xKSx2KEUsdyk7dmFyIE09YiooXCJkaWFtb25kXCIhPXgmJlwib3ZhbFwiIT14KTthPyh5PWkuXy5hcnJvd3Muc3RhcnRkeCpmfHwwLG09dC5nZXRUb3RhbExlbmd0aCh1LnBhdGgpLU0qZik6KHk9TSpmLG09dC5nZXRUb3RhbExlbmd0aCh1LnBhdGgpLShpLl8uYXJyb3dzLmVuZGR4KmZ8fDApKSx3PXt9LHdbXCJtYXJrZXItXCIrbF09XCJ1cmwoI1wiK0ErXCIpXCIsKG18fHkpJiYody5kPXQuZ2V0U3VicGF0aCh1LnBhdGgseSxtKSksdihoLHcpLGkuXy5hcnJvd3NbbCtcIlBhdGhcIl09UyxpLl8uYXJyb3dzW2wrXCJNYXJrZXJcIl09QSxpLl8uYXJyb3dzW2wrXCJkeFwiXT1NLGkuXy5hcnJvd3NbbCtcIlR5cGVcIl09eCxpLl8uYXJyb3dzW2wrXCJTdHJpbmdcIl09bn1lbHNlIGE/KHk9aS5fLmFycm93cy5zdGFydGR4KmZ8fDAsbT10LmdldFRvdGFsTGVuZ3RoKHUucGF0aCkteSk6KHk9MCxtPXQuZ2V0VG90YWxMZW5ndGgodS5wYXRoKS0oaS5fLmFycm93cy5lbmRkeCpmfHwwKSksaS5fLmFycm93c1tsK1wiUGF0aFwiXSYmdihoLHtkOnQuZ2V0U3VicGF0aCh1LnBhdGgseSxtKX0pLGRlbGV0ZSBpLl8uYXJyb3dzW2wrXCJQYXRoXCJdLGRlbGV0ZSBpLl8uYXJyb3dzW2wrXCJNYXJrZXJcIl0sZGVsZXRlIGkuXy5hcnJvd3NbbCtcImR4XCJdLGRlbGV0ZSBpLl8uYXJyb3dzW2wrXCJUeXBlXCJdLGRlbGV0ZSBpLl8uYXJyb3dzW2wrXCJTdHJpbmdcIl07Zm9yKHcgaW4gZylpZihnW2VdKHcpJiYhZ1t3XSl7dmFyIE49dC5fZy5kb2MuZ2V0RWxlbWVudEJ5SWQodyk7TiYmTi5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKE4pfX19LHc9e1wiLVwiOlszLDFdLFwiLlwiOlsxLDFdLFwiLS5cIjpbMywxLDEsMV0sXCItLi5cIjpbMywxLDEsMSwxLDFdLFwiLiBcIjpbMSwzXSxcIi0gXCI6WzQsM10sXCItLVwiOls4LDNdLFwiLSAuXCI6WzQsMywxLDNdLFwiLS0uXCI6WzgsMywxLDNdLFwiLS0uLlwiOls4LDMsMSwzLDEsM119LGs9ZnVuY3Rpb24odCxlLGkpe2lmKGU9d1tyKGUpLnRvTG93ZXJDYXNlKCldKXtmb3IodmFyIG49dC5hdHRyc1tcInN0cm9rZS13aWR0aFwiXXx8XCIxXCIsYT17cm91bmQ6bixzcXVhcmU6bixidXR0OjB9W3QuYXR0cnNbXCJzdHJva2UtbGluZWNhcFwiXXx8aVtcInN0cm9rZS1saW5lY2FwXCJdXXx8MCxzPVtdLG89ZS5sZW5ndGg7by0tOylzW29dPWVbb10qbisobyUyPzE6LTEpKmE7dih0Lm5vZGUse1wic3Ryb2tlLWRhc2hhcnJheVwiOnMuam9pbihcIixcIil9KX1lbHNlIHYodC5ub2RlLHtcInN0cm9rZS1kYXNoYXJyYXlcIjpcIm5vbmVcIn0pfSxCPWZ1bmN0aW9uKGksYSl7dmFyIGw9aS5ub2RlLHU9aS5hdHRycyxmPWwuc3R5bGUudmlzaWJpbGl0eTtsLnN0eWxlLnZpc2liaWxpdHk9XCJoaWRkZW5cIjtmb3IodmFyIGQgaW4gYSlpZihhW2VdKGQpKXtpZighdC5fYXZhaWxhYmxlQXR0cnNbZV0oZCkpY29udGludWU7dmFyIGc9YVtkXTtzd2l0Y2godVtkXT1nLGQpe2Nhc2VcImJsdXJcIjppLmJsdXIoZyk7YnJlYWs7Y2FzZVwidGl0bGVcIjp2YXIgeT1sLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwidGl0bGVcIik7aWYoeS5sZW5ndGgmJih5PXlbMF0pKXkuZmlyc3RDaGlsZC5ub2RlVmFsdWU9ZztlbHNle3k9dihcInRpdGxlXCIpO3ZhciBtPXQuX2cuZG9jLmNyZWF0ZVRleHROb2RlKGcpO3kuYXBwZW5kQ2hpbGQobSksbC5hcHBlbmRDaGlsZCh5KX1icmVhaztjYXNlXCJocmVmXCI6Y2FzZVwidGFyZ2V0XCI6dmFyIHc9bC5wYXJlbnROb2RlO2lmKFwiYVwiIT13LnRhZ05hbWUudG9Mb3dlckNhc2UoKSl7dmFyIEI9dihcImFcIik7dy5pbnNlcnRCZWZvcmUoQixsKSxCLmFwcGVuZENoaWxkKGwpLHc9Qn1cInRhcmdldFwiPT1kP3cuc2V0QXR0cmlidXRlTlMocCxcInNob3dcIixcImJsYW5rXCI9PWc/XCJuZXdcIjpnKTp3LnNldEF0dHJpYnV0ZU5TKHAsZCxnKTticmVhaztjYXNlXCJjdXJzb3JcIjpsLnN0eWxlLmN1cnNvcj1nO2JyZWFrO2Nhc2VcInRyYW5zZm9ybVwiOmkudHJhbnNmb3JtKGcpO2JyZWFrO2Nhc2VcImFycm93LXN0YXJ0XCI6XyhpLGcpO2JyZWFrO2Nhc2VcImFycm93LWVuZFwiOl8oaSxnLDEpO2JyZWFrO2Nhc2VcImNsaXAtcmVjdFwiOnZhciBDPXIoZykuc3BsaXQoaCk7aWYoND09Qy5sZW5ndGgpe2kuY2xpcCYmaS5jbGlwLnBhcmVudE5vZGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChpLmNsaXAucGFyZW50Tm9kZSk7dmFyIEE9dihcImNsaXBQYXRoXCIpLFQ9dihcInJlY3RcIik7QS5pZD10LmNyZWF0ZVVVSUQoKSx2KFQse3g6Q1swXSx5OkNbMV0sd2lkdGg6Q1syXSxoZWlnaHQ6Q1szXX0pLEEuYXBwZW5kQ2hpbGQoVCksaS5wYXBlci5kZWZzLmFwcGVuZENoaWxkKEEpLHYobCx7XCJjbGlwLXBhdGhcIjpcInVybCgjXCIrQS5pZCtcIilcIn0pLGkuY2xpcD1UfWlmKCFnKXt2YXIgRT1sLmdldEF0dHJpYnV0ZShcImNsaXAtcGF0aFwiKTtpZihFKXt2YXIgTT10Ll9nLmRvYy5nZXRFbGVtZW50QnlJZChFLnJlcGxhY2UoLyhedXJsXFwoI3xcXCkkKS9nLGMpKTtNJiZNLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoTSksdihsLHtcImNsaXAtcGF0aFwiOmN9KSxkZWxldGUgaS5jbGlwfX1icmVhaztjYXNlXCJwYXRoXCI6XCJwYXRoXCI9PWkudHlwZSYmKHYobCx7ZDpnP3UucGF0aD10Ll9wYXRoVG9BYnNvbHV0ZShnKTpcIk0wLDBcIn0pLGkuXy5kaXJ0eT0xLGkuXy5hcnJvd3MmJihcInN0YXJ0U3RyaW5nXCJpbiBpLl8uYXJyb3dzJiZfKGksaS5fLmFycm93cy5zdGFydFN0cmluZyksXCJlbmRTdHJpbmdcImluIGkuXy5hcnJvd3MmJl8oaSxpLl8uYXJyb3dzLmVuZFN0cmluZywxKSkpO2JyZWFrO2Nhc2VcIndpZHRoXCI6aWYobC5zZXRBdHRyaWJ1dGUoZCxnKSxpLl8uZGlydHk9MSwhdS5meClicmVhaztkPVwieFwiLGc9dS54O2Nhc2VcInhcIjp1LmZ4JiYoZz0tdS54LSh1LndpZHRofHwwKSk7Y2FzZVwicnhcIjppZihcInJ4XCI9PWQmJlwicmVjdFwiPT1pLnR5cGUpYnJlYWs7Y2FzZVwiY3hcIjpsLnNldEF0dHJpYnV0ZShkLGcpLGkucGF0dGVybiYmYihpKSxpLl8uZGlydHk9MTticmVhaztjYXNlXCJoZWlnaHRcIjppZihsLnNldEF0dHJpYnV0ZShkLGcpLGkuXy5kaXJ0eT0xLCF1LmZ5KWJyZWFrO2Q9XCJ5XCIsZz11Lnk7Y2FzZVwieVwiOnUuZnkmJihnPS11LnktKHUuaGVpZ2h0fHwwKSk7Y2FzZVwicnlcIjppZihcInJ5XCI9PWQmJlwicmVjdFwiPT1pLnR5cGUpYnJlYWs7Y2FzZVwiY3lcIjpsLnNldEF0dHJpYnV0ZShkLGcpLGkucGF0dGVybiYmYihpKSxpLl8uZGlydHk9MTticmVhaztjYXNlXCJyXCI6XCJyZWN0XCI9PWkudHlwZT92KGwse3J4Omcscnk6Z30pOmwuc2V0QXR0cmlidXRlKGQsZyksaS5fLmRpcnR5PTE7YnJlYWs7Y2FzZVwic3JjXCI6XCJpbWFnZVwiPT1pLnR5cGUmJmwuc2V0QXR0cmlidXRlTlMocCxcImhyZWZcIixnKTticmVhaztjYXNlXCJzdHJva2Utd2lkdGhcIjoxPT1pLl8uc3gmJjE9PWkuXy5zeXx8KGcvPXMobyhpLl8uc3gpLG8oaS5fLnN5KSl8fDEpLGwuc2V0QXR0cmlidXRlKGQsZyksdVtcInN0cm9rZS1kYXNoYXJyYXlcIl0mJmsoaSx1W1wic3Ryb2tlLWRhc2hhcnJheVwiXSxhKSxcbmkuXy5hcnJvd3MmJihcInN0YXJ0U3RyaW5nXCJpbiBpLl8uYXJyb3dzJiZfKGksaS5fLmFycm93cy5zdGFydFN0cmluZyksXCJlbmRTdHJpbmdcImluIGkuXy5hcnJvd3MmJl8oaSxpLl8uYXJyb3dzLmVuZFN0cmluZywxKSk7YnJlYWs7Y2FzZVwic3Ryb2tlLWRhc2hhcnJheVwiOmsoaSxnLGEpO2JyZWFrO2Nhc2VcImZpbGxcIjp2YXIgTj1yKGcpLm1hdGNoKHQuX0lTVVJMKTtpZihOKXtBPXYoXCJwYXR0ZXJuXCIpO3ZhciBMPXYoXCJpbWFnZVwiKTtBLmlkPXQuY3JlYXRlVVVJRCgpLHYoQSx7eDowLHk6MCxwYXR0ZXJuVW5pdHM6XCJ1c2VyU3BhY2VPblVzZVwiLGhlaWdodDoxLHdpZHRoOjF9KSx2KEwse3g6MCx5OjAsXCJ4bGluazpocmVmXCI6TlsxXX0pLEEuYXBwZW5kQ2hpbGQoTCksZnVuY3Rpb24oZSl7dC5fcHJlbG9hZChOWzFdLGZ1bmN0aW9uKCl7dmFyIHQ9dGhpcy5vZmZzZXRXaWR0aCxyPXRoaXMub2Zmc2V0SGVpZ2h0O3YoZSx7d2lkdGg6dCxoZWlnaHQ6cn0pLHYoTCx7d2lkdGg6dCxoZWlnaHQ6cn0pfSl9KEEpLGkucGFwZXIuZGVmcy5hcHBlbmRDaGlsZChBKSx2KGwse2ZpbGw6XCJ1cmwoI1wiK0EuaWQrXCIpXCJ9KSxpLnBhdHRlcm49QSxpLnBhdHRlcm4mJmIoaSk7YnJlYWt9dmFyIHo9dC5nZXRSR0IoZyk7aWYoei5lcnJvcil7aWYoKFwiY2lyY2xlXCI9PWkudHlwZXx8XCJlbGxpcHNlXCI9PWkudHlwZXx8XCJyXCIhPXIoZykuY2hhckF0KCkpJiZ4KGksZykpe2lmKFwib3BhY2l0eVwiaW4gdXx8XCJmaWxsLW9wYWNpdHlcImluIHUpe3ZhciBQPXQuX2cuZG9jLmdldEVsZW1lbnRCeUlkKGwuZ2V0QXR0cmlidXRlKFwiZmlsbFwiKS5yZXBsYWNlKC9edXJsXFwoI3xcXCkkL2csYykpO2lmKFApe3ZhciBGPVAuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJzdG9wXCIpO3YoRltGLmxlbmd0aC0xXSx7XCJzdG9wLW9wYWNpdHlcIjooXCJvcGFjaXR5XCJpbiB1P3Uub3BhY2l0eToxKSooXCJmaWxsLW9wYWNpdHlcImluIHU/dVtcImZpbGwtb3BhY2l0eVwiXToxKX0pfX11LmdyYWRpZW50PWcsdS5maWxsPVwibm9uZVwiO2JyZWFrfX1lbHNlIGRlbGV0ZSBhLmdyYWRpZW50LGRlbGV0ZSB1LmdyYWRpZW50LCF0LmlzKHUub3BhY2l0eSxcInVuZGVmaW5lZFwiKSYmdC5pcyhhLm9wYWNpdHksXCJ1bmRlZmluZWRcIikmJnYobCx7b3BhY2l0eTp1Lm9wYWNpdHl9KSwhdC5pcyh1W1wiZmlsbC1vcGFjaXR5XCJdLFwidW5kZWZpbmVkXCIpJiZ0LmlzKGFbXCJmaWxsLW9wYWNpdHlcIl0sXCJ1bmRlZmluZWRcIikmJnYobCx7XCJmaWxsLW9wYWNpdHlcIjp1W1wiZmlsbC1vcGFjaXR5XCJdfSk7eltlXShcIm9wYWNpdHlcIikmJnYobCx7XCJmaWxsLW9wYWNpdHlcIjp6Lm9wYWNpdHk+MT96Lm9wYWNpdHkvMTAwOnoub3BhY2l0eX0pO2Nhc2VcInN0cm9rZVwiOno9dC5nZXRSR0IoZyksbC5zZXRBdHRyaWJ1dGUoZCx6LmhleCksXCJzdHJva2VcIj09ZCYmeltlXShcIm9wYWNpdHlcIikmJnYobCx7XCJzdHJva2Utb3BhY2l0eVwiOnoub3BhY2l0eT4xP3oub3BhY2l0eS8xMDA6ei5vcGFjaXR5fSksXCJzdHJva2VcIj09ZCYmaS5fLmFycm93cyYmKFwic3RhcnRTdHJpbmdcImluIGkuXy5hcnJvd3MmJl8oaSxpLl8uYXJyb3dzLnN0YXJ0U3RyaW5nKSxcImVuZFN0cmluZ1wiaW4gaS5fLmFycm93cyYmXyhpLGkuXy5hcnJvd3MuZW5kU3RyaW5nLDEpKTticmVhaztjYXNlXCJncmFkaWVudFwiOihcImNpcmNsZVwiPT1pLnR5cGV8fFwiZWxsaXBzZVwiPT1pLnR5cGV8fFwiclwiIT1yKGcpLmNoYXJBdCgpKSYmeChpLGcpO2JyZWFrO2Nhc2VcIm9wYWNpdHlcIjp1LmdyYWRpZW50JiYhdVtlXShcInN0cm9rZS1vcGFjaXR5XCIpJiZ2KGwse1wic3Ryb2tlLW9wYWNpdHlcIjpnPjE/Zy8xMDA6Z30pO2Nhc2VcImZpbGwtb3BhY2l0eVwiOmlmKHUuZ3JhZGllbnQpe1A9dC5fZy5kb2MuZ2V0RWxlbWVudEJ5SWQobC5nZXRBdHRyaWJ1dGUoXCJmaWxsXCIpLnJlcGxhY2UoL151cmxcXCgjfFxcKSQvZyxjKSksUCYmKEY9UC5nZXRFbGVtZW50c0J5VGFnTmFtZShcInN0b3BcIiksdihGW0YubGVuZ3RoLTFdLHtcInN0b3Atb3BhY2l0eVwiOmd9KSk7YnJlYWt9ZGVmYXVsdDpcImZvbnQtc2l6ZVwiPT1kJiYoZz1uKGcsMTApK1wicHhcIik7dmFyIFI9ZC5yZXBsYWNlKC8oXFwtLikvZyxmdW5jdGlvbih0KXtyZXR1cm4gdC5zdWJzdHJpbmcoMSkudG9VcHBlckNhc2UoKX0pO2wuc3R5bGVbUl09ZyxpLl8uZGlydHk9MSxsLnNldEF0dHJpYnV0ZShkLGcpfX1TKGksYSksbC5zdHlsZS52aXNpYmlsaXR5PWZ9LEM9MS4yLFM9ZnVuY3Rpb24oaSxhKXtpZihcInRleHRcIj09aS50eXBlJiYoYVtlXShcInRleHRcIil8fGFbZV0oXCJmb250XCIpfHxhW2VdKFwiZm9udC1zaXplXCIpfHxhW2VdKFwieFwiKXx8YVtlXShcInlcIikpKXt2YXIgcz1pLmF0dHJzLG89aS5ub2RlLGw9by5maXJzdENoaWxkP24odC5fZy5kb2MuZGVmYXVsdFZpZXcuZ2V0Q29tcHV0ZWRTdHlsZShvLmZpcnN0Q2hpbGQsYykuZ2V0UHJvcGVydHlWYWx1ZShcImZvbnQtc2l6ZVwiKSwxMCk6MTA7aWYoYVtlXShcInRleHRcIikpe2ZvcihzLnRleHQ9YS50ZXh0O28uZmlyc3RDaGlsZDspby5yZW1vdmVDaGlsZChvLmZpcnN0Q2hpbGQpO2Zvcih2YXIgaD1yKGEudGV4dCkuc3BsaXQoXCJcXG5cIiksdT1bXSxmLHA9MCxkPWgubGVuZ3RoO3A8ZDtwKyspZj12KFwidHNwYW5cIikscCYmdihmLHtkeTpsKkMseDpzLnh9KSxmLmFwcGVuZENoaWxkKHQuX2cuZG9jLmNyZWF0ZVRleHROb2RlKGhbcF0pKSxvLmFwcGVuZENoaWxkKGYpLHVbcF09Zn1lbHNlIGZvcih1PW8uZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJ0c3BhblwiKSxwPTAsZD11Lmxlbmd0aDtwPGQ7cCsrKXA/dih1W3BdLHtkeTpsKkMseDpzLnh9KTp2KHVbMF0se2R5OjB9KTt2KG8se3g6cy54LHk6cy55fSksaS5fLmRpcnR5PTE7dmFyIGc9aS5fZ2V0QkJveCgpLHg9cy55LShnLnkrZy5oZWlnaHQvMik7eCYmdC5pcyh4LFwiZmluaXRlXCIpJiZ2KHVbMF0se2R5Onh9KX19LEE9ZnVuY3Rpb24odCl7cmV0dXJuIHQucGFyZW50Tm9kZSYmXCJhXCI9PT10LnBhcmVudE5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpP3QucGFyZW50Tm9kZTp0fSxUPWZ1bmN0aW9uKGUscil7ZnVuY3Rpb24gaSgpe3JldHVybihcIjAwMDBcIisoTWF0aC5yYW5kb20oKSpNYXRoLnBvdygzNiw1KTw8MCkudG9TdHJpbmcoMzYpKS5zbGljZSgtNSl9dmFyIG49MCxhPTA7dGhpc1swXT10aGlzLm5vZGU9ZSxlLnJhcGhhZWw9ITAsdGhpcy5pZD1pKCksZS5yYXBoYWVsaWQ9dGhpcy5pZCx0aGlzLm1hdHJpeD10Lm1hdHJpeCgpLHRoaXMucmVhbFBhdGg9bnVsbCx0aGlzLnBhcGVyPXIsdGhpcy5hdHRycz10aGlzLmF0dHJzfHx7fSx0aGlzLl89e3RyYW5zZm9ybTpbXSxzeDoxLHN5OjEsZGVnOjAsZHg6MCxkeTowLGRpcnR5OjF9LCFyLmJvdHRvbSYmKHIuYm90dG9tPXRoaXMpLHRoaXMucHJldj1yLnRvcCxyLnRvcCYmKHIudG9wLm5leHQ9dGhpcyksci50b3A9dGhpcyx0aGlzLm5leHQ9bnVsbH0sRT10LmVsO1QucHJvdG90eXBlPUUsRS5jb25zdHJ1Y3Rvcj1ULHQuX2VuZ2luZS5wYXRoPWZ1bmN0aW9uKHQsZSl7dmFyIHI9dihcInBhdGhcIik7ZS5jYW52YXMmJmUuY2FudmFzLmFwcGVuZENoaWxkKHIpO3ZhciBpPW5ldyBUKHIsZSk7cmV0dXJuIGkudHlwZT1cInBhdGhcIixCKGkse2ZpbGw6XCJub25lXCIsc3Ryb2tlOlwiIzAwMFwiLHBhdGg6dH0pLGl9LEUucm90YXRlPWZ1bmN0aW9uKHQsZSxuKXtpZih0aGlzLnJlbW92ZWQpcmV0dXJuIHRoaXM7aWYodD1yKHQpLnNwbGl0KGgpLHQubGVuZ3RoLTEmJihlPWkodFsxXSksbj1pKHRbMl0pKSx0PWkodFswXSksbnVsbD09biYmKGU9biksbnVsbD09ZXx8bnVsbD09bil7dmFyIGE9dGhpcy5nZXRCQm94KDEpO2U9YS54K2Eud2lkdGgvMixuPWEueSthLmhlaWdodC8yfXJldHVybiB0aGlzLnRyYW5zZm9ybSh0aGlzLl8udHJhbnNmb3JtLmNvbmNhdChbW1wiclwiLHQsZSxuXV0pKSx0aGlzfSxFLnNjYWxlPWZ1bmN0aW9uKHQsZSxuLGEpe2lmKHRoaXMucmVtb3ZlZClyZXR1cm4gdGhpcztpZih0PXIodCkuc3BsaXQoaCksdC5sZW5ndGgtMSYmKGU9aSh0WzFdKSxuPWkodFsyXSksYT1pKHRbM10pKSx0PWkodFswXSksbnVsbD09ZSYmKGU9dCksbnVsbD09YSYmKG49YSksbnVsbD09bnx8bnVsbD09YSl2YXIgcz10aGlzLmdldEJCb3goMSk7cmV0dXJuIG49bnVsbD09bj9zLngrcy53aWR0aC8yOm4sYT1udWxsPT1hP3MueStzLmhlaWdodC8yOmEsdGhpcy50cmFuc2Zvcm0odGhpcy5fLnRyYW5zZm9ybS5jb25jYXQoW1tcInNcIix0LGUsbixhXV0pKSx0aGlzfSxFLnRyYW5zbGF0ZT1mdW5jdGlvbih0LGUpe3JldHVybiB0aGlzLnJlbW92ZWQ/dGhpczoodD1yKHQpLnNwbGl0KGgpLHQubGVuZ3RoLTEmJihlPWkodFsxXSkpLHQ9aSh0WzBdKXx8MCxlPStlfHwwLHRoaXMudHJhbnNmb3JtKHRoaXMuXy50cmFuc2Zvcm0uY29uY2F0KFtbXCJ0XCIsdCxlXV0pKSx0aGlzKX0sRS50cmFuc2Zvcm09ZnVuY3Rpb24ocil7dmFyIGk9dGhpcy5fO2lmKG51bGw9PXIpcmV0dXJuIGkudHJhbnNmb3JtO2lmKHQuX2V4dHJhY3RUcmFuc2Zvcm0odGhpcyxyKSx0aGlzLmNsaXAmJnYodGhpcy5jbGlwLHt0cmFuc2Zvcm06dGhpcy5tYXRyaXguaW52ZXJ0KCl9KSx0aGlzLnBhdHRlcm4mJmIodGhpcyksdGhpcy5ub2RlJiZ2KHRoaXMubm9kZSx7dHJhbnNmb3JtOnRoaXMubWF0cml4fSksMSE9aS5zeHx8MSE9aS5zeSl7dmFyIG49dGhpcy5hdHRyc1tlXShcInN0cm9rZS13aWR0aFwiKT90aGlzLmF0dHJzW1wic3Ryb2tlLXdpZHRoXCJdOjE7dGhpcy5hdHRyKHtcInN0cm9rZS13aWR0aFwiOm59KX1yZXR1cm4gdGhpc30sRS5oaWRlPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMucmVtb3ZlZHx8KHRoaXMubm9kZS5zdHlsZS5kaXNwbGF5PVwibm9uZVwiKSx0aGlzfSxFLnNob3c9ZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5yZW1vdmVkfHwodGhpcy5ub2RlLnN0eWxlLmRpc3BsYXk9XCJcIiksdGhpc30sRS5yZW1vdmU9ZnVuY3Rpb24oKXt2YXIgZT1BKHRoaXMubm9kZSk7aWYoIXRoaXMucmVtb3ZlZCYmZS5wYXJlbnROb2RlKXt2YXIgcj10aGlzLnBhcGVyO3IuX19zZXRfXyYmci5fX3NldF9fLmV4Y2x1ZGUodGhpcyksdS51bmJpbmQoXCJyYXBoYWVsLiouKi5cIit0aGlzLmlkKSx0aGlzLmdyYWRpZW50JiZyLmRlZnMucmVtb3ZlQ2hpbGQodGhpcy5ncmFkaWVudCksdC5fdGVhcih0aGlzLHIpLGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChlKSx0aGlzLnJlbW92ZURhdGEoKTtmb3IodmFyIGkgaW4gdGhpcyl0aGlzW2ldPVwiZnVuY3Rpb25cIj09dHlwZW9mIHRoaXNbaV0/dC5fcmVtb3ZlZEZhY3RvcnkoaSk6bnVsbDt0aGlzLnJlbW92ZWQ9ITB9fSxFLl9nZXRCQm94PWZ1bmN0aW9uKCl7aWYoXCJub25lXCI9PXRoaXMubm9kZS5zdHlsZS5kaXNwbGF5KXt0aGlzLnNob3coKTt2YXIgdD0hMH12YXIgZT0hMSxyO3RoaXMucGFwZXIuY2FudmFzLnBhcmVudEVsZW1lbnQ/cj10aGlzLnBhcGVyLmNhbnZhcy5wYXJlbnRFbGVtZW50LnN0eWxlOnRoaXMucGFwZXIuY2FudmFzLnBhcmVudE5vZGUmJihyPXRoaXMucGFwZXIuY2FudmFzLnBhcmVudE5vZGUuc3R5bGUpLHImJlwibm9uZVwiPT1yLmRpc3BsYXkmJihlPSEwLHIuZGlzcGxheT1cIlwiKTt2YXIgaT17fTt0cnl7aT10aGlzLm5vZGUuZ2V0QkJveCgpfWNhdGNoKG4pe2k9e3g6dGhpcy5ub2RlLmNsaWVudExlZnQseTp0aGlzLm5vZGUuY2xpZW50VG9wLHdpZHRoOnRoaXMubm9kZS5jbGllbnRXaWR0aCxoZWlnaHQ6dGhpcy5ub2RlLmNsaWVudEhlaWdodH19ZmluYWxseXtpPWl8fHt9LGUmJihyLmRpc3BsYXk9XCJub25lXCIpfXJldHVybiB0JiZ0aGlzLmhpZGUoKSxpfSxFLmF0dHI9ZnVuY3Rpb24ocixpKXtpZih0aGlzLnJlbW92ZWQpcmV0dXJuIHRoaXM7aWYobnVsbD09cil7dmFyIG49e307Zm9yKHZhciBhIGluIHRoaXMuYXR0cnMpdGhpcy5hdHRyc1tlXShhKSYmKG5bYV09dGhpcy5hdHRyc1thXSk7cmV0dXJuIG4uZ3JhZGllbnQmJlwibm9uZVwiPT1uLmZpbGwmJihuLmZpbGw9bi5ncmFkaWVudCkmJmRlbGV0ZSBuLmdyYWRpZW50LG4udHJhbnNmb3JtPXRoaXMuXy50cmFuc2Zvcm0sbn1pZihudWxsPT1pJiZ0LmlzKHIsXCJzdHJpbmdcIikpe2lmKFwiZmlsbFwiPT1yJiZcIm5vbmVcIj09dGhpcy5hdHRycy5maWxsJiZ0aGlzLmF0dHJzLmdyYWRpZW50KXJldHVybiB0aGlzLmF0dHJzLmdyYWRpZW50O2lmKFwidHJhbnNmb3JtXCI9PXIpcmV0dXJuIHRoaXMuXy50cmFuc2Zvcm07Zm9yKHZhciBzPXIuc3BsaXQoaCksbz17fSxsPTAsYz1zLmxlbmd0aDtsPGM7bCsrKXI9c1tsXSxyIGluIHRoaXMuYXR0cnM/b1tyXT10aGlzLmF0dHJzW3JdOnQuaXModGhpcy5wYXBlci5jdXN0b21BdHRyaWJ1dGVzW3JdLFwiZnVuY3Rpb25cIik/b1tyXT10aGlzLnBhcGVyLmN1c3RvbUF0dHJpYnV0ZXNbcl0uZGVmOm9bcl09dC5fYXZhaWxhYmxlQXR0cnNbcl07cmV0dXJuIGMtMT9vOm9bc1swXV19aWYobnVsbD09aSYmdC5pcyhyLFwiYXJyYXlcIikpe2ZvcihvPXt9LGw9MCxjPXIubGVuZ3RoO2w8YztsKyspb1tyW2xdXT10aGlzLmF0dHIocltsXSk7cmV0dXJuIG99aWYobnVsbCE9aSl7dmFyIGY9e307ZltyXT1pfWVsc2UgbnVsbCE9ciYmdC5pcyhyLFwib2JqZWN0XCIpJiYoZj1yKTtmb3IodmFyIHAgaW4gZil1KFwicmFwaGFlbC5hdHRyLlwiK3ArXCIuXCIrdGhpcy5pZCx0aGlzLGZbcF0pO2ZvcihwIGluIHRoaXMucGFwZXIuY3VzdG9tQXR0cmlidXRlcylpZih0aGlzLnBhcGVyLmN1c3RvbUF0dHJpYnV0ZXNbZV0ocCkmJmZbZV0ocCkmJnQuaXModGhpcy5wYXBlci5jdXN0b21BdHRyaWJ1dGVzW3BdLFwiZnVuY3Rpb25cIikpe3ZhciBkPXRoaXMucGFwZXIuY3VzdG9tQXR0cmlidXRlc1twXS5hcHBseSh0aGlzLFtdLmNvbmNhdChmW3BdKSk7dGhpcy5hdHRyc1twXT1mW3BdO2Zvcih2YXIgZyBpbiBkKWRbZV0oZykmJihmW2ddPWRbZ10pfXJldHVybiBCKHRoaXMsZiksdGhpc30sRS50b0Zyb250PWZ1bmN0aW9uKCl7aWYodGhpcy5yZW1vdmVkKXJldHVybiB0aGlzO3ZhciBlPUEodGhpcy5ub2RlKTtlLnBhcmVudE5vZGUuYXBwZW5kQ2hpbGQoZSk7dmFyIHI9dGhpcy5wYXBlcjtyZXR1cm4gci50b3AhPXRoaXMmJnQuX3RvZnJvbnQodGhpcyxyKSx0aGlzfSxFLnRvQmFjaz1mdW5jdGlvbigpe2lmKHRoaXMucmVtb3ZlZClyZXR1cm4gdGhpczt2YXIgZT1BKHRoaXMubm9kZSkscj1lLnBhcmVudE5vZGU7ci5pbnNlcnRCZWZvcmUoZSxyLmZpcnN0Q2hpbGQpLHQuX3RvYmFjayh0aGlzLHRoaXMucGFwZXIpO3ZhciBpPXRoaXMucGFwZXI7cmV0dXJuIHRoaXN9LEUuaW5zZXJ0QWZ0ZXI9ZnVuY3Rpb24oZSl7aWYodGhpcy5yZW1vdmVkfHwhZSlyZXR1cm4gdGhpczt2YXIgcj1BKHRoaXMubm9kZSksaT1BKGUubm9kZXx8ZVtlLmxlbmd0aC0xXS5ub2RlKTtyZXR1cm4gaS5uZXh0U2libGluZz9pLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHIsaS5uZXh0U2libGluZyk6aS5wYXJlbnROb2RlLmFwcGVuZENoaWxkKHIpLHQuX2luc2VydGFmdGVyKHRoaXMsZSx0aGlzLnBhcGVyKSx0aGlzfSxFLmluc2VydEJlZm9yZT1mdW5jdGlvbihlKXtpZih0aGlzLnJlbW92ZWR8fCFlKXJldHVybiB0aGlzO3ZhciByPUEodGhpcy5ub2RlKSxpPUEoZS5ub2RlfHxlWzBdLm5vZGUpO3JldHVybiBpLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHIsaSksdC5faW5zZXJ0YmVmb3JlKHRoaXMsZSx0aGlzLnBhcGVyKSx0aGlzfSxFLmJsdXI9ZnVuY3Rpb24oZSl7dmFyIHI9dGhpcztpZigwIT09K2Upe3ZhciBpPXYoXCJmaWx0ZXJcIiksbj12KFwiZmVHYXVzc2lhbkJsdXJcIik7ci5hdHRycy5ibHVyPWUsaS5pZD10LmNyZWF0ZVVVSUQoKSx2KG4se3N0ZERldmlhdGlvbjorZXx8MS41fSksaS5hcHBlbmRDaGlsZChuKSxyLnBhcGVyLmRlZnMuYXBwZW5kQ2hpbGQoaSksci5fYmx1cj1pLHYoci5ub2RlLHtmaWx0ZXI6XCJ1cmwoI1wiK2kuaWQrXCIpXCJ9KX1lbHNlIHIuX2JsdXImJihyLl9ibHVyLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoci5fYmx1ciksZGVsZXRlIHIuX2JsdXIsZGVsZXRlIHIuYXR0cnMuYmx1ciksci5ub2RlLnJlbW92ZUF0dHJpYnV0ZShcImZpbHRlclwiKTtyZXR1cm4gcn0sdC5fZW5naW5lLmNpcmNsZT1mdW5jdGlvbih0LGUscixpKXt2YXIgbj12KFwiY2lyY2xlXCIpO3QuY2FudmFzJiZ0LmNhbnZhcy5hcHBlbmRDaGlsZChuKTt2YXIgYT1uZXcgVChuLHQpO3JldHVybiBhLmF0dHJzPXtjeDplLGN5OnIscjppLGZpbGw6XCJub25lXCIsc3Ryb2tlOlwiIzAwMFwifSxhLnR5cGU9XCJjaXJjbGVcIix2KG4sYS5hdHRycyksYX0sdC5fZW5naW5lLnJlY3Q9ZnVuY3Rpb24odCxlLHIsaSxuLGEpe3ZhciBzPXYoXCJyZWN0XCIpO3QuY2FudmFzJiZ0LmNhbnZhcy5hcHBlbmRDaGlsZChzKTt2YXIgbz1uZXcgVChzLHQpO3JldHVybiBvLmF0dHJzPXt4OmUseTpyLHdpZHRoOmksaGVpZ2h0Om4scng6YXx8MCxyeTphfHwwLGZpbGw6XCJub25lXCIsc3Ryb2tlOlwiIzAwMFwifSxvLnR5cGU9XCJyZWN0XCIsdihzLG8uYXR0cnMpLG99LHQuX2VuZ2luZS5lbGxpcHNlPWZ1bmN0aW9uKHQsZSxyLGksbil7dmFyIGE9dihcImVsbGlwc2VcIik7dC5jYW52YXMmJnQuY2FudmFzLmFwcGVuZENoaWxkKGEpO3ZhciBzPW5ldyBUKGEsdCk7cmV0dXJuIHMuYXR0cnM9e2N4OmUsY3k6cixyeDppLHJ5Om4sZmlsbDpcIm5vbmVcIixzdHJva2U6XCIjMDAwXCJ9LHMudHlwZT1cImVsbGlwc2VcIix2KGEscy5hdHRycyksc30sdC5fZW5naW5lLmltYWdlPWZ1bmN0aW9uKHQsZSxyLGksbixhKXt2YXIgcz12KFwiaW1hZ2VcIik7dihzLHt4OnIseTppLHdpZHRoOm4saGVpZ2h0OmEscHJlc2VydmVBc3BlY3RSYXRpbzpcIm5vbmVcIn0pLHMuc2V0QXR0cmlidXRlTlMocCxcImhyZWZcIixlKSx0LmNhbnZhcyYmdC5jYW52YXMuYXBwZW5kQ2hpbGQocyk7dmFyIG89bmV3IFQocyx0KTtyZXR1cm4gby5hdHRycz17eDpyLHk6aSx3aWR0aDpuLGhlaWdodDphLHNyYzplfSxvLnR5cGU9XCJpbWFnZVwiLG99LHQuX2VuZ2luZS50ZXh0PWZ1bmN0aW9uKGUscixpLG4pe3ZhciBhPXYoXCJ0ZXh0XCIpO2UuY2FudmFzJiZlLmNhbnZhcy5hcHBlbmRDaGlsZChhKTt2YXIgcz1uZXcgVChhLGUpO3JldHVybiBzLmF0dHJzPXt4OnIseTppLFwidGV4dC1hbmNob3JcIjpcIm1pZGRsZVwiLHRleHQ6bixcImZvbnQtZmFtaWx5XCI6dC5fYXZhaWxhYmxlQXR0cnNbXCJmb250LWZhbWlseVwiXSxcImZvbnQtc2l6ZVwiOnQuX2F2YWlsYWJsZUF0dHJzW1wiZm9udC1zaXplXCJdLHN0cm9rZTpcIm5vbmVcIixmaWxsOlwiIzAwMFwifSxzLnR5cGU9XCJ0ZXh0XCIsQihzLHMuYXR0cnMpLHN9LHQuX2VuZ2luZS5zZXRTaXplPWZ1bmN0aW9uKHQsZSl7cmV0dXJuIHRoaXMud2lkdGg9dHx8dGhpcy53aWR0aCx0aGlzLmhlaWdodD1lfHx0aGlzLmhlaWdodCx0aGlzLmNhbnZhcy5zZXRBdHRyaWJ1dGUoXCJ3aWR0aFwiLHRoaXMud2lkdGgpLHRoaXMuY2FudmFzLnNldEF0dHJpYnV0ZShcImhlaWdodFwiLHRoaXMuaGVpZ2h0KSx0aGlzLl92aWV3Qm94JiZ0aGlzLnNldFZpZXdCb3guYXBwbHkodGhpcyx0aGlzLl92aWV3Qm94KSx0aGlzfSx0Ll9lbmdpbmUuY3JlYXRlPWZ1bmN0aW9uKCl7dmFyIGU9dC5fZ2V0Q29udGFpbmVyLmFwcGx5KDAsYXJndW1lbnRzKSxyPWUmJmUuY29udGFpbmVyLGk9ZS54LG49ZS55LGE9ZS53aWR0aCxzPWUuaGVpZ2h0O2lmKCFyKXRocm93IG5ldyBFcnJvcihcIlNWRyBjb250YWluZXIgbm90IGZvdW5kLlwiKTt2YXIgbz12KFwic3ZnXCIpLGw9XCJvdmVyZmxvdzpoaWRkZW47XCIsaDtyZXR1cm4gaT1pfHwwLG49bnx8MCxhPWF8fDUxMixzPXN8fDM0Mix2KG8se2hlaWdodDpzLHZlcnNpb246MS4xLHdpZHRoOmEseG1sbnM6XCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiLFwieG1sbnM6eGxpbmtcIjpcImh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmtcIn0pLDE9PXI/KG8uc3R5bGUuY3NzVGV4dD1sK1wicG9zaXRpb246YWJzb2x1dGU7bGVmdDpcIitpK1wicHg7dG9wOlwiK24rXCJweFwiLHQuX2cuZG9jLmJvZHkuYXBwZW5kQ2hpbGQobyksaD0xKTooby5zdHlsZS5jc3NUZXh0PWwrXCJwb3NpdGlvbjpyZWxhdGl2ZVwiLHIuZmlyc3RDaGlsZD9yLmluc2VydEJlZm9yZShvLHIuZmlyc3RDaGlsZCk6ci5hcHBlbmRDaGlsZChvKSkscj1uZXcgdC5fUGFwZXIsci53aWR0aD1hLHIuaGVpZ2h0PXMsci5jYW52YXM9byxyLmNsZWFyKCksci5fbGVmdD1yLl90b3A9MCxoJiYoci5yZW5kZXJmaXg9ZnVuY3Rpb24oKXt9KSxyLnJlbmRlcmZpeCgpLHJ9LHQuX2VuZ2luZS5zZXRWaWV3Qm94PWZ1bmN0aW9uKHQsZSxyLGksbil7dShcInJhcGhhZWwuc2V0Vmlld0JveFwiLHRoaXMsdGhpcy5fdmlld0JveCxbdCxlLHIsaSxuXSk7dmFyIGE9dGhpcy5nZXRTaXplKCksbz1zKHIvYS53aWR0aCxpL2EuaGVpZ2h0KSxsPXRoaXMudG9wLGg9bj9cInhNaWRZTWlkIG1lZXRcIjpcInhNaW5ZTWluXCIsYyxwO2ZvcihudWxsPT10Pyh0aGlzLl92YlNpemUmJihvPTEpLGRlbGV0ZSB0aGlzLl92YlNpemUsYz1cIjAgMCBcIit0aGlzLndpZHRoK2YrdGhpcy5oZWlnaHQpOih0aGlzLl92YlNpemU9byxjPXQrZitlK2YrcitmK2kpLHYodGhpcy5jYW52YXMse3ZpZXdCb3g6YyxwcmVzZXJ2ZUFzcGVjdFJhdGlvOmh9KTtvJiZsOylwPVwic3Ryb2tlLXdpZHRoXCJpbiBsLmF0dHJzP2wuYXR0cnNbXCJzdHJva2Utd2lkdGhcIl06MSxsLmF0dHIoe1wic3Ryb2tlLXdpZHRoXCI6cH0pLGwuXy5kaXJ0eT0xLGwuXy5kaXJ0eVQ9MSxsPWwucHJldjtyZXR1cm4gdGhpcy5fdmlld0JveD1bdCxlLHIsaSwhIW5dLHRoaXN9LHQucHJvdG90eXBlLnJlbmRlcmZpeD1mdW5jdGlvbigpe3ZhciB0PXRoaXMuY2FudmFzLGU9dC5zdHlsZSxyO3RyeXtyPXQuZ2V0U2NyZWVuQ1RNKCl8fHQuY3JlYXRlU1ZHTWF0cml4KCl9Y2F0Y2goaSl7cj10LmNyZWF0ZVNWR01hdHJpeCgpfXZhciBuPS1yLmUlMSxhPS1yLmYlMTsobnx8YSkmJihuJiYodGhpcy5fbGVmdD0odGhpcy5fbGVmdCtuKSUxLGUubGVmdD10aGlzLl9sZWZ0K1wicHhcIiksYSYmKHRoaXMuX3RvcD0odGhpcy5fdG9wK2EpJTEsZS50b3A9dGhpcy5fdG9wK1wicHhcIikpfSx0LnByb3RvdHlwZS5jbGVhcj1mdW5jdGlvbigpe3QuZXZlKFwicmFwaGFlbC5jbGVhclwiLHRoaXMpO2Zvcih2YXIgZT10aGlzLmNhbnZhcztlLmZpcnN0Q2hpbGQ7KWUucmVtb3ZlQ2hpbGQoZS5maXJzdENoaWxkKTt0aGlzLmJvdHRvbT10aGlzLnRvcD1udWxsLCh0aGlzLmRlc2M9dihcImRlc2NcIikpLmFwcGVuZENoaWxkKHQuX2cuZG9jLmNyZWF0ZVRleHROb2RlKFwiQ3JlYXRlZCB3aXRoIFJhcGhhw6tsIFwiK3QudmVyc2lvbikpLGUuYXBwZW5kQ2hpbGQodGhpcy5kZXNjKSxlLmFwcGVuZENoaWxkKHRoaXMuZGVmcz12KFwiZGVmc1wiKSl9LHQucHJvdG90eXBlLnJlbW92ZT1mdW5jdGlvbigpe3UoXCJyYXBoYWVsLnJlbW92ZVwiLHRoaXMpLHRoaXMuY2FudmFzLnBhcmVudE5vZGUmJnRoaXMuY2FudmFzLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5jYW52YXMpO2Zvcih2YXIgZSBpbiB0aGlzKXRoaXNbZV09XCJmdW5jdGlvblwiPT10eXBlb2YgdGhpc1tlXT90Ll9yZW1vdmVkRmFjdG9yeShlKTpudWxsfTt2YXIgTT10LnN0O2Zvcih2YXIgTiBpbiBFKUVbZV0oTikmJiFNW2VdKE4pJiYoTVtOXT1mdW5jdGlvbih0KXtyZXR1cm4gZnVuY3Rpb24oKXt2YXIgZT1hcmd1bWVudHM7cmV0dXJuIHRoaXMuZm9yRWFjaChmdW5jdGlvbihyKXtyW3RdLmFwcGx5KHIsZSl9KX19KE4pKX19LmFwcGx5KGUsaSksISh2b2lkIDAhPT1uJiYodC5leHBvcnRzPW4pKX0sZnVuY3Rpb24odCxlLHIpe3ZhciBpLG47aT1bcigxKV0sbj1mdW5jdGlvbih0KXtpZighdHx8dC52bWwpe3ZhciBlPVwiaGFzT3duUHJvcGVydHlcIixyPVN0cmluZyxpPXBhcnNlRmxvYXQsbj1NYXRoLGE9bi5yb3VuZCxzPW4ubWF4LG89bi5taW4sbD1uLmFicyxoPVwiZmlsbFwiLHU9L1ssIF0rLyxjPXQuZXZlLGY9XCIgcHJvZ2lkOkRYSW1hZ2VUcmFuc2Zvcm0uTWljcm9zb2Z0XCIscD1cIiBcIixkPVwiXCIsZz17TTpcIm1cIixMOlwibFwiLEM6XCJjXCIsWjpcInhcIixtOlwidFwiLGw6XCJyXCIsYzpcInZcIix6OlwieFwifSx2PS8oW2NsbXpdKSw/KFteY2xtel0qKS9naSx4PS8gcHJvZ2lkOlxcUytCbHVyXFwoW15cXCldK1xcKS9nLHk9Ly0/W14sXFxzLV0rL2csbT1cInBvc2l0aW9uOmFic29sdXRlO2xlZnQ6MDt0b3A6MDt3aWR0aDoxcHg7aGVpZ2h0OjFweDtiZWhhdmlvcjp1cmwoI2RlZmF1bHQjVk1MKVwiLGI9MjE2MDAsXz17cGF0aDoxLHJlY3Q6MSxpbWFnZToxfSx3PXtjaXJjbGU6MSxlbGxpcHNlOjF9LGs9ZnVuY3Rpb24oZSl7dmFyIGk9L1thaHFzdHZdL2dpLG49dC5fcGF0aFRvQWJzb2x1dGU7aWYocihlKS5tYXRjaChpKSYmKG49dC5fcGF0aDJjdXJ2ZSksaT0vW2NsbXpdL2csbj09dC5fcGF0aFRvQWJzb2x1dGUmJiFyKGUpLm1hdGNoKGkpKXt2YXIgcz1yKGUpLnJlcGxhY2UodixmdW5jdGlvbih0LGUscil7dmFyIGk9W10sbj1cIm1cIj09ZS50b0xvd2VyQ2FzZSgpLHM9Z1tlXTtyZXR1cm4gci5yZXBsYWNlKHksZnVuY3Rpb24odCl7biYmMj09aS5sZW5ndGgmJihzKz1pK2dbXCJtXCI9PWU/XCJsXCI6XCJMXCJdLGk9W10pLGkucHVzaChhKHQqYikpfSkscytpfSk7cmV0dXJuIHN9dmFyIG89bihlKSxsLGg7cz1bXTtmb3IodmFyIHU9MCxjPW8ubGVuZ3RoO3U8Yzt1Kyspe2w9b1t1XSxoPW9bdV1bMF0udG9Mb3dlckNhc2UoKSxcInpcIj09aCYmKGg9XCJ4XCIpO2Zvcih2YXIgZj0xLHg9bC5sZW5ndGg7Zjx4O2YrKyloKz1hKGxbZl0qYikrKGYhPXgtMT9cIixcIjpkKTtzLnB1c2goaCl9cmV0dXJuIHMuam9pbihwKX0sQj1mdW5jdGlvbihlLHIsaSl7dmFyIG49dC5tYXRyaXgoKTtyZXR1cm4gbi5yb3RhdGUoLWUsLjUsLjUpLHtkeDpuLngocixpKSxkeTpuLnkocixpKX19LEM9ZnVuY3Rpb24odCxlLHIsaSxuLGEpe3ZhciBzPXQuXyxvPXQubWF0cml4LHU9cy5maWxscG9zLGM9dC5ub2RlLGY9Yy5zdHlsZSxkPTEsZz1cIlwiLHYseD1iL2UseT1iL3I7aWYoZi52aXNpYmlsaXR5PVwiaGlkZGVuXCIsZSYmcil7aWYoYy5jb29yZHNpemU9bCh4KStwK2woeSksZi5yb3RhdGlvbj1hKihlKnI8MD8tMToxKSxhKXt2YXIgbT1CKGEsaSxuKTtpPW0uZHgsbj1tLmR5fWlmKGU8MCYmKGcrPVwieFwiKSxyPDAmJihnKz1cIiB5XCIpJiYoZD0tMSksZi5mbGlwPWcsYy5jb29yZG9yaWdpbj1pKi14K3ArbioteSx1fHxzLmZpbGxzaXplKXt2YXIgXz1jLmdldEVsZW1lbnRzQnlUYWdOYW1lKGgpO189XyYmX1swXSxjLnJlbW92ZUNoaWxkKF8pLHUmJihtPUIoYSxvLngodVswXSx1WzFdKSxvLnkodVswXSx1WzFdKSksXy5wb3NpdGlvbj1tLmR4KmQrcCttLmR5KmQpLHMuZmlsbHNpemUmJihfLnNpemU9cy5maWxsc2l6ZVswXSpsKGUpK3Arcy5maWxsc2l6ZVsxXSpsKHIpKSxjLmFwcGVuZENoaWxkKF8pfWYudmlzaWJpbGl0eT1cInZpc2libGVcIn19O3QudG9TdHJpbmc9ZnVuY3Rpb24oKXtyZXR1cm5cIllvdXIgYnJvd3NlciBkb2VzbuKAmXQgc3VwcG9ydCBTVkcuIEZhbGxpbmcgZG93biB0byBWTUwuXFxuWW91IGFyZSBydW5uaW5nIFJhcGhhw6tsIFwiK3RoaXMudmVyc2lvbn07dmFyIFM9ZnVuY3Rpb24odCxlLGkpe2Zvcih2YXIgbj1yKGUpLnRvTG93ZXJDYXNlKCkuc3BsaXQoXCItXCIpLGE9aT9cImVuZFwiOlwic3RhcnRcIixzPW4ubGVuZ3RoLG89XCJjbGFzc2ljXCIsbD1cIm1lZGl1bVwiLGg9XCJtZWRpdW1cIjtzLS07KXN3aXRjaChuW3NdKXtjYXNlXCJibG9ja1wiOmNhc2VcImNsYXNzaWNcIjpjYXNlXCJvdmFsXCI6Y2FzZVwiZGlhbW9uZFwiOmNhc2VcIm9wZW5cIjpjYXNlXCJub25lXCI6bz1uW3NdO2JyZWFrO2Nhc2VcIndpZGVcIjpjYXNlXCJuYXJyb3dcIjpoPW5bc107YnJlYWs7Y2FzZVwibG9uZ1wiOmNhc2VcInNob3J0XCI6bD1uW3NdfXZhciB1PXQubm9kZS5nZXRFbGVtZW50c0J5VGFnTmFtZShcInN0cm9rZVwiKVswXTt1W2ErXCJhcnJvd1wiXT1vLHVbYStcImFycm93bGVuZ3RoXCJdPWwsdVthK1wiYXJyb3d3aWR0aFwiXT1ofSxBPWZ1bmN0aW9uKG4sbCl7bi5hdHRycz1uLmF0dHJzfHx7fTt2YXIgYz1uLm5vZGUsZj1uLmF0dHJzLGc9Yy5zdHlsZSx2LHg9X1tuLnR5cGVdJiYobC54IT1mLnh8fGwueSE9Zi55fHxsLndpZHRoIT1mLndpZHRofHxsLmhlaWdodCE9Zi5oZWlnaHR8fGwuY3ghPWYuY3h8fGwuY3khPWYuY3l8fGwucnghPWYucnh8fGwucnkhPWYucnl8fGwuciE9Zi5yKSx5PXdbbi50eXBlXSYmKGYuY3ghPWwuY3h8fGYuY3khPWwuY3l8fGYuciE9bC5yfHxmLnJ4IT1sLnJ4fHxmLnJ5IT1sLnJ5KSxtPW47Zm9yKHZhciBCIGluIGwpbFtlXShCKSYmKGZbQl09bFtCXSk7aWYoeCYmKGYucGF0aD10Ll9nZXRQYXRoW24udHlwZV0obiksbi5fLmRpcnR5PTEpLGwuaHJlZiYmKGMuaHJlZj1sLmhyZWYpLGwudGl0bGUmJihjLnRpdGxlPWwudGl0bGUpLGwudGFyZ2V0JiYoYy50YXJnZXQ9bC50YXJnZXQpLGwuY3Vyc29yJiYoZy5jdXJzb3I9bC5jdXJzb3IpLFwiYmx1clwiaW4gbCYmbi5ibHVyKGwuYmx1ciksKGwucGF0aCYmXCJwYXRoXCI9PW4udHlwZXx8eCkmJihjLnBhdGg9ayh+cihmLnBhdGgpLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihcInJcIik/dC5fcGF0aFRvQWJzb2x1dGUoZi5wYXRoKTpmLnBhdGgpLG4uXy5kaXJ0eT0xLFwiaW1hZ2VcIj09bi50eXBlJiYobi5fLmZpbGxwb3M9W2YueCxmLnldLG4uXy5maWxsc2l6ZT1bZi53aWR0aCxmLmhlaWdodF0sQyhuLDEsMSwwLDAsMCkpKSxcInRyYW5zZm9ybVwiaW4gbCYmbi50cmFuc2Zvcm0obC50cmFuc2Zvcm0pLHkpe3ZhciBBPStmLmN4LEU9K2YuY3ksTT0rZi5yeHx8K2Yucnx8MCxMPStmLnJ5fHwrZi5yfHwwO2MucGF0aD10LmZvcm1hdChcImFyezB9LHsxfSx7Mn0sezN9LHs0fSx7MX0sezR9LHsxfXhcIixhKChBLU0pKmIpLGEoKEUtTCkqYiksYSgoQStNKSpiKSxhKChFK0wpKmIpLGEoQSpiKSksbi5fLmRpcnR5PTF9aWYoXCJjbGlwLXJlY3RcImluIGwpe3ZhciB6PXIobFtcImNsaXAtcmVjdFwiXSkuc3BsaXQodSk7aWYoND09ei5sZW5ndGgpe3pbMl09K3pbMl0rICt6WzBdLHpbM109K3pbM10rICt6WzFdO3ZhciBQPWMuY2xpcFJlY3R8fHQuX2cuZG9jLmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksRj1QLnN0eWxlO0YuY2xpcD10LmZvcm1hdChcInJlY3QoezF9cHggezJ9cHggezN9cHggezB9cHgpXCIseiksYy5jbGlwUmVjdHx8KEYucG9zaXRpb249XCJhYnNvbHV0ZVwiLEYudG9wPTAsRi5sZWZ0PTAsRi53aWR0aD1uLnBhcGVyLndpZHRoK1wicHhcIixGLmhlaWdodD1uLnBhcGVyLmhlaWdodCtcInB4XCIsYy5wYXJlbnROb2RlLmluc2VydEJlZm9yZShQLGMpLFAuYXBwZW5kQ2hpbGQoYyksYy5jbGlwUmVjdD1QKX1sW1wiY2xpcC1yZWN0XCJdfHxjLmNsaXBSZWN0JiYoYy5jbGlwUmVjdC5zdHlsZS5jbGlwPVwiYXV0b1wiKX1pZihuLnRleHRwYXRoKXt2YXIgUj1uLnRleHRwYXRoLnN0eWxlO2wuZm9udCYmKFIuZm9udD1sLmZvbnQpLGxbXCJmb250LWZhbWlseVwiXSYmKFIuZm9udEZhbWlseT0nXCInK2xbXCJmb250LWZhbWlseVwiXS5zcGxpdChcIixcIilbMF0ucmVwbGFjZSgvXlsnXCJdK3xbJ1wiXSskL2csZCkrJ1wiJyksbFtcImZvbnQtc2l6ZVwiXSYmKFIuZm9udFNpemU9bFtcImZvbnQtc2l6ZVwiXSksbFtcImZvbnQtd2VpZ2h0XCJdJiYoUi5mb250V2VpZ2h0PWxbXCJmb250LXdlaWdodFwiXSksbFtcImZvbnQtc3R5bGVcIl0mJihSLmZvbnRTdHlsZT1sW1wiZm9udC1zdHlsZVwiXSl9aWYoXCJhcnJvdy1zdGFydFwiaW4gbCYmUyhtLGxbXCJhcnJvdy1zdGFydFwiXSksXCJhcnJvdy1lbmRcImluIGwmJlMobSxsW1wiYXJyb3ctZW5kXCJdLDEpLG51bGwhPWwub3BhY2l0eXx8bnVsbCE9bC5maWxsfHxudWxsIT1sLnNyY3x8bnVsbCE9bC5zdHJva2V8fG51bGwhPWxbXCJzdHJva2Utd2lkdGhcIl18fG51bGwhPWxbXCJzdHJva2Utb3BhY2l0eVwiXXx8bnVsbCE9bFtcImZpbGwtb3BhY2l0eVwiXXx8bnVsbCE9bFtcInN0cm9rZS1kYXNoYXJyYXlcIl18fG51bGwhPWxbXCJzdHJva2UtbWl0ZXJsaW1pdFwiXXx8bnVsbCE9bFtcInN0cm9rZS1saW5lam9pblwiXXx8bnVsbCE9bFtcInN0cm9rZS1saW5lY2FwXCJdKXt2YXIgaj1jLmdldEVsZW1lbnRzQnlUYWdOYW1lKGgpLEk9ITE7aWYoaj1qJiZqWzBdLCFqJiYoST1qPU4oaCkpLFwiaW1hZ2VcIj09bi50eXBlJiZsLnNyYyYmKGouc3JjPWwuc3JjKSxsLmZpbGwmJihqLm9uPSEwKSxudWxsIT1qLm9uJiZcIm5vbmVcIiE9bC5maWxsJiZudWxsIT09bC5maWxsfHwoai5vbj0hMSksai5vbiYmbC5maWxsKXt2YXIgcT1yKGwuZmlsbCkubWF0Y2godC5fSVNVUkwpO2lmKHEpe2oucGFyZW50Tm9kZT09YyYmYy5yZW1vdmVDaGlsZChqKSxqLnJvdGF0ZT0hMCxqLnNyYz1xWzFdLGoudHlwZT1cInRpbGVcIjt2YXIgRD1uLmdldEJCb3goMSk7ai5wb3NpdGlvbj1ELngrcCtELnksbi5fLmZpbGxwb3M9W0QueCxELnldLHQuX3ByZWxvYWQocVsxXSxmdW5jdGlvbigpe24uXy5maWxsc2l6ZT1bdGhpcy5vZmZzZXRXaWR0aCx0aGlzLm9mZnNldEhlaWdodF19KX1lbHNlIGouY29sb3I9dC5nZXRSR0IobC5maWxsKS5oZXgsai5zcmM9ZCxqLnR5cGU9XCJzb2xpZFwiLHQuZ2V0UkdCKGwuZmlsbCkuZXJyb3ImJihtLnR5cGUgaW57Y2lyY2xlOjEsZWxsaXBzZToxfXx8XCJyXCIhPXIobC5maWxsKS5jaGFyQXQoKSkmJlQobSxsLmZpbGwsaikmJihmLmZpbGw9XCJub25lXCIsZi5ncmFkaWVudD1sLmZpbGwsai5yb3RhdGU9ITEpfWlmKFwiZmlsbC1vcGFjaXR5XCJpbiBsfHxcIm9wYWNpdHlcImluIGwpe3ZhciBWPSgoK2ZbXCJmaWxsLW9wYWNpdHlcIl0rMXx8MiktMSkqKCgrZi5vcGFjaXR5KzF8fDIpLTEpKigoK3QuZ2V0UkdCKGwuZmlsbCkubysxfHwyKS0xKTtWPW8ocyhWLDApLDEpLGoub3BhY2l0eT1WLGouc3JjJiYoai5jb2xvcj1cIm5vbmVcIil9Yy5hcHBlbmRDaGlsZChqKTt2YXIgTz1jLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwic3Ryb2tlXCIpJiZjLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwic3Ryb2tlXCIpWzBdLFk9ITE7IU8mJihZPU89TihcInN0cm9rZVwiKSksKGwuc3Ryb2tlJiZcIm5vbmVcIiE9bC5zdHJva2V8fGxbXCJzdHJva2Utd2lkdGhcIl18fG51bGwhPWxbXCJzdHJva2Utb3BhY2l0eVwiXXx8bFtcInN0cm9rZS1kYXNoYXJyYXlcIl18fGxbXCJzdHJva2UtbWl0ZXJsaW1pdFwiXXx8bFtcInN0cm9rZS1saW5lam9pblwiXXx8bFtcInN0cm9rZS1saW5lY2FwXCJdKSYmKE8ub249ITApLChcIm5vbmVcIj09bC5zdHJva2V8fG51bGw9PT1sLnN0cm9rZXx8bnVsbD09Ty5vbnx8MD09bC5zdHJva2V8fDA9PWxbXCJzdHJva2Utd2lkdGhcIl0pJiYoTy5vbj0hMSk7dmFyIFc9dC5nZXRSR0IobC5zdHJva2UpO08ub24mJmwuc3Ryb2tlJiYoTy5jb2xvcj1XLmhleCksVj0oKCtmW1wic3Ryb2tlLW9wYWNpdHlcIl0rMXx8MiktMSkqKCgrZi5vcGFjaXR5KzF8fDIpLTEpKigoK1cubysxfHwyKS0xKTt2YXIgRz0uNzUqKGkobFtcInN0cm9rZS13aWR0aFwiXSl8fDEpO2lmKFY9byhzKFYsMCksMSksbnVsbD09bFtcInN0cm9rZS13aWR0aFwiXSYmKEc9ZltcInN0cm9rZS13aWR0aFwiXSksbFtcInN0cm9rZS13aWR0aFwiXSYmKE8ud2VpZ2h0PUcpLEcmJkc8MSYmKFYqPUcpJiYoTy53ZWlnaHQ9MSksTy5vcGFjaXR5PVYsbFtcInN0cm9rZS1saW5lam9pblwiXSYmKE8uam9pbnN0eWxlPWxbXCJzdHJva2UtbGluZWpvaW5cIl18fFwibWl0ZXJcIiksTy5taXRlcmxpbWl0PWxbXCJzdHJva2UtbWl0ZXJsaW1pdFwiXXx8OCxsW1wic3Ryb2tlLWxpbmVjYXBcIl0mJihPLmVuZGNhcD1cImJ1dHRcIj09bFtcInN0cm9rZS1saW5lY2FwXCJdP1wiZmxhdFwiOlwic3F1YXJlXCI9PWxbXCJzdHJva2UtbGluZWNhcFwiXT9cInNxdWFyZVwiOlwicm91bmRcIiksXCJzdHJva2UtZGFzaGFycmF5XCJpbiBsKXt2YXIgSD17XCItXCI6XCJzaG9ydGRhc2hcIixcIi5cIjpcInNob3J0ZG90XCIsXCItLlwiOlwic2hvcnRkYXNoZG90XCIsXCItLi5cIjpcInNob3J0ZGFzaGRvdGRvdFwiLFwiLiBcIjpcImRvdFwiLFwiLSBcIjpcImRhc2hcIixcIi0tXCI6XCJsb25nZGFzaFwiLFwiLSAuXCI6XCJkYXNoZG90XCIsXCItLS5cIjpcImxvbmdkYXNoZG90XCIsXCItLS4uXCI6XCJsb25nZGFzaGRvdGRvdFwifTtPLmRhc2hzdHlsZT1IW2VdKGxbXCJzdHJva2UtZGFzaGFycmF5XCJdKT9IW2xbXCJzdHJva2UtZGFzaGFycmF5XCJdXTpkfVkmJmMuYXBwZW5kQ2hpbGQoTyl9aWYoXCJ0ZXh0XCI9PW0udHlwZSl7bS5wYXBlci5jYW52YXMuc3R5bGUuZGlzcGxheT1kO3ZhciBYPW0ucGFwZXIuc3BhbixVPTEwMCwkPWYuZm9udCYmZi5mb250Lm1hdGNoKC9cXGQrKD86XFwuXFxkKik/KD89cHgpLyk7Zz1YLnN0eWxlLGYuZm9udCYmKGcuZm9udD1mLmZvbnQpLGZbXCJmb250LWZhbWlseVwiXSYmKGcuZm9udEZhbWlseT1mW1wiZm9udC1mYW1pbHlcIl0pLGZbXCJmb250LXdlaWdodFwiXSYmKGcuZm9udFdlaWdodD1mW1wiZm9udC13ZWlnaHRcIl0pLGZbXCJmb250LXN0eWxlXCJdJiYoZy5mb250U3R5bGU9ZltcImZvbnQtc3R5bGVcIl0pLCQ9aShmW1wiZm9udC1zaXplXCJdfHwkJiYkWzBdKXx8MTAsZy5mb250U2l6ZT0kKlUrXCJweFwiLG0udGV4dHBhdGguc3RyaW5nJiYoWC5pbm5lckhUTUw9cihtLnRleHRwYXRoLnN0cmluZykucmVwbGFjZSgvPC9nLFwiJiM2MDtcIikucmVwbGFjZSgvJi9nLFwiJiMzODtcIikucmVwbGFjZSgvXFxuL2csXCI8YnI+XCIpKTt2YXIgWj1YLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO20uVz1mLnc9KFoucmlnaHQtWi5sZWZ0KS9VLG0uSD1mLmg9KFouYm90dG9tLVoudG9wKS9VLG0uWD1mLngsbS5ZPWYueSttLkgvMiwoXCJ4XCJpbiBsfHxcInlcImluIGwpJiYobS5wYXRoLnY9dC5mb3JtYXQoXCJtezB9LHsxfWx7Mn0sezF9XCIsYShmLngqYiksYShmLnkqYiksYShmLngqYikrMSkpO2Zvcih2YXIgUT1bXCJ4XCIsXCJ5XCIsXCJ0ZXh0XCIsXCJmb250XCIsXCJmb250LWZhbWlseVwiLFwiZm9udC13ZWlnaHRcIixcImZvbnQtc3R5bGVcIixcImZvbnQtc2l6ZVwiXSxKPTAsSz1RLmxlbmd0aDtKPEs7SisrKWlmKFFbSl1pbiBsKXttLl8uZGlydHk9MTticmVha31zd2l0Y2goZltcInRleHQtYW5jaG9yXCJdKXtjYXNlXCJzdGFydFwiOm0udGV4dHBhdGguc3R5bGVbXCJ2LXRleHQtYWxpZ25cIl09XCJsZWZ0XCIsbS5iYng9bS5XLzI7YnJlYWs7Y2FzZVwiZW5kXCI6bS50ZXh0cGF0aC5zdHlsZVtcInYtdGV4dC1hbGlnblwiXT1cInJpZ2h0XCIsbS5iYng9LW0uVy8yO2JyZWFrO2RlZmF1bHQ6bS50ZXh0cGF0aC5zdHlsZVtcInYtdGV4dC1hbGlnblwiXT1cImNlbnRlclwiLG0uYmJ4PTB9bS50ZXh0cGF0aC5zdHlsZVtcInYtdGV4dC1rZXJuXCJdPSEwfX0sVD1mdW5jdGlvbihlLGEscyl7ZS5hdHRycz1lLmF0dHJzfHx7fTt2YXIgbz1lLmF0dHJzLGw9TWF0aC5wb3csaCx1LGM9XCJsaW5lYXJcIixmPVwiLjUgLjVcIjtpZihlLmF0dHJzLmdyYWRpZW50PWEsYT1yKGEpLnJlcGxhY2UodC5fcmFkaWFsX2dyYWRpZW50LGZ1bmN0aW9uKHQsZSxyKXtyZXR1cm4gYz1cInJhZGlhbFwiLGUmJnImJihlPWkoZSkscj1pKHIpLGwoZS0uNSwyKStsKHItLjUsMik+LjI1JiYocj1uLnNxcnQoLjI1LWwoZS0uNSwyKSkqKDIqKHI+LjUpLTEpKy41KSxmPWUrcCtyKSxkfSksYT1hLnNwbGl0KC9cXHMqXFwtXFxzKi8pLFwibGluZWFyXCI9PWMpe3ZhciBnPWEuc2hpZnQoKTtpZihnPS1pKGcpLGlzTmFOKGcpKXJldHVybiBudWxsfXZhciB2PXQuX3BhcnNlRG90cyhhKTtpZighdilyZXR1cm4gbnVsbDtpZihlPWUuc2hhcGV8fGUubm9kZSx2Lmxlbmd0aCl7ZS5yZW1vdmVDaGlsZChzKSxzLm9uPSEwLHMubWV0aG9kPVwibm9uZVwiLHMuY29sb3I9dlswXS5jb2xvcixzLmNvbG9yMj12W3YubGVuZ3RoLTFdLmNvbG9yO2Zvcih2YXIgeD1bXSx5PTAsbT12Lmxlbmd0aDt5PG07eSsrKXZbeV0ub2Zmc2V0JiZ4LnB1c2godlt5XS5vZmZzZXQrcCt2W3ldLmNvbG9yKTtzLmNvbG9ycz14Lmxlbmd0aD94LmpvaW4oKTpcIjAlIFwiK3MuY29sb3IsXCJyYWRpYWxcIj09Yz8ocy50eXBlPVwiZ3JhZGllbnRUaXRsZVwiLHMuZm9jdXM9XCIxMDAlXCIscy5mb2N1c3NpemU9XCIwIDBcIixzLmZvY3VzcG9zaXRpb249ZixzLmFuZ2xlPTApOihzLnR5cGU9XCJncmFkaWVudFwiLHMuYW5nbGU9KDI3MC1nKSUzNjApLGUuYXBwZW5kQ2hpbGQocyl9cmV0dXJuIDF9LEU9ZnVuY3Rpb24oZSxyKXt0aGlzWzBdPXRoaXMubm9kZT1lLGUucmFwaGFlbD0hMCx0aGlzLmlkPXQuX29pZCsrLGUucmFwaGFlbGlkPXRoaXMuaWQsdGhpcy5YPTAsdGhpcy5ZPTAsdGhpcy5hdHRycz17fSx0aGlzLnBhcGVyPXIsdGhpcy5tYXRyaXg9dC5tYXRyaXgoKSx0aGlzLl89e3RyYW5zZm9ybTpbXSxzeDoxLHN5OjEsZHg6MCxkeTowLGRlZzowLGRpcnR5OjEsZGlydHlUOjF9LCFyLmJvdHRvbSYmKHIuYm90dG9tPXRoaXMpLHRoaXMucHJldj1yLnRvcCxyLnRvcCYmKHIudG9wLm5leHQ9dGhpcyksci50b3A9dGhpcyx0aGlzLm5leHQ9bnVsbH0sTT10LmVsO0UucHJvdG90eXBlPU0sTS5jb25zdHJ1Y3Rvcj1FLE0udHJhbnNmb3JtPWZ1bmN0aW9uKGUpe2lmKG51bGw9PWUpcmV0dXJuIHRoaXMuXy50cmFuc2Zvcm07dmFyIGk9dGhpcy5wYXBlci5fdmlld0JveFNoaWZ0LG49aT9cInNcIitbaS5zY2FsZSxpLnNjYWxlXStcIi0xLTF0XCIrW2kuZHgsaS5keV06ZCxhO2kmJihhPWU9cihlKS5yZXBsYWNlKC9cXC57M318XFx1MjAyNi9nLHRoaXMuXy50cmFuc2Zvcm18fGQpKSx0Ll9leHRyYWN0VHJhbnNmb3JtKHRoaXMsbitlKTt2YXIgcz10aGlzLm1hdHJpeC5jbG9uZSgpLG89dGhpcy5za2V3LGw9dGhpcy5ub2RlLGgsdT1+cih0aGlzLmF0dHJzLmZpbGwpLmluZGV4T2YoXCItXCIpLGM9IXIodGhpcy5hdHRycy5maWxsKS5pbmRleE9mKFwidXJsKFwiKTtpZihzLnRyYW5zbGF0ZSgxLDEpLGN8fHV8fFwiaW1hZ2VcIj09dGhpcy50eXBlKWlmKG8ubWF0cml4PVwiMSAwIDAgMVwiLG8ub2Zmc2V0PVwiMCAwXCIsaD1zLnNwbGl0KCksdSYmaC5ub1JvdGF0aW9ufHwhaC5pc1NpbXBsZSl7bC5zdHlsZS5maWx0ZXI9cy50b0ZpbHRlcigpO3ZhciBmPXRoaXMuZ2V0QkJveCgpLGc9dGhpcy5nZXRCQm94KDEpLHY9Zi54LWcueCx4PWYueS1nLnk7bC5jb29yZG9yaWdpbj12Ki1iK3AreCotYixDKHRoaXMsMSwxLHYseCwwKX1lbHNlIGwuc3R5bGUuZmlsdGVyPWQsQyh0aGlzLGguc2NhbGV4LGguc2NhbGV5LGguZHgsaC5keSxoLnJvdGF0ZSk7ZWxzZSBsLnN0eWxlLmZpbHRlcj1kLG8ubWF0cml4PXIocyksby5vZmZzZXQ9cy5vZmZzZXQoKTtyZXR1cm4gbnVsbCE9PWEmJih0aGlzLl8udHJhbnNmb3JtPWEsdC5fZXh0cmFjdFRyYW5zZm9ybSh0aGlzLGEpKSx0aGlzfSxNLnJvdGF0ZT1mdW5jdGlvbih0LGUsbil7aWYodGhpcy5yZW1vdmVkKXJldHVybiB0aGlzO2lmKG51bGwhPXQpe2lmKHQ9cih0KS5zcGxpdCh1KSx0Lmxlbmd0aC0xJiYoZT1pKHRbMV0pLG49aSh0WzJdKSksdD1pKHRbMF0pLG51bGw9PW4mJihlPW4pLG51bGw9PWV8fG51bGw9PW4pe3ZhciBhPXRoaXMuZ2V0QkJveCgxKTtlPWEueCthLndpZHRoLzIsbj1hLnkrYS5oZWlnaHQvMn1yZXR1cm4gdGhpcy5fLmRpcnR5VD0xLHRoaXMudHJhbnNmb3JtKHRoaXMuXy50cmFuc2Zvcm0uY29uY2F0KFtbXCJyXCIsdCxlLG5dXSkpLHRoaXN9fSxNLnRyYW5zbGF0ZT1mdW5jdGlvbih0LGUpe3JldHVybiB0aGlzLnJlbW92ZWQ/dGhpczoodD1yKHQpLnNwbGl0KHUpLHQubGVuZ3RoLTEmJihlPWkodFsxXSkpLHQ9aSh0WzBdKXx8MCxlPStlfHwwLHRoaXMuXy5iYm94JiYodGhpcy5fLmJib3gueCs9dCx0aGlzLl8uYmJveC55Kz1lKSx0aGlzLnRyYW5zZm9ybSh0aGlzLl8udHJhbnNmb3JtLmNvbmNhdChbW1widFwiLHQsZV1dKSksdGhpcyl9LE0uc2NhbGU9ZnVuY3Rpb24odCxlLG4sYSl7aWYodGhpcy5yZW1vdmVkKXJldHVybiB0aGlzO2lmKHQ9cih0KS5zcGxpdCh1KSx0Lmxlbmd0aC0xJiYoZT1pKHRbMV0pLG49aSh0WzJdKSxhPWkodFszXSksaXNOYU4obikmJihuPW51bGwpLGlzTmFOKGEpJiYoYT1udWxsKSksdD1pKHRbMF0pLG51bGw9PWUmJihlPXQpLG51bGw9PWEmJihuPWEpLG51bGw9PW58fG51bGw9PWEpdmFyIHM9dGhpcy5nZXRCQm94KDEpO3JldHVybiBuPW51bGw9PW4/cy54K3Mud2lkdGgvMjpuLGE9bnVsbD09YT9zLnkrcy5oZWlnaHQvMjphLHRoaXMudHJhbnNmb3JtKHRoaXMuXy50cmFuc2Zvcm0uY29uY2F0KFtbXCJzXCIsdCxlLG4sYV1dKSksdGhpcy5fLmRpcnR5VD0xLHRoaXN9LE0uaGlkZT1mdW5jdGlvbigpe3JldHVybiF0aGlzLnJlbW92ZWQmJih0aGlzLm5vZGUuc3R5bGUuZGlzcGxheT1cIm5vbmVcIiksdGhpc30sTS5zaG93PWZ1bmN0aW9uKCl7cmV0dXJuIXRoaXMucmVtb3ZlZCYmKHRoaXMubm9kZS5zdHlsZS5kaXNwbGF5PWQpLHRoaXN9LE0uYXV4R2V0QkJveD10LmVsLmdldEJCb3gsTS5nZXRCQm94PWZ1bmN0aW9uKCl7dmFyIHQ9dGhpcy5hdXhHZXRCQm94KCk7aWYodGhpcy5wYXBlciYmdGhpcy5wYXBlci5fdmlld0JveFNoaWZ0KXt2YXIgZT17fSxyPTEvdGhpcy5wYXBlci5fdmlld0JveFNoaWZ0LnNjYWxlO3JldHVybiBlLng9dC54LXRoaXMucGFwZXIuX3ZpZXdCb3hTaGlmdC5keCxlLngqPXIsZS55PXQueS10aGlzLnBhcGVyLl92aWV3Qm94U2hpZnQuZHksZS55Kj1yLGUud2lkdGg9dC53aWR0aCpyLGUuaGVpZ2h0PXQuaGVpZ2h0KnIsZS54Mj1lLngrZS53aWR0aCxlLnkyPWUueStlLmhlaWdodCxlfXJldHVybiB0fSxNLl9nZXRCQm94PWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMucmVtb3ZlZD97fTp7eDp0aGlzLlgrKHRoaXMuYmJ4fHwwKS10aGlzLlcvMix5OnRoaXMuWS10aGlzLkgsd2lkdGg6dGhpcy5XLGhlaWdodDp0aGlzLkh9fSxNLnJlbW92ZT1mdW5jdGlvbigpe2lmKCF0aGlzLnJlbW92ZWQmJnRoaXMubm9kZS5wYXJlbnROb2RlKXt0aGlzLnBhcGVyLl9fc2V0X18mJnRoaXMucGFwZXIuX19zZXRfXy5leGNsdWRlKHRoaXMpLHQuZXZlLnVuYmluZChcInJhcGhhZWwuKi4qLlwiK3RoaXMuaWQpLHQuX3RlYXIodGhpcyx0aGlzLnBhcGVyKSx0aGlzLm5vZGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLm5vZGUpLHRoaXMuc2hhcGUmJnRoaXMuc2hhcGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLnNoYXBlKTtmb3IodmFyIGUgaW4gdGhpcyl0aGlzW2VdPVwiZnVuY3Rpb25cIj09dHlwZW9mIHRoaXNbZV0/dC5fcmVtb3ZlZEZhY3RvcnkoZSk6bnVsbDt0aGlzLnJlbW92ZWQ9ITB9fSxNLmF0dHI9ZnVuY3Rpb24ocixpKXtpZih0aGlzLnJlbW92ZWQpcmV0dXJuIHRoaXM7aWYobnVsbD09cil7dmFyIG49e307Zm9yKHZhciBhIGluIHRoaXMuYXR0cnMpdGhpcy5hdHRyc1tlXShhKSYmKG5bYV09dGhpcy5hdHRyc1thXSk7cmV0dXJuIG4uZ3JhZGllbnQmJlwibm9uZVwiPT1uLmZpbGwmJihuLmZpbGw9bi5ncmFkaWVudCkmJmRlbGV0ZSBuLmdyYWRpZW50LG4udHJhbnNmb3JtPXRoaXMuXy50cmFuc2Zvcm0sbn1pZihudWxsPT1pJiZ0LmlzKHIsXCJzdHJpbmdcIikpe2lmKHI9PWgmJlwibm9uZVwiPT10aGlzLmF0dHJzLmZpbGwmJnRoaXMuYXR0cnMuZ3JhZGllbnQpcmV0dXJuIHRoaXMuYXR0cnMuZ3JhZGllbnQ7Zm9yKHZhciBzPXIuc3BsaXQodSksbz17fSxsPTAsZj1zLmxlbmd0aDtsPGY7bCsrKXI9c1tsXSxyIGluIHRoaXMuYXR0cnM/b1tyXT10aGlzLmF0dHJzW3JdOnQuaXModGhpcy5wYXBlci5jdXN0b21BdHRyaWJ1dGVzW3JdLFwiZnVuY3Rpb25cIik/b1tyXT10aGlzLnBhcGVyLmN1c3RvbUF0dHJpYnV0ZXNbcl0uZGVmOm9bcl09dC5fYXZhaWxhYmxlQXR0cnNbcl07cmV0dXJuIGYtMT9vOm9bc1swXV19aWYodGhpcy5hdHRycyYmbnVsbD09aSYmdC5pcyhyLFwiYXJyYXlcIikpe2ZvcihvPXt9LGw9MCxmPXIubGVuZ3RoO2w8ZjtsKyspb1tyW2xdXT10aGlzLmF0dHIocltsXSk7cmV0dXJuIG99dmFyIHA7bnVsbCE9aSYmKHA9e30scFtyXT1pKSxudWxsPT1pJiZ0LmlzKHIsXCJvYmplY3RcIikmJihwPXIpO2Zvcih2YXIgZCBpbiBwKWMoXCJyYXBoYWVsLmF0dHIuXCIrZCtcIi5cIit0aGlzLmlkLHRoaXMscFtkXSk7aWYocCl7Zm9yKGQgaW4gdGhpcy5wYXBlci5jdXN0b21BdHRyaWJ1dGVzKWlmKHRoaXMucGFwZXIuY3VzdG9tQXR0cmlidXRlc1tlXShkKSYmcFtlXShkKSYmdC5pcyh0aGlzLnBhcGVyLmN1c3RvbUF0dHJpYnV0ZXNbZF0sXCJmdW5jdGlvblwiKSl7dmFyIGc9dGhpcy5wYXBlci5jdXN0b21BdHRyaWJ1dGVzW2RdLmFwcGx5KHRoaXMsW10uY29uY2F0KHBbZF0pKTt0aGlzLmF0dHJzW2RdPXBbZF07Zm9yKHZhciB2IGluIGcpZ1tlXSh2KSYmKHBbdl09Z1t2XSl9cC50ZXh0JiZcInRleHRcIj09dGhpcy50eXBlJiYodGhpcy50ZXh0cGF0aC5zdHJpbmc9cC50ZXh0KSxBKHRoaXMscCl9cmV0dXJuIHRoaXN9LE0udG9Gcm9udD1mdW5jdGlvbigpe3JldHVybiF0aGlzLnJlbW92ZWQmJnRoaXMubm9kZS5wYXJlbnROb2RlLmFwcGVuZENoaWxkKHRoaXMubm9kZSksdGhpcy5wYXBlciYmdGhpcy5wYXBlci50b3AhPXRoaXMmJnQuX3RvZnJvbnQodGhpcyx0aGlzLnBhcGVyKSx0aGlzfSxNLnRvQmFjaz1mdW5jdGlvbigpe3JldHVybiB0aGlzLnJlbW92ZWQ/dGhpczoodGhpcy5ub2RlLnBhcmVudE5vZGUuZmlyc3RDaGlsZCE9dGhpcy5ub2RlJiYodGhpcy5ub2RlLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHRoaXMubm9kZSx0aGlzLm5vZGUucGFyZW50Tm9kZS5maXJzdENoaWxkKSx0Ll90b2JhY2sodGhpcyx0aGlzLnBhcGVyKSksdGhpcyl9LE0uaW5zZXJ0QWZ0ZXI9ZnVuY3Rpb24oZSl7cmV0dXJuIHRoaXMucmVtb3ZlZD90aGlzOihlLmNvbnN0cnVjdG9yPT10LnN0LmNvbnN0cnVjdG9yJiYoZT1lW2UubGVuZ3RoLTFdKSxlLm5vZGUubmV4dFNpYmxpbmc/ZS5ub2RlLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHRoaXMubm9kZSxlLm5vZGUubmV4dFNpYmxpbmcpOmUubm9kZS5wYXJlbnROb2RlLmFwcGVuZENoaWxkKHRoaXMubm9kZSksdC5faW5zZXJ0YWZ0ZXIodGhpcyxlLHRoaXMucGFwZXIpLHRoaXMpfSxNLmluc2VydEJlZm9yZT1mdW5jdGlvbihlKXtyZXR1cm4gdGhpcy5yZW1vdmVkP3RoaXM6KGUuY29uc3RydWN0b3I9PXQuc3QuY29uc3RydWN0b3ImJihlPWVbMF0pLGUubm9kZS5wYXJlbnROb2RlLmluc2VydEJlZm9yZSh0aGlzLm5vZGUsZS5ub2RlKSx0Ll9pbnNlcnRiZWZvcmUodGhpcyxlLHRoaXMucGFwZXIpLHRoaXMpfSxNLmJsdXI9ZnVuY3Rpb24oZSl7dmFyIHI9dGhpcy5ub2RlLnJ1bnRpbWVTdHlsZSxpPXIuZmlsdGVyO3JldHVybiBpPWkucmVwbGFjZSh4LGQpLDAhPT0rZT8odGhpcy5hdHRycy5ibHVyPWUsci5maWx0ZXI9aStwK2YrXCIuQmx1cihwaXhlbHJhZGl1cz1cIisoK2V8fDEuNSkrXCIpXCIsci5tYXJnaW49dC5mb3JtYXQoXCItezB9cHggMCAwIC17MH1weFwiLGEoK2V8fDEuNSkpKTooci5maWx0ZXI9aSxyLm1hcmdpbj0wLGRlbGV0ZSB0aGlzLmF0dHJzLmJsdXIpLHRoaXN9LHQuX2VuZ2luZS5wYXRoPWZ1bmN0aW9uKHQsZSl7dmFyIHI9TihcInNoYXBlXCIpO3Iuc3R5bGUuY3NzVGV4dD1tLHIuY29vcmRzaXplPWIrcCtiLHIuY29vcmRvcmlnaW49ZS5jb29yZG9yaWdpbjt2YXIgaT1uZXcgRShyLGUpLG49e2ZpbGw6XCJub25lXCIsc3Ryb2tlOlwiIzAwMFwifTt0JiYobi5wYXRoPXQpLGkudHlwZT1cInBhdGhcIixpLnBhdGg9W10saS5QYXRoPWQsQShpLG4pLGUuY2FudmFzJiZlLmNhbnZhcy5hcHBlbmRDaGlsZChyKTt2YXIgYT1OKFwic2tld1wiKTtyZXR1cm4gYS5vbj0hMCxyLmFwcGVuZENoaWxkKGEpLGkuc2tldz1hLGkudHJhbnNmb3JtKGQpLGl9LHQuX2VuZ2luZS5yZWN0PWZ1bmN0aW9uKGUscixpLG4sYSxzKXt2YXIgbz10Ll9yZWN0UGF0aChyLGksbixhLHMpLGw9ZS5wYXRoKG8pLGg9bC5hdHRycztyZXR1cm4gbC5YPWgueD1yLGwuWT1oLnk9aSxsLlc9aC53aWR0aD1uLGwuSD1oLmhlaWdodD1hLGgucj1zLGgucGF0aD1vLGwudHlwZT1cInJlY3RcIixsfSx0Ll9lbmdpbmUuZWxsaXBzZT1mdW5jdGlvbih0LGUscixpLG4pe3ZhciBhPXQucGF0aCgpLHM9YS5hdHRycztyZXR1cm4gYS5YPWUtaSxhLlk9ci1uLGEuVz0yKmksYS5IPTIqbixhLnR5cGU9XCJlbGxpcHNlXCIsQShhLHtjeDplLGN5OnIscng6aSxyeTpufSksYX0sdC5fZW5naW5lLmNpcmNsZT1mdW5jdGlvbih0LGUscixpKXt2YXIgbj10LnBhdGgoKSxhPW4uYXR0cnM7cmV0dXJuIG4uWD1lLWksbi5ZPXItaSxuLlc9bi5IPTIqaSxuLnR5cGU9XCJjaXJjbGVcIixBKG4se2N4OmUsY3k6cixyOml9KSxufSx0Ll9lbmdpbmUuaW1hZ2U9ZnVuY3Rpb24oZSxyLGksbixhLHMpe3ZhciBvPXQuX3JlY3RQYXRoKGksbixhLHMpLGw9ZS5wYXRoKG8pLmF0dHIoe3N0cm9rZTpcIm5vbmVcIn0pLHU9bC5hdHRycyxjPWwubm9kZSxmPWMuZ2V0RWxlbWVudHNCeVRhZ05hbWUoaClbMF07cmV0dXJuIHUuc3JjPXIsbC5YPXUueD1pLGwuWT11Lnk9bixsLlc9dS53aWR0aD1hLGwuSD11LmhlaWdodD1zLHUucGF0aD1vLGwudHlwZT1cImltYWdlXCIsZi5wYXJlbnROb2RlPT1jJiZjLnJlbW92ZUNoaWxkKGYpLGYucm90YXRlPSEwLGYuc3JjPXIsZi50eXBlPVwidGlsZVwiLGwuXy5maWxscG9zPVtpLG5dLGwuXy5maWxsc2l6ZT1bYSxzXSxjLmFwcGVuZENoaWxkKGYpLEMobCwxLDEsMCwwLDApLGx9LHQuX2VuZ2luZS50ZXh0PWZ1bmN0aW9uKGUsaSxuLHMpe3ZhciBvPU4oXCJzaGFwZVwiKSxsPU4oXCJwYXRoXCIpLGg9TihcInRleHRwYXRoXCIpO2k9aXx8MCxuPW58fDAscz1zfHxcIlwiLGwudj10LmZvcm1hdChcIm17MH0sezF9bHsyfSx7MX1cIixhKGkqYiksYShuKmIpLGEoaSpiKSsxKSxsLnRleHRwYXRob2s9ITAsaC5zdHJpbmc9cihzKSxoLm9uPSEwLG8uc3R5bGUuY3NzVGV4dD1tLG8uY29vcmRzaXplPWIrcCtiLG8uY29vcmRvcmlnaW49XCIwIDBcIjt2YXIgdT1uZXcgRShvLGUpLGM9e2ZpbGw6XCIjMDAwXCIsc3Ryb2tlOlwibm9uZVwiLGZvbnQ6dC5fYXZhaWxhYmxlQXR0cnMuZm9udCx0ZXh0OnN9O3Uuc2hhcGU9byx1LnBhdGg9bCx1LnRleHRwYXRoPWgsdS50eXBlPVwidGV4dFwiLHUuYXR0cnMudGV4dD1yKHMpLHUuYXR0cnMueD1pLHUuYXR0cnMueT1uLHUuYXR0cnMudz0xLHUuYXR0cnMuaD0xLEEodSxjKSxvLmFwcGVuZENoaWxkKGgpLG8uYXBwZW5kQ2hpbGQobCksZS5jYW52YXMuYXBwZW5kQ2hpbGQobyk7dmFyIGY9TihcInNrZXdcIik7cmV0dXJuIGYub249ITAsby5hcHBlbmRDaGlsZChmKSx1LnNrZXc9Zix1LnRyYW5zZm9ybShkKSx1fSx0Ll9lbmdpbmUuc2V0U2l6ZT1mdW5jdGlvbihlLHIpe3ZhciBpPXRoaXMuY2FudmFzLnN0eWxlO3JldHVybiB0aGlzLndpZHRoPWUsdGhpcy5oZWlnaHQ9cixlPT0rZSYmKGUrPVwicHhcIikscj09K3ImJihyKz1cInB4XCIpLGkud2lkdGg9ZSxpLmhlaWdodD1yLGkuY2xpcD1cInJlY3QoMCBcIitlK1wiIFwiK3IrXCIgMClcIix0aGlzLl92aWV3Qm94JiZ0Ll9lbmdpbmUuc2V0Vmlld0JveC5hcHBseSh0aGlzLHRoaXMuX3ZpZXdCb3gpLHRoaXN9LHQuX2VuZ2luZS5zZXRWaWV3Qm94PWZ1bmN0aW9uKGUscixpLG4sYSl7dC5ldmUoXCJyYXBoYWVsLnNldFZpZXdCb3hcIix0aGlzLHRoaXMuX3ZpZXdCb3gsW2UscixpLG4sYV0pO3ZhciBzPXRoaXMuZ2V0U2l6ZSgpLG89cy53aWR0aCxsPXMuaGVpZ2h0LGgsdTtyZXR1cm4gYSYmKGg9bC9uLHU9by9pLGkqaDxvJiYoZS09KG8taSpoKS8yL2gpLG4qdTxsJiYoci09KGwtbip1KS8yL3UpKSx0aGlzLl92aWV3Qm94PVtlLHIsaSxuLCEhYV0sdGhpcy5fdmlld0JveFNoaWZ0PXtkeDotZSxkeTotcixzY2FsZTpzfSx0aGlzLmZvckVhY2goZnVuY3Rpb24odCl7dC50cmFuc2Zvcm0oXCIuLi5cIil9KSx0aGlzfTt2YXIgTjt0Ll9lbmdpbmUuaW5pdFdpbj1mdW5jdGlvbih0KXt2YXIgZT10LmRvY3VtZW50O2Uuc3R5bGVTaGVldHMubGVuZ3RoPDMxP2UuY3JlYXRlU3R5bGVTaGVldCgpLmFkZFJ1bGUoXCIucnZtbFwiLFwiYmVoYXZpb3I6dXJsKCNkZWZhdWx0I1ZNTClcIik6ZS5zdHlsZVNoZWV0c1swXS5hZGRSdWxlKFwiLnJ2bWxcIixcImJlaGF2aW9yOnVybCgjZGVmYXVsdCNWTUwpXCIpO3RyeXshZS5uYW1lc3BhY2VzLnJ2bWwmJmUubmFtZXNwYWNlcy5hZGQoXCJydm1sXCIsXCJ1cm46c2NoZW1hcy1taWNyb3NvZnQtY29tOnZtbFwiKSxOPWZ1bmN0aW9uKHQpe3JldHVybiBlLmNyZWF0ZUVsZW1lbnQoXCI8cnZtbDpcIit0KycgY2xhc3M9XCJydm1sXCI+Jyl9fWNhdGNoKHIpe049ZnVuY3Rpb24odCl7cmV0dXJuIGUuY3JlYXRlRWxlbWVudChcIjxcIit0KycgeG1sbnM9XCJ1cm46c2NoZW1hcy1taWNyb3NvZnQuY29tOnZtbFwiIGNsYXNzPVwicnZtbFwiPicpfX19LHQuX2VuZ2luZS5pbml0V2luKHQuX2cud2luKSx0Ll9lbmdpbmUuY3JlYXRlPWZ1bmN0aW9uKCl7dmFyIGU9dC5fZ2V0Q29udGFpbmVyLmFwcGx5KDAsYXJndW1lbnRzKSxyPWUuY29udGFpbmVyLGk9ZS5oZWlnaHQsbixhPWUud2lkdGgscz1lLngsbz1lLnk7aWYoIXIpdGhyb3cgbmV3IEVycm9yKFwiVk1MIGNvbnRhaW5lciBub3QgZm91bmQuXCIpO3ZhciBsPW5ldyB0Ll9QYXBlcixoPWwuY2FudmFzPXQuX2cuZG9jLmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksdT1oLnN0eWxlO3JldHVybiBzPXN8fDAsbz1vfHwwLGE9YXx8NTEyLGk9aXx8MzQyLGwud2lkdGg9YSxsLmhlaWdodD1pLGE9PSthJiYoYSs9XCJweFwiKSxpPT0raSYmKGkrPVwicHhcIiksbC5jb29yZHNpemU9MWUzKmIrcCsxZTMqYixsLmNvb3Jkb3JpZ2luPVwiMCAwXCIsbC5zcGFuPXQuX2cuZG9jLmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpLGwuc3Bhbi5zdHlsZS5jc3NUZXh0PVwicG9zaXRpb246YWJzb2x1dGU7bGVmdDotOTk5OWVtO3RvcDotOTk5OWVtO3BhZGRpbmc6MDttYXJnaW46MDtsaW5lLWhlaWdodDoxO1wiLGguYXBwZW5kQ2hpbGQobC5zcGFuKSx1LmNzc1RleHQ9dC5mb3JtYXQoXCJ0b3A6MDtsZWZ0OjA7d2lkdGg6ezB9O2hlaWdodDp7MX07ZGlzcGxheTppbmxpbmUtYmxvY2s7cG9zaXRpb246cmVsYXRpdmU7Y2xpcDpyZWN0KDAgezB9IHsxfSAwKTtvdmVyZmxvdzpoaWRkZW5cIixhLGkpLDE9PXI/KHQuX2cuZG9jLmJvZHkuYXBwZW5kQ2hpbGQoaCksdS5sZWZ0PXMrXCJweFwiLHUudG9wPW8rXCJweFwiLHUucG9zaXRpb249XCJhYnNvbHV0ZVwiKTpyLmZpcnN0Q2hpbGQ/ci5pbnNlcnRCZWZvcmUoaCxyLmZpcnN0Q2hpbGQpOnIuYXBwZW5kQ2hpbGQoaCksbC5yZW5kZXJmaXg9ZnVuY3Rpb24oKXt9LGx9LHQucHJvdG90eXBlLmNsZWFyPWZ1bmN0aW9uKCl7dC5ldmUoXCJyYXBoYWVsLmNsZWFyXCIsdGhpcyksdGhpcy5jYW52YXMuaW5uZXJIVE1MPWQsdGhpcy5zcGFuPXQuX2cuZG9jLmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpLHRoaXMuc3Bhbi5zdHlsZS5jc3NUZXh0PVwicG9zaXRpb246YWJzb2x1dGU7bGVmdDotOTk5OWVtO3RvcDotOTk5OWVtO3BhZGRpbmc6MDttYXJnaW46MDtsaW5lLWhlaWdodDoxO2Rpc3BsYXk6aW5saW5lO1wiLHRoaXMuY2FudmFzLmFwcGVuZENoaWxkKHRoaXMuc3BhbiksdGhpcy5ib3R0b209dGhpcy50b3A9bnVsbH0sdC5wcm90b3R5cGUucmVtb3ZlPWZ1bmN0aW9uKCl7dC5ldmUoXCJyYXBoYWVsLnJlbW92ZVwiLHRoaXMpLHRoaXMuY2FudmFzLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5jYW52YXMpO2Zvcih2YXIgZSBpbiB0aGlzKXRoaXNbZV09XCJmdW5jdGlvblwiPT10eXBlb2YgdGhpc1tlXT90Ll9yZW1vdmVkRmFjdG9yeShlKTpudWxsO3JldHVybiEwfTt2YXIgTD10LnN0O2Zvcih2YXIgeiBpbiBNKU1bZV0oeikmJiFMW2VdKHopJiYoTFt6XT1mdW5jdGlvbih0KXtyZXR1cm4gZnVuY3Rpb24oKXt2YXIgZT1hcmd1bWVudHM7cmV0dXJuIHRoaXMuZm9yRWFjaChmdW5jdGlvbihyKXtyW3RdLmFwcGx5KHIsZSl9KX19KHopKX19LmFwcGx5KGUsaSksISh2b2lkIDAhPT1uJiYodC5leHBvcnRzPW4pKX1dKX0pOyIsIi8vICAgICBVbmRlcnNjb3JlLmpzIDEuOC4zXG4vLyAgICAgaHR0cDovL3VuZGVyc2NvcmVqcy5vcmdcbi8vICAgICAoYykgMjAwOS0yMDE1IEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4vLyAgICAgVW5kZXJzY29yZSBtYXkgYmUgZnJlZWx5IGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cblxuKGZ1bmN0aW9uKCkge1xuXG4gIC8vIEJhc2VsaW5lIHNldHVwXG4gIC8vIC0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gRXN0YWJsaXNoIHRoZSByb290IG9iamVjdCwgYHdpbmRvd2AgaW4gdGhlIGJyb3dzZXIsIG9yIGBleHBvcnRzYCBvbiB0aGUgc2VydmVyLlxuICB2YXIgcm9vdCA9IHRoaXM7XG5cbiAgLy8gU2F2ZSB0aGUgcHJldmlvdXMgdmFsdWUgb2YgdGhlIGBfYCB2YXJpYWJsZS5cbiAgdmFyIHByZXZpb3VzVW5kZXJzY29yZSA9IHJvb3QuXztcblxuICAvLyBTYXZlIGJ5dGVzIGluIHRoZSBtaW5pZmllZCAoYnV0IG5vdCBnemlwcGVkKSB2ZXJzaW9uOlxuICB2YXIgQXJyYXlQcm90byA9IEFycmF5LnByb3RvdHlwZSwgT2JqUHJvdG8gPSBPYmplY3QucHJvdG90eXBlLCBGdW5jUHJvdG8gPSBGdW5jdGlvbi5wcm90b3R5cGU7XG5cbiAgLy8gQ3JlYXRlIHF1aWNrIHJlZmVyZW5jZSB2YXJpYWJsZXMgZm9yIHNwZWVkIGFjY2VzcyB0byBjb3JlIHByb3RvdHlwZXMuXG4gIHZhclxuICAgIHB1c2ggICAgICAgICAgICAgPSBBcnJheVByb3RvLnB1c2gsXG4gICAgc2xpY2UgICAgICAgICAgICA9IEFycmF5UHJvdG8uc2xpY2UsXG4gICAgdG9TdHJpbmcgICAgICAgICA9IE9ialByb3RvLnRvU3RyaW5nLFxuICAgIGhhc093blByb3BlcnR5ICAgPSBPYmpQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuICAvLyBBbGwgKipFQ01BU2NyaXB0IDUqKiBuYXRpdmUgZnVuY3Rpb24gaW1wbGVtZW50YXRpb25zIHRoYXQgd2UgaG9wZSB0byB1c2VcbiAgLy8gYXJlIGRlY2xhcmVkIGhlcmUuXG4gIHZhclxuICAgIG5hdGl2ZUlzQXJyYXkgICAgICA9IEFycmF5LmlzQXJyYXksXG4gICAgbmF0aXZlS2V5cyAgICAgICAgID0gT2JqZWN0LmtleXMsXG4gICAgbmF0aXZlQmluZCAgICAgICAgID0gRnVuY1Byb3RvLmJpbmQsXG4gICAgbmF0aXZlQ3JlYXRlICAgICAgID0gT2JqZWN0LmNyZWF0ZTtcblxuICAvLyBOYWtlZCBmdW5jdGlvbiByZWZlcmVuY2UgZm9yIHN1cnJvZ2F0ZS1wcm90b3R5cGUtc3dhcHBpbmcuXG4gIHZhciBDdG9yID0gZnVuY3Rpb24oKXt9O1xuXG4gIC8vIENyZWF0ZSBhIHNhZmUgcmVmZXJlbmNlIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdCBmb3IgdXNlIGJlbG93LlxuICB2YXIgXyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogaW5zdGFuY2VvZiBfKSByZXR1cm4gb2JqO1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBfKSkgcmV0dXJuIG5ldyBfKG9iaik7XG4gICAgdGhpcy5fd3JhcHBlZCA9IG9iajtcbiAgfTtcblxuICAvLyBFeHBvcnQgdGhlIFVuZGVyc2NvcmUgb2JqZWN0IGZvciAqKk5vZGUuanMqKiwgd2l0aFxuICAvLyBiYWNrd2FyZHMtY29tcGF0aWJpbGl0eSBmb3IgdGhlIG9sZCBgcmVxdWlyZSgpYCBBUEkuIElmIHdlJ3JlIGluXG4gIC8vIHRoZSBicm93c2VyLCBhZGQgYF9gIGFzIGEgZ2xvYmFsIG9iamVjdC5cbiAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgICAgZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gXztcbiAgICB9XG4gICAgZXhwb3J0cy5fID0gXztcbiAgfSBlbHNlIHtcbiAgICByb290Ll8gPSBfO1xuICB9XG5cbiAgLy8gQ3VycmVudCB2ZXJzaW9uLlxuICBfLlZFUlNJT04gPSAnMS44LjMnO1xuXG4gIC8vIEludGVybmFsIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhbiBlZmZpY2llbnQgKGZvciBjdXJyZW50IGVuZ2luZXMpIHZlcnNpb25cbiAgLy8gb2YgdGhlIHBhc3NlZC1pbiBjYWxsYmFjaywgdG8gYmUgcmVwZWF0ZWRseSBhcHBsaWVkIGluIG90aGVyIFVuZGVyc2NvcmVcbiAgLy8gZnVuY3Rpb25zLlxuICB2YXIgb3B0aW1pemVDYiA9IGZ1bmN0aW9uKGZ1bmMsIGNvbnRleHQsIGFyZ0NvdW50KSB7XG4gICAgaWYgKGNvbnRleHQgPT09IHZvaWQgMCkgcmV0dXJuIGZ1bmM7XG4gICAgc3dpdGNoIChhcmdDb3VudCA9PSBudWxsID8gMyA6IGFyZ0NvdW50KSB7XG4gICAgICBjYXNlIDE6IHJldHVybiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICByZXR1cm4gZnVuYy5jYWxsKGNvbnRleHQsIHZhbHVlKTtcbiAgICAgIH07XG4gICAgICBjYXNlIDI6IHJldHVybiBmdW5jdGlvbih2YWx1ZSwgb3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCB2YWx1ZSwgb3RoZXIpO1xuICAgICAgfTtcbiAgICAgIGNhc2UgMzogcmV0dXJuIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbikge1xuICAgICAgICByZXR1cm4gZnVuYy5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbik7XG4gICAgICB9O1xuICAgICAgY2FzZSA0OiByZXR1cm4gZnVuY3Rpb24oYWNjdW11bGF0b3IsIHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbikge1xuICAgICAgICByZXR1cm4gZnVuYy5jYWxsKGNvbnRleHQsIGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGZ1bmMuYXBwbHkoY29udGV4dCwgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEEgbW9zdGx5LWludGVybmFsIGZ1bmN0aW9uIHRvIGdlbmVyYXRlIGNhbGxiYWNrcyB0aGF0IGNhbiBiZSBhcHBsaWVkXG4gIC8vIHRvIGVhY2ggZWxlbWVudCBpbiBhIGNvbGxlY3Rpb24sIHJldHVybmluZyB0aGUgZGVzaXJlZCByZXN1bHQg4oCUIGVpdGhlclxuICAvLyBpZGVudGl0eSwgYW4gYXJiaXRyYXJ5IGNhbGxiYWNrLCBhIHByb3BlcnR5IG1hdGNoZXIsIG9yIGEgcHJvcGVydHkgYWNjZXNzb3IuXG4gIHZhciBjYiA9IGZ1bmN0aW9uKHZhbHVlLCBjb250ZXh0LCBhcmdDb3VudCkge1xuICAgIGlmICh2YWx1ZSA9PSBudWxsKSByZXR1cm4gXy5pZGVudGl0eTtcbiAgICBpZiAoXy5pc0Z1bmN0aW9uKHZhbHVlKSkgcmV0dXJuIG9wdGltaXplQ2IodmFsdWUsIGNvbnRleHQsIGFyZ0NvdW50KTtcbiAgICBpZiAoXy5pc09iamVjdCh2YWx1ZSkpIHJldHVybiBfLm1hdGNoZXIodmFsdWUpO1xuICAgIHJldHVybiBfLnByb3BlcnR5KHZhbHVlKTtcbiAgfTtcbiAgXy5pdGVyYXRlZSA9IGZ1bmN0aW9uKHZhbHVlLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIGNiKHZhbHVlLCBjb250ZXh0LCBJbmZpbml0eSk7XG4gIH07XG5cbiAgLy8gQW4gaW50ZXJuYWwgZnVuY3Rpb24gZm9yIGNyZWF0aW5nIGFzc2lnbmVyIGZ1bmN0aW9ucy5cbiAgdmFyIGNyZWF0ZUFzc2lnbmVyID0gZnVuY3Rpb24oa2V5c0Z1bmMsIHVuZGVmaW5lZE9ubHkpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqKSB7XG4gICAgICB2YXIgbGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgIGlmIChsZW5ndGggPCAyIHx8IG9iaiA9PSBudWxsKSByZXR1cm4gb2JqO1xuICAgICAgZm9yICh2YXIgaW5kZXggPSAxOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICB2YXIgc291cmNlID0gYXJndW1lbnRzW2luZGV4XSxcbiAgICAgICAgICAgIGtleXMgPSBrZXlzRnVuYyhzb3VyY2UpLFxuICAgICAgICAgICAgbCA9IGtleXMubGVuZ3RoO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgIHZhciBrZXkgPSBrZXlzW2ldO1xuICAgICAgICAgIGlmICghdW5kZWZpbmVkT25seSB8fCBvYmpba2V5XSA9PT0gdm9pZCAwKSBvYmpba2V5XSA9IHNvdXJjZVtrZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gb2JqO1xuICAgIH07XG4gIH07XG5cbiAgLy8gQW4gaW50ZXJuYWwgZnVuY3Rpb24gZm9yIGNyZWF0aW5nIGEgbmV3IG9iamVjdCB0aGF0IGluaGVyaXRzIGZyb20gYW5vdGhlci5cbiAgdmFyIGJhc2VDcmVhdGUgPSBmdW5jdGlvbihwcm90b3R5cGUpIHtcbiAgICBpZiAoIV8uaXNPYmplY3QocHJvdG90eXBlKSkgcmV0dXJuIHt9O1xuICAgIGlmIChuYXRpdmVDcmVhdGUpIHJldHVybiBuYXRpdmVDcmVhdGUocHJvdG90eXBlKTtcbiAgICBDdG9yLnByb3RvdHlwZSA9IHByb3RvdHlwZTtcbiAgICB2YXIgcmVzdWx0ID0gbmV3IEN0b3I7XG4gICAgQ3Rvci5wcm90b3R5cGUgPSBudWxsO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgdmFyIHByb3BlcnR5ID0gZnVuY3Rpb24oa2V5KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIG9iaiA9PSBudWxsID8gdm9pZCAwIDogb2JqW2tleV07XG4gICAgfTtcbiAgfTtcblxuICAvLyBIZWxwZXIgZm9yIGNvbGxlY3Rpb24gbWV0aG9kcyB0byBkZXRlcm1pbmUgd2hldGhlciBhIGNvbGxlY3Rpb25cbiAgLy8gc2hvdWxkIGJlIGl0ZXJhdGVkIGFzIGFuIGFycmF5IG9yIGFzIGFuIG9iamVjdFxuICAvLyBSZWxhdGVkOiBodHRwOi8vcGVvcGxlLm1vemlsbGEub3JnL35qb3JlbmRvcmZmL2VzNi1kcmFmdC5odG1sI3NlYy10b2xlbmd0aFxuICAvLyBBdm9pZHMgYSB2ZXJ5IG5hc3R5IGlPUyA4IEpJVCBidWcgb24gQVJNLTY0LiAjMjA5NFxuICB2YXIgTUFYX0FSUkFZX0lOREVYID0gTWF0aC5wb3coMiwgNTMpIC0gMTtcbiAgdmFyIGdldExlbmd0aCA9IHByb3BlcnR5KCdsZW5ndGgnKTtcbiAgdmFyIGlzQXJyYXlMaWtlID0gZnVuY3Rpb24oY29sbGVjdGlvbikge1xuICAgIHZhciBsZW5ndGggPSBnZXRMZW5ndGgoY29sbGVjdGlvbik7XG4gICAgcmV0dXJuIHR5cGVvZiBsZW5ndGggPT0gJ251bWJlcicgJiYgbGVuZ3RoID49IDAgJiYgbGVuZ3RoIDw9IE1BWF9BUlJBWV9JTkRFWDtcbiAgfTtcblxuICAvLyBDb2xsZWN0aW9uIEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFRoZSBjb3JuZXJzdG9uZSwgYW4gYGVhY2hgIGltcGxlbWVudGF0aW9uLCBha2EgYGZvckVhY2hgLlxuICAvLyBIYW5kbGVzIHJhdyBvYmplY3RzIGluIGFkZGl0aW9uIHRvIGFycmF5LWxpa2VzLiBUcmVhdHMgYWxsXG4gIC8vIHNwYXJzZSBhcnJheS1saWtlcyBhcyBpZiB0aGV5IHdlcmUgZGVuc2UuXG4gIF8uZWFjaCA9IF8uZm9yRWFjaCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IG9wdGltaXplQ2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHZhciBpLCBsZW5ndGg7XG4gICAgaWYgKGlzQXJyYXlMaWtlKG9iaikpIHtcbiAgICAgIGZvciAoaSA9IDAsIGxlbmd0aCA9IG9iai5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBpdGVyYXRlZShvYmpbaV0sIGksIG9iaik7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgICBmb3IgKGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGl0ZXJhdGVlKG9ialtrZXlzW2ldXSwga2V5c1tpXSwgb2JqKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIHJlc3VsdHMgb2YgYXBwbHlpbmcgdGhlIGl0ZXJhdGVlIHRvIGVhY2ggZWxlbWVudC5cbiAgXy5tYXAgPSBfLmNvbGxlY3QgPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgdmFyIGtleXMgPSAhaXNBcnJheUxpa2Uob2JqKSAmJiBfLmtleXMob2JqKSxcbiAgICAgICAgbGVuZ3RoID0gKGtleXMgfHwgb2JqKS5sZW5ndGgsXG4gICAgICAgIHJlc3VsdHMgPSBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHZhciBjdXJyZW50S2V5ID0ga2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXg7XG4gICAgICByZXN1bHRzW2luZGV4XSA9IGl0ZXJhdGVlKG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gQ3JlYXRlIGEgcmVkdWNpbmcgZnVuY3Rpb24gaXRlcmF0aW5nIGxlZnQgb3IgcmlnaHQuXG4gIGZ1bmN0aW9uIGNyZWF0ZVJlZHVjZShkaXIpIHtcbiAgICAvLyBPcHRpbWl6ZWQgaXRlcmF0b3IgZnVuY3Rpb24gYXMgdXNpbmcgYXJndW1lbnRzLmxlbmd0aFxuICAgIC8vIGluIHRoZSBtYWluIGZ1bmN0aW9uIHdpbGwgZGVvcHRpbWl6ZSB0aGUsIHNlZSAjMTk5MS5cbiAgICBmdW5jdGlvbiBpdGVyYXRvcihvYmosIGl0ZXJhdGVlLCBtZW1vLCBrZXlzLCBpbmRleCwgbGVuZ3RoKSB7XG4gICAgICBmb3IgKDsgaW5kZXggPj0gMCAmJiBpbmRleCA8IGxlbmd0aDsgaW5kZXggKz0gZGlyKSB7XG4gICAgICAgIHZhciBjdXJyZW50S2V5ID0ga2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXg7XG4gICAgICAgIG1lbW8gPSBpdGVyYXRlZShtZW1vLCBvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaik7XG4gICAgICB9XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgbWVtbywgY29udGV4dCkge1xuICAgICAgaXRlcmF0ZWUgPSBvcHRpbWl6ZUNiKGl0ZXJhdGVlLCBjb250ZXh0LCA0KTtcbiAgICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgICAgbGVuZ3RoID0gKGtleXMgfHwgb2JqKS5sZW5ndGgsXG4gICAgICAgICAgaW5kZXggPSBkaXIgPiAwID8gMCA6IGxlbmd0aCAtIDE7XG4gICAgICAvLyBEZXRlcm1pbmUgdGhlIGluaXRpYWwgdmFsdWUgaWYgbm9uZSBpcyBwcm92aWRlZC5cbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoIDwgMykge1xuICAgICAgICBtZW1vID0gb2JqW2tleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4XTtcbiAgICAgICAgaW5kZXggKz0gZGlyO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGl0ZXJhdG9yKG9iaiwgaXRlcmF0ZWUsIG1lbW8sIGtleXMsIGluZGV4LCBsZW5ndGgpO1xuICAgIH07XG4gIH1cblxuICAvLyAqKlJlZHVjZSoqIGJ1aWxkcyB1cCBhIHNpbmdsZSByZXN1bHQgZnJvbSBhIGxpc3Qgb2YgdmFsdWVzLCBha2EgYGluamVjdGAsXG4gIC8vIG9yIGBmb2xkbGAuXG4gIF8ucmVkdWNlID0gXy5mb2xkbCA9IF8uaW5qZWN0ID0gY3JlYXRlUmVkdWNlKDEpO1xuXG4gIC8vIFRoZSByaWdodC1hc3NvY2lhdGl2ZSB2ZXJzaW9uIG9mIHJlZHVjZSwgYWxzbyBrbm93biBhcyBgZm9sZHJgLlxuICBfLnJlZHVjZVJpZ2h0ID0gXy5mb2xkciA9IGNyZWF0ZVJlZHVjZSgtMSk7XG5cbiAgLy8gUmV0dXJuIHRoZSBmaXJzdCB2YWx1ZSB3aGljaCBwYXNzZXMgYSB0cnV0aCB0ZXN0LiBBbGlhc2VkIGFzIGBkZXRlY3RgLlxuICBfLmZpbmQgPSBfLmRldGVjdCA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgdmFyIGtleTtcbiAgICBpZiAoaXNBcnJheUxpa2Uob2JqKSkge1xuICAgICAga2V5ID0gXy5maW5kSW5kZXgob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrZXkgPSBfLmZpbmRLZXkob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIH1cbiAgICBpZiAoa2V5ICE9PSB2b2lkIDAgJiYga2V5ICE9PSAtMSkgcmV0dXJuIG9ialtrZXldO1xuICB9O1xuXG4gIC8vIFJldHVybiBhbGwgdGhlIGVsZW1lbnRzIHRoYXQgcGFzcyBhIHRydXRoIHRlc3QuXG4gIC8vIEFsaWFzZWQgYXMgYHNlbGVjdGAuXG4gIF8uZmlsdGVyID0gXy5zZWxlY3QgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGlmIChwcmVkaWNhdGUodmFsdWUsIGluZGV4LCBsaXN0KSkgcmVzdWx0cy5wdXNoKHZhbHVlKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICAvLyBSZXR1cm4gYWxsIHRoZSBlbGVtZW50cyBmb3Igd2hpY2ggYSB0cnV0aCB0ZXN0IGZhaWxzLlxuICBfLnJlamVjdCA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIF8uZmlsdGVyKG9iaiwgXy5uZWdhdGUoY2IocHJlZGljYXRlKSksIGNvbnRleHQpO1xuICB9O1xuXG4gIC8vIERldGVybWluZSB3aGV0aGVyIGFsbCBvZiB0aGUgZWxlbWVudHMgbWF0Y2ggYSB0cnV0aCB0ZXN0LlxuICAvLyBBbGlhc2VkIGFzIGBhbGxgLlxuICBfLmV2ZXJ5ID0gXy5hbGwgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgdmFyIGtleXMgPSAhaXNBcnJheUxpa2Uob2JqKSAmJiBfLmtleXMob2JqKSxcbiAgICAgICAgbGVuZ3RoID0gKGtleXMgfHwgb2JqKS5sZW5ndGg7XG4gICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgdmFyIGN1cnJlbnRLZXkgPSBrZXlzID8ga2V5c1tpbmRleF0gOiBpbmRleDtcbiAgICAgIGlmICghcHJlZGljYXRlKG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKSkgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgaWYgYXQgbGVhc3Qgb25lIGVsZW1lbnQgaW4gdGhlIG9iamVjdCBtYXRjaGVzIGEgdHJ1dGggdGVzdC5cbiAgLy8gQWxpYXNlZCBhcyBgYW55YC5cbiAgXy5zb21lID0gXy5hbnkgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgdmFyIGtleXMgPSAhaXNBcnJheUxpa2Uob2JqKSAmJiBfLmtleXMob2JqKSxcbiAgICAgICAgbGVuZ3RoID0gKGtleXMgfHwgb2JqKS5sZW5ndGg7XG4gICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgdmFyIGN1cnJlbnRLZXkgPSBrZXlzID8ga2V5c1tpbmRleF0gOiBpbmRleDtcbiAgICAgIGlmIChwcmVkaWNhdGUob2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopKSByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9O1xuXG4gIC8vIERldGVybWluZSBpZiB0aGUgYXJyYXkgb3Igb2JqZWN0IGNvbnRhaW5zIGEgZ2l2ZW4gaXRlbSAodXNpbmcgYD09PWApLlxuICAvLyBBbGlhc2VkIGFzIGBpbmNsdWRlc2AgYW5kIGBpbmNsdWRlYC5cbiAgXy5jb250YWlucyA9IF8uaW5jbHVkZXMgPSBfLmluY2x1ZGUgPSBmdW5jdGlvbihvYmosIGl0ZW0sIGZyb21JbmRleCwgZ3VhcmQpIHtcbiAgICBpZiAoIWlzQXJyYXlMaWtlKG9iaikpIG9iaiA9IF8udmFsdWVzKG9iaik7XG4gICAgaWYgKHR5cGVvZiBmcm9tSW5kZXggIT0gJ251bWJlcicgfHwgZ3VhcmQpIGZyb21JbmRleCA9IDA7XG4gICAgcmV0dXJuIF8uaW5kZXhPZihvYmosIGl0ZW0sIGZyb21JbmRleCkgPj0gMDtcbiAgfTtcblxuICAvLyBJbnZva2UgYSBtZXRob2QgKHdpdGggYXJndW1lbnRzKSBvbiBldmVyeSBpdGVtIGluIGEgY29sbGVjdGlvbi5cbiAgXy5pbnZva2UgPSBmdW5jdGlvbihvYmosIG1ldGhvZCkge1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHZhciBpc0Z1bmMgPSBfLmlzRnVuY3Rpb24obWV0aG9kKTtcbiAgICByZXR1cm4gXy5tYXAob2JqLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgdmFyIGZ1bmMgPSBpc0Z1bmMgPyBtZXRob2QgOiB2YWx1ZVttZXRob2RdO1xuICAgICAgcmV0dXJuIGZ1bmMgPT0gbnVsbCA/IGZ1bmMgOiBmdW5jLmFwcGx5KHZhbHVlLCBhcmdzKTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBtYXBgOiBmZXRjaGluZyBhIHByb3BlcnR5LlxuICBfLnBsdWNrID0gZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgICByZXR1cm4gXy5tYXAob2JqLCBfLnByb3BlcnR5KGtleSkpO1xuICB9O1xuXG4gIC8vIENvbnZlbmllbmNlIHZlcnNpb24gb2YgYSBjb21tb24gdXNlIGNhc2Ugb2YgYGZpbHRlcmA6IHNlbGVjdGluZyBvbmx5IG9iamVjdHNcbiAgLy8gY29udGFpbmluZyBzcGVjaWZpYyBga2V5OnZhbHVlYCBwYWlycy5cbiAgXy53aGVyZSA9IGZ1bmN0aW9uKG9iaiwgYXR0cnMpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIob2JqLCBfLm1hdGNoZXIoYXR0cnMpKTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBmaW5kYDogZ2V0dGluZyB0aGUgZmlyc3Qgb2JqZWN0XG4gIC8vIGNvbnRhaW5pbmcgc3BlY2lmaWMgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8uZmluZFdoZXJlID0gZnVuY3Rpb24ob2JqLCBhdHRycykge1xuICAgIHJldHVybiBfLmZpbmQob2JqLCBfLm1hdGNoZXIoYXR0cnMpKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIG1heGltdW0gZWxlbWVudCAob3IgZWxlbWVudC1iYXNlZCBjb21wdXRhdGlvbikuXG4gIF8ubWF4ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHQgPSAtSW5maW5pdHksIGxhc3RDb21wdXRlZCA9IC1JbmZpbml0eSxcbiAgICAgICAgdmFsdWUsIGNvbXB1dGVkO1xuICAgIGlmIChpdGVyYXRlZSA9PSBudWxsICYmIG9iaiAhPSBudWxsKSB7XG4gICAgICBvYmogPSBpc0FycmF5TGlrZShvYmopID8gb2JqIDogXy52YWx1ZXMob2JqKTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBvYmoubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFsdWUgPSBvYmpbaV07XG4gICAgICAgIGlmICh2YWx1ZSA+IHJlc3VsdCkge1xuICAgICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICAgIGNvbXB1dGVkID0gaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBsaXN0KTtcbiAgICAgICAgaWYgKGNvbXB1dGVkID4gbGFzdENvbXB1dGVkIHx8IGNvbXB1dGVkID09PSAtSW5maW5pdHkgJiYgcmVzdWx0ID09PSAtSW5maW5pdHkpIHtcbiAgICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgICBsYXN0Q29tcHV0ZWQgPSBjb21wdXRlZDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBtaW5pbXVtIGVsZW1lbnQgKG9yIGVsZW1lbnQtYmFzZWQgY29tcHV0YXRpb24pLlxuICBfLm1pbiA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0ID0gSW5maW5pdHksIGxhc3RDb21wdXRlZCA9IEluZmluaXR5LFxuICAgICAgICB2YWx1ZSwgY29tcHV0ZWQ7XG4gICAgaWYgKGl0ZXJhdGVlID09IG51bGwgJiYgb2JqICE9IG51bGwpIHtcbiAgICAgIG9iaiA9IGlzQXJyYXlMaWtlKG9iaikgPyBvYmogOiBfLnZhbHVlcyhvYmopO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IG9iai5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICB2YWx1ZSA9IG9ialtpXTtcbiAgICAgICAgaWYgKHZhbHVlIDwgcmVzdWx0KSB7XG4gICAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgICAgY29tcHV0ZWQgPSBpdGVyYXRlZSh2YWx1ZSwgaW5kZXgsIGxpc3QpO1xuICAgICAgICBpZiAoY29tcHV0ZWQgPCBsYXN0Q29tcHV0ZWQgfHwgY29tcHV0ZWQgPT09IEluZmluaXR5ICYmIHJlc3VsdCA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgICBsYXN0Q29tcHV0ZWQgPSBjb21wdXRlZDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gU2h1ZmZsZSBhIGNvbGxlY3Rpb24sIHVzaW5nIHRoZSBtb2Rlcm4gdmVyc2lvbiBvZiB0aGVcbiAgLy8gW0Zpc2hlci1ZYXRlcyBzaHVmZmxlXShodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0Zpc2hlcuKAk1lhdGVzX3NodWZmbGUpLlxuICBfLnNodWZmbGUgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgc2V0ID0gaXNBcnJheUxpa2Uob2JqKSA/IG9iaiA6IF8udmFsdWVzKG9iaik7XG4gICAgdmFyIGxlbmd0aCA9IHNldC5sZW5ndGg7XG4gICAgdmFyIHNodWZmbGVkID0gQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpbmRleCA9IDAsIHJhbmQ7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICByYW5kID0gXy5yYW5kb20oMCwgaW5kZXgpO1xuICAgICAgaWYgKHJhbmQgIT09IGluZGV4KSBzaHVmZmxlZFtpbmRleF0gPSBzaHVmZmxlZFtyYW5kXTtcbiAgICAgIHNodWZmbGVkW3JhbmRdID0gc2V0W2luZGV4XTtcbiAgICB9XG4gICAgcmV0dXJuIHNodWZmbGVkO1xuICB9O1xuXG4gIC8vIFNhbXBsZSAqKm4qKiByYW5kb20gdmFsdWVzIGZyb20gYSBjb2xsZWN0aW9uLlxuICAvLyBJZiAqKm4qKiBpcyBub3Qgc3BlY2lmaWVkLCByZXR1cm5zIGEgc2luZ2xlIHJhbmRvbSBlbGVtZW50LlxuICAvLyBUaGUgaW50ZXJuYWwgYGd1YXJkYCBhcmd1bWVudCBhbGxvd3MgaXQgdG8gd29yayB3aXRoIGBtYXBgLlxuICBfLnNhbXBsZSA9IGZ1bmN0aW9uKG9iaiwgbiwgZ3VhcmQpIHtcbiAgICBpZiAobiA9PSBudWxsIHx8IGd1YXJkKSB7XG4gICAgICBpZiAoIWlzQXJyYXlMaWtlKG9iaikpIG9iaiA9IF8udmFsdWVzKG9iaik7XG4gICAgICByZXR1cm4gb2JqW18ucmFuZG9tKG9iai5sZW5ndGggLSAxKV07XG4gICAgfVxuICAgIHJldHVybiBfLnNodWZmbGUob2JqKS5zbGljZSgwLCBNYXRoLm1heCgwLCBuKSk7XG4gIH07XG5cbiAgLy8gU29ydCB0aGUgb2JqZWN0J3MgdmFsdWVzIGJ5IGEgY3JpdGVyaW9uIHByb2R1Y2VkIGJ5IGFuIGl0ZXJhdGVlLlxuICBfLnNvcnRCeSA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICByZXR1cm4gXy5wbHVjayhfLm1hcChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICBpbmRleDogaW5kZXgsXG4gICAgICAgIGNyaXRlcmlhOiBpdGVyYXRlZSh2YWx1ZSwgaW5kZXgsIGxpc3QpXG4gICAgICB9O1xuICAgIH0pLnNvcnQoZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgIHZhciBhID0gbGVmdC5jcml0ZXJpYTtcbiAgICAgIHZhciBiID0gcmlnaHQuY3JpdGVyaWE7XG4gICAgICBpZiAoYSAhPT0gYikge1xuICAgICAgICBpZiAoYSA+IGIgfHwgYSA9PT0gdm9pZCAwKSByZXR1cm4gMTtcbiAgICAgICAgaWYgKGEgPCBiIHx8IGIgPT09IHZvaWQgMCkgcmV0dXJuIC0xO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxlZnQuaW5kZXggLSByaWdodC5pbmRleDtcbiAgICB9KSwgJ3ZhbHVlJyk7XG4gIH07XG5cbiAgLy8gQW4gaW50ZXJuYWwgZnVuY3Rpb24gdXNlZCBmb3IgYWdncmVnYXRlIFwiZ3JvdXAgYnlcIiBvcGVyYXRpb25zLlxuICB2YXIgZ3JvdXAgPSBmdW5jdGlvbihiZWhhdmlvcikge1xuICAgIHJldHVybiBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCkge1xuICAgICAgICB2YXIga2V5ID0gaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBvYmopO1xuICAgICAgICBiZWhhdmlvcihyZXN1bHQsIHZhbHVlLCBrZXkpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gR3JvdXBzIHRoZSBvYmplY3QncyB2YWx1ZXMgYnkgYSBjcml0ZXJpb24uIFBhc3MgZWl0aGVyIGEgc3RyaW5nIGF0dHJpYnV0ZVxuICAvLyB0byBncm91cCBieSwgb3IgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIGNyaXRlcmlvbi5cbiAgXy5ncm91cEJ5ID0gZ3JvdXAoZnVuY3Rpb24ocmVzdWx0LCB2YWx1ZSwga2V5KSB7XG4gICAgaWYgKF8uaGFzKHJlc3VsdCwga2V5KSkgcmVzdWx0W2tleV0ucHVzaCh2YWx1ZSk7IGVsc2UgcmVzdWx0W2tleV0gPSBbdmFsdWVdO1xuICB9KTtcblxuICAvLyBJbmRleGVzIHRoZSBvYmplY3QncyB2YWx1ZXMgYnkgYSBjcml0ZXJpb24sIHNpbWlsYXIgdG8gYGdyb3VwQnlgLCBidXQgZm9yXG4gIC8vIHdoZW4geW91IGtub3cgdGhhdCB5b3VyIGluZGV4IHZhbHVlcyB3aWxsIGJlIHVuaXF1ZS5cbiAgXy5pbmRleEJ5ID0gZ3JvdXAoZnVuY3Rpb24ocmVzdWx0LCB2YWx1ZSwga2V5KSB7XG4gICAgcmVzdWx0W2tleV0gPSB2YWx1ZTtcbiAgfSk7XG5cbiAgLy8gQ291bnRzIGluc3RhbmNlcyBvZiBhbiBvYmplY3QgdGhhdCBncm91cCBieSBhIGNlcnRhaW4gY3JpdGVyaW9uLiBQYXNzXG4gIC8vIGVpdGhlciBhIHN0cmluZyBhdHRyaWJ1dGUgdG8gY291bnQgYnksIG9yIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZVxuICAvLyBjcml0ZXJpb24uXG4gIF8uY291bnRCeSA9IGdyb3VwKGZ1bmN0aW9uKHJlc3VsdCwgdmFsdWUsIGtleSkge1xuICAgIGlmIChfLmhhcyhyZXN1bHQsIGtleSkpIHJlc3VsdFtrZXldKys7IGVsc2UgcmVzdWx0W2tleV0gPSAxO1xuICB9KTtcblxuICAvLyBTYWZlbHkgY3JlYXRlIGEgcmVhbCwgbGl2ZSBhcnJheSBmcm9tIGFueXRoaW5nIGl0ZXJhYmxlLlxuICBfLnRvQXJyYXkgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIW9iaikgcmV0dXJuIFtdO1xuICAgIGlmIChfLmlzQXJyYXkob2JqKSkgcmV0dXJuIHNsaWNlLmNhbGwob2JqKTtcbiAgICBpZiAoaXNBcnJheUxpa2Uob2JqKSkgcmV0dXJuIF8ubWFwKG9iaiwgXy5pZGVudGl0eSk7XG4gICAgcmV0dXJuIF8udmFsdWVzKG9iaik7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBudW1iZXIgb2YgZWxlbWVudHMgaW4gYW4gb2JqZWN0LlxuICBfLnNpemUgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiAwO1xuICAgIHJldHVybiBpc0FycmF5TGlrZShvYmopID8gb2JqLmxlbmd0aCA6IF8ua2V5cyhvYmopLmxlbmd0aDtcbiAgfTtcblxuICAvLyBTcGxpdCBhIGNvbGxlY3Rpb24gaW50byB0d28gYXJyYXlzOiBvbmUgd2hvc2UgZWxlbWVudHMgYWxsIHNhdGlzZnkgdGhlIGdpdmVuXG4gIC8vIHByZWRpY2F0ZSwgYW5kIG9uZSB3aG9zZSBlbGVtZW50cyBhbGwgZG8gbm90IHNhdGlzZnkgdGhlIHByZWRpY2F0ZS5cbiAgXy5wYXJ0aXRpb24gPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgdmFyIHBhc3MgPSBbXSwgZmFpbCA9IFtdO1xuICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBrZXksIG9iaikge1xuICAgICAgKHByZWRpY2F0ZSh2YWx1ZSwga2V5LCBvYmopID8gcGFzcyA6IGZhaWwpLnB1c2godmFsdWUpO1xuICAgIH0pO1xuICAgIHJldHVybiBbcGFzcywgZmFpbF07XG4gIH07XG5cbiAgLy8gQXJyYXkgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEdldCB0aGUgZmlyc3QgZWxlbWVudCBvZiBhbiBhcnJheS4gUGFzc2luZyAqKm4qKiB3aWxsIHJldHVybiB0aGUgZmlyc3QgTlxuICAvLyB2YWx1ZXMgaW4gdGhlIGFycmF5LiBBbGlhc2VkIGFzIGBoZWFkYCBhbmQgYHRha2VgLiBUaGUgKipndWFyZCoqIGNoZWNrXG4gIC8vIGFsbG93cyBpdCB0byB3b3JrIHdpdGggYF8ubWFwYC5cbiAgXy5maXJzdCA9IF8uaGVhZCA9IF8udGFrZSA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIGlmIChhcnJheSA9PSBudWxsKSByZXR1cm4gdm9pZCAwO1xuICAgIGlmIChuID09IG51bGwgfHwgZ3VhcmQpIHJldHVybiBhcnJheVswXTtcbiAgICByZXR1cm4gXy5pbml0aWFsKGFycmF5LCBhcnJheS5sZW5ndGggLSBuKTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGV2ZXJ5dGhpbmcgYnV0IHRoZSBsYXN0IGVudHJ5IG9mIHRoZSBhcnJheS4gRXNwZWNpYWxseSB1c2VmdWwgb25cbiAgLy8gdGhlIGFyZ3VtZW50cyBvYmplY3QuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gYWxsIHRoZSB2YWx1ZXMgaW5cbiAgLy8gdGhlIGFycmF5LCBleGNsdWRpbmcgdGhlIGxhc3QgTi5cbiAgXy5pbml0aWFsID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgcmV0dXJuIHNsaWNlLmNhbGwoYXJyYXksIDAsIE1hdGgubWF4KDAsIGFycmF5Lmxlbmd0aCAtIChuID09IG51bGwgfHwgZ3VhcmQgPyAxIDogbikpKTtcbiAgfTtcblxuICAvLyBHZXQgdGhlIGxhc3QgZWxlbWVudCBvZiBhbiBhcnJheS4gUGFzc2luZyAqKm4qKiB3aWxsIHJldHVybiB0aGUgbGFzdCBOXG4gIC8vIHZhbHVlcyBpbiB0aGUgYXJyYXkuXG4gIF8ubGFzdCA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIGlmIChhcnJheSA9PSBudWxsKSByZXR1cm4gdm9pZCAwO1xuICAgIGlmIChuID09IG51bGwgfHwgZ3VhcmQpIHJldHVybiBhcnJheVthcnJheS5sZW5ndGggLSAxXTtcbiAgICByZXR1cm4gXy5yZXN0KGFycmF5LCBNYXRoLm1heCgwLCBhcnJheS5sZW5ndGggLSBuKSk7XG4gIH07XG5cbiAgLy8gUmV0dXJucyBldmVyeXRoaW5nIGJ1dCB0aGUgZmlyc3QgZW50cnkgb2YgdGhlIGFycmF5LiBBbGlhc2VkIGFzIGB0YWlsYCBhbmQgYGRyb3BgLlxuICAvLyBFc3BlY2lhbGx5IHVzZWZ1bCBvbiB0aGUgYXJndW1lbnRzIG9iamVjdC4gUGFzc2luZyBhbiAqKm4qKiB3aWxsIHJldHVyblxuICAvLyB0aGUgcmVzdCBOIHZhbHVlcyBpbiB0aGUgYXJyYXkuXG4gIF8ucmVzdCA9IF8udGFpbCA9IF8uZHJvcCA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIHJldHVybiBzbGljZS5jYWxsKGFycmF5LCBuID09IG51bGwgfHwgZ3VhcmQgPyAxIDogbik7XG4gIH07XG5cbiAgLy8gVHJpbSBvdXQgYWxsIGZhbHN5IHZhbHVlcyBmcm9tIGFuIGFycmF5LlxuICBfLmNvbXBhY3QgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHJldHVybiBfLmZpbHRlcihhcnJheSwgXy5pZGVudGl0eSk7XG4gIH07XG5cbiAgLy8gSW50ZXJuYWwgaW1wbGVtZW50YXRpb24gb2YgYSByZWN1cnNpdmUgYGZsYXR0ZW5gIGZ1bmN0aW9uLlxuICB2YXIgZmxhdHRlbiA9IGZ1bmN0aW9uKGlucHV0LCBzaGFsbG93LCBzdHJpY3QsIHN0YXJ0SW5kZXgpIHtcbiAgICB2YXIgb3V0cHV0ID0gW10sIGlkeCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0SW5kZXggfHwgMCwgbGVuZ3RoID0gZ2V0TGVuZ3RoKGlucHV0KTsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgdmFsdWUgPSBpbnB1dFtpXTtcbiAgICAgIGlmIChpc0FycmF5TGlrZSh2YWx1ZSkgJiYgKF8uaXNBcnJheSh2YWx1ZSkgfHwgXy5pc0FyZ3VtZW50cyh2YWx1ZSkpKSB7XG4gICAgICAgIC8vZmxhdHRlbiBjdXJyZW50IGxldmVsIG9mIGFycmF5IG9yIGFyZ3VtZW50cyBvYmplY3RcbiAgICAgICAgaWYgKCFzaGFsbG93KSB2YWx1ZSA9IGZsYXR0ZW4odmFsdWUsIHNoYWxsb3csIHN0cmljdCk7XG4gICAgICAgIHZhciBqID0gMCwgbGVuID0gdmFsdWUubGVuZ3RoO1xuICAgICAgICBvdXRwdXQubGVuZ3RoICs9IGxlbjtcbiAgICAgICAgd2hpbGUgKGogPCBsZW4pIHtcbiAgICAgICAgICBvdXRwdXRbaWR4KytdID0gdmFsdWVbaisrXTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICghc3RyaWN0KSB7XG4gICAgICAgIG91dHB1dFtpZHgrK10gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG91dHB1dDtcbiAgfTtcblxuICAvLyBGbGF0dGVuIG91dCBhbiBhcnJheSwgZWl0aGVyIHJlY3Vyc2l2ZWx5IChieSBkZWZhdWx0KSwgb3IganVzdCBvbmUgbGV2ZWwuXG4gIF8uZmxhdHRlbiA9IGZ1bmN0aW9uKGFycmF5LCBzaGFsbG93KSB7XG4gICAgcmV0dXJuIGZsYXR0ZW4oYXJyYXksIHNoYWxsb3csIGZhbHNlKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSB2ZXJzaW9uIG9mIHRoZSBhcnJheSB0aGF0IGRvZXMgbm90IGNvbnRhaW4gdGhlIHNwZWNpZmllZCB2YWx1ZShzKS5cbiAgXy53aXRob3V0ID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICByZXR1cm4gXy5kaWZmZXJlbmNlKGFycmF5LCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICB9O1xuXG4gIC8vIFByb2R1Y2UgYSBkdXBsaWNhdGUtZnJlZSB2ZXJzaW9uIG9mIHRoZSBhcnJheS4gSWYgdGhlIGFycmF5IGhhcyBhbHJlYWR5XG4gIC8vIGJlZW4gc29ydGVkLCB5b3UgaGF2ZSB0aGUgb3B0aW9uIG9mIHVzaW5nIGEgZmFzdGVyIGFsZ29yaXRobS5cbiAgLy8gQWxpYXNlZCBhcyBgdW5pcXVlYC5cbiAgXy51bmlxID0gXy51bmlxdWUgPSBmdW5jdGlvbihhcnJheSwgaXNTb3J0ZWQsIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaWYgKCFfLmlzQm9vbGVhbihpc1NvcnRlZCkpIHtcbiAgICAgIGNvbnRleHQgPSBpdGVyYXRlZTtcbiAgICAgIGl0ZXJhdGVlID0gaXNTb3J0ZWQ7XG4gICAgICBpc1NvcnRlZCA9IGZhbHNlO1xuICAgIH1cbiAgICBpZiAoaXRlcmF0ZWUgIT0gbnVsbCkgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgIHZhciBzZWVuID0gW107XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGdldExlbmd0aChhcnJheSk7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHZhbHVlID0gYXJyYXlbaV0sXG4gICAgICAgICAgY29tcHV0ZWQgPSBpdGVyYXRlZSA/IGl0ZXJhdGVlKHZhbHVlLCBpLCBhcnJheSkgOiB2YWx1ZTtcbiAgICAgIGlmIChpc1NvcnRlZCkge1xuICAgICAgICBpZiAoIWkgfHwgc2VlbiAhPT0gY29tcHV0ZWQpIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICAgICAgc2VlbiA9IGNvbXB1dGVkO1xuICAgICAgfSBlbHNlIGlmIChpdGVyYXRlZSkge1xuICAgICAgICBpZiAoIV8uY29udGFpbnMoc2VlbiwgY29tcHV0ZWQpKSB7XG4gICAgICAgICAgc2Vlbi5wdXNoKGNvbXB1dGVkKTtcbiAgICAgICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIV8uY29udGFpbnMocmVzdWx0LCB2YWx1ZSkpIHtcbiAgICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFByb2R1Y2UgYW4gYXJyYXkgdGhhdCBjb250YWlucyB0aGUgdW5pb246IGVhY2ggZGlzdGluY3QgZWxlbWVudCBmcm9tIGFsbCBvZlxuICAvLyB0aGUgcGFzc2VkLWluIGFycmF5cy5cbiAgXy51bmlvbiA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBfLnVuaXEoZmxhdHRlbihhcmd1bWVudHMsIHRydWUsIHRydWUpKTtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGFuIGFycmF5IHRoYXQgY29udGFpbnMgZXZlcnkgaXRlbSBzaGFyZWQgYmV0d2VlbiBhbGwgdGhlXG4gIC8vIHBhc3NlZC1pbiBhcnJheXMuXG4gIF8uaW50ZXJzZWN0aW9uID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICB2YXIgcmVzdWx0ID0gW107XG4gICAgdmFyIGFyZ3NMZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBnZXRMZW5ndGgoYXJyYXkpOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBpdGVtID0gYXJyYXlbaV07XG4gICAgICBpZiAoXy5jb250YWlucyhyZXN1bHQsIGl0ZW0pKSBjb250aW51ZTtcbiAgICAgIGZvciAodmFyIGogPSAxOyBqIDwgYXJnc0xlbmd0aDsgaisrKSB7XG4gICAgICAgIGlmICghXy5jb250YWlucyhhcmd1bWVudHNbal0sIGl0ZW0pKSBicmVhaztcbiAgICAgIH1cbiAgICAgIGlmIChqID09PSBhcmdzTGVuZ3RoKSByZXN1bHQucHVzaChpdGVtKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBUYWtlIHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gb25lIGFycmF5IGFuZCBhIG51bWJlciBvZiBvdGhlciBhcnJheXMuXG4gIC8vIE9ubHkgdGhlIGVsZW1lbnRzIHByZXNlbnQgaW4ganVzdCB0aGUgZmlyc3QgYXJyYXkgd2lsbCByZW1haW4uXG4gIF8uZGlmZmVyZW5jZSA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgdmFyIHJlc3QgPSBmbGF0dGVuKGFyZ3VtZW50cywgdHJ1ZSwgdHJ1ZSwgMSk7XG4gICAgcmV0dXJuIF8uZmlsdGVyKGFycmF5LCBmdW5jdGlvbih2YWx1ZSl7XG4gICAgICByZXR1cm4gIV8uY29udGFpbnMocmVzdCwgdmFsdWUpO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIFppcCB0b2dldGhlciBtdWx0aXBsZSBsaXN0cyBpbnRvIGEgc2luZ2xlIGFycmF5IC0tIGVsZW1lbnRzIHRoYXQgc2hhcmVcbiAgLy8gYW4gaW5kZXggZ28gdG9nZXRoZXIuXG4gIF8uemlwID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIF8udW56aXAoYXJndW1lbnRzKTtcbiAgfTtcblxuICAvLyBDb21wbGVtZW50IG9mIF8uemlwLiBVbnppcCBhY2NlcHRzIGFuIGFycmF5IG9mIGFycmF5cyBhbmQgZ3JvdXBzXG4gIC8vIGVhY2ggYXJyYXkncyBlbGVtZW50cyBvbiBzaGFyZWQgaW5kaWNlc1xuICBfLnVuemlwID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICB2YXIgbGVuZ3RoID0gYXJyYXkgJiYgXy5tYXgoYXJyYXksIGdldExlbmd0aCkubGVuZ3RoIHx8IDA7XG4gICAgdmFyIHJlc3VsdCA9IEFycmF5KGxlbmd0aCk7XG5cbiAgICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICByZXN1bHRbaW5kZXhdID0gXy5wbHVjayhhcnJheSwgaW5kZXgpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIENvbnZlcnRzIGxpc3RzIGludG8gb2JqZWN0cy4gUGFzcyBlaXRoZXIgYSBzaW5nbGUgYXJyYXkgb2YgYFtrZXksIHZhbHVlXWBcbiAgLy8gcGFpcnMsIG9yIHR3byBwYXJhbGxlbCBhcnJheXMgb2YgdGhlIHNhbWUgbGVuZ3RoIC0tIG9uZSBvZiBrZXlzLCBhbmQgb25lIG9mXG4gIC8vIHRoZSBjb3JyZXNwb25kaW5nIHZhbHVlcy5cbiAgXy5vYmplY3QgPSBmdW5jdGlvbihsaXN0LCB2YWx1ZXMpIHtcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGdldExlbmd0aChsaXN0KTsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAodmFsdWVzKSB7XG4gICAgICAgIHJlc3VsdFtsaXN0W2ldXSA9IHZhbHVlc1tpXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdFtsaXN0W2ldWzBdXSA9IGxpc3RbaV1bMV07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gR2VuZXJhdG9yIGZ1bmN0aW9uIHRvIGNyZWF0ZSB0aGUgZmluZEluZGV4IGFuZCBmaW5kTGFzdEluZGV4IGZ1bmN0aW9uc1xuICBmdW5jdGlvbiBjcmVhdGVQcmVkaWNhdGVJbmRleEZpbmRlcihkaXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oYXJyYXksIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICAgIHZhciBsZW5ndGggPSBnZXRMZW5ndGgoYXJyYXkpO1xuICAgICAgdmFyIGluZGV4ID0gZGlyID4gMCA/IDAgOiBsZW5ndGggLSAxO1xuICAgICAgZm9yICg7IGluZGV4ID49IDAgJiYgaW5kZXggPCBsZW5ndGg7IGluZGV4ICs9IGRpcikge1xuICAgICAgICBpZiAocHJlZGljYXRlKGFycmF5W2luZGV4XSwgaW5kZXgsIGFycmF5KSkgcmV0dXJuIGluZGV4O1xuICAgICAgfVxuICAgICAgcmV0dXJuIC0xO1xuICAgIH07XG4gIH1cblxuICAvLyBSZXR1cm5zIHRoZSBmaXJzdCBpbmRleCBvbiBhbiBhcnJheS1saWtlIHRoYXQgcGFzc2VzIGEgcHJlZGljYXRlIHRlc3RcbiAgXy5maW5kSW5kZXggPSBjcmVhdGVQcmVkaWNhdGVJbmRleEZpbmRlcigxKTtcbiAgXy5maW5kTGFzdEluZGV4ID0gY3JlYXRlUHJlZGljYXRlSW5kZXhGaW5kZXIoLTEpO1xuXG4gIC8vIFVzZSBhIGNvbXBhcmF0b3IgZnVuY3Rpb24gdG8gZmlndXJlIG91dCB0aGUgc21hbGxlc3QgaW5kZXggYXQgd2hpY2hcbiAgLy8gYW4gb2JqZWN0IHNob3VsZCBiZSBpbnNlcnRlZCBzbyBhcyB0byBtYWludGFpbiBvcmRlci4gVXNlcyBiaW5hcnkgc2VhcmNoLlxuICBfLnNvcnRlZEluZGV4ID0gZnVuY3Rpb24oYXJyYXksIG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0LCAxKTtcbiAgICB2YXIgdmFsdWUgPSBpdGVyYXRlZShvYmopO1xuICAgIHZhciBsb3cgPSAwLCBoaWdoID0gZ2V0TGVuZ3RoKGFycmF5KTtcbiAgICB3aGlsZSAobG93IDwgaGlnaCkge1xuICAgICAgdmFyIG1pZCA9IE1hdGguZmxvb3IoKGxvdyArIGhpZ2gpIC8gMik7XG4gICAgICBpZiAoaXRlcmF0ZWUoYXJyYXlbbWlkXSkgPCB2YWx1ZSkgbG93ID0gbWlkICsgMTsgZWxzZSBoaWdoID0gbWlkO1xuICAgIH1cbiAgICByZXR1cm4gbG93O1xuICB9O1xuXG4gIC8vIEdlbmVyYXRvciBmdW5jdGlvbiB0byBjcmVhdGUgdGhlIGluZGV4T2YgYW5kIGxhc3RJbmRleE9mIGZ1bmN0aW9uc1xuICBmdW5jdGlvbiBjcmVhdGVJbmRleEZpbmRlcihkaXIsIHByZWRpY2F0ZUZpbmQsIHNvcnRlZEluZGV4KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGFycmF5LCBpdGVtLCBpZHgpIHtcbiAgICAgIHZhciBpID0gMCwgbGVuZ3RoID0gZ2V0TGVuZ3RoKGFycmF5KTtcbiAgICAgIGlmICh0eXBlb2YgaWR4ID09ICdudW1iZXInKSB7XG4gICAgICAgIGlmIChkaXIgPiAwKSB7XG4gICAgICAgICAgICBpID0gaWR4ID49IDAgPyBpZHggOiBNYXRoLm1heChpZHggKyBsZW5ndGgsIGkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGVuZ3RoID0gaWR4ID49IDAgPyBNYXRoLm1pbihpZHggKyAxLCBsZW5ndGgpIDogaWR4ICsgbGVuZ3RoICsgMTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChzb3J0ZWRJbmRleCAmJiBpZHggJiYgbGVuZ3RoKSB7XG4gICAgICAgIGlkeCA9IHNvcnRlZEluZGV4KGFycmF5LCBpdGVtKTtcbiAgICAgICAgcmV0dXJuIGFycmF5W2lkeF0gPT09IGl0ZW0gPyBpZHggOiAtMTtcbiAgICAgIH1cbiAgICAgIGlmIChpdGVtICE9PSBpdGVtKSB7XG4gICAgICAgIGlkeCA9IHByZWRpY2F0ZUZpbmQoc2xpY2UuY2FsbChhcnJheSwgaSwgbGVuZ3RoKSwgXy5pc05hTik7XG4gICAgICAgIHJldHVybiBpZHggPj0gMCA/IGlkeCArIGkgOiAtMTtcbiAgICAgIH1cbiAgICAgIGZvciAoaWR4ID0gZGlyID4gMCA/IGkgOiBsZW5ndGggLSAxOyBpZHggPj0gMCAmJiBpZHggPCBsZW5ndGg7IGlkeCArPSBkaXIpIHtcbiAgICAgICAgaWYgKGFycmF5W2lkeF0gPT09IGl0ZW0pIHJldHVybiBpZHg7XG4gICAgICB9XG4gICAgICByZXR1cm4gLTE7XG4gICAgfTtcbiAgfVxuXG4gIC8vIFJldHVybiB0aGUgcG9zaXRpb24gb2YgdGhlIGZpcnN0IG9jY3VycmVuY2Ugb2YgYW4gaXRlbSBpbiBhbiBhcnJheSxcbiAgLy8gb3IgLTEgaWYgdGhlIGl0ZW0gaXMgbm90IGluY2x1ZGVkIGluIHRoZSBhcnJheS5cbiAgLy8gSWYgdGhlIGFycmF5IGlzIGxhcmdlIGFuZCBhbHJlYWR5IGluIHNvcnQgb3JkZXIsIHBhc3MgYHRydWVgXG4gIC8vIGZvciAqKmlzU29ydGVkKiogdG8gdXNlIGJpbmFyeSBzZWFyY2guXG4gIF8uaW5kZXhPZiA9IGNyZWF0ZUluZGV4RmluZGVyKDEsIF8uZmluZEluZGV4LCBfLnNvcnRlZEluZGV4KTtcbiAgXy5sYXN0SW5kZXhPZiA9IGNyZWF0ZUluZGV4RmluZGVyKC0xLCBfLmZpbmRMYXN0SW5kZXgpO1xuXG4gIC8vIEdlbmVyYXRlIGFuIGludGVnZXIgQXJyYXkgY29udGFpbmluZyBhbiBhcml0aG1ldGljIHByb2dyZXNzaW9uLiBBIHBvcnQgb2ZcbiAgLy8gdGhlIG5hdGl2ZSBQeXRob24gYHJhbmdlKClgIGZ1bmN0aW9uLiBTZWVcbiAgLy8gW3RoZSBQeXRob24gZG9jdW1lbnRhdGlvbl0oaHR0cDovL2RvY3MucHl0aG9uLm9yZy9saWJyYXJ5L2Z1bmN0aW9ucy5odG1sI3JhbmdlKS5cbiAgXy5yYW5nZSA9IGZ1bmN0aW9uKHN0YXJ0LCBzdG9wLCBzdGVwKSB7XG4gICAgaWYgKHN0b3AgPT0gbnVsbCkge1xuICAgICAgc3RvcCA9IHN0YXJ0IHx8IDA7XG4gICAgICBzdGFydCA9IDA7XG4gICAgfVxuICAgIHN0ZXAgPSBzdGVwIHx8IDE7XG5cbiAgICB2YXIgbGVuZ3RoID0gTWF0aC5tYXgoTWF0aC5jZWlsKChzdG9wIC0gc3RhcnQpIC8gc3RlcCksIDApO1xuICAgIHZhciByYW5nZSA9IEFycmF5KGxlbmd0aCk7XG5cbiAgICBmb3IgKHZhciBpZHggPSAwOyBpZHggPCBsZW5ndGg7IGlkeCsrLCBzdGFydCArPSBzdGVwKSB7XG4gICAgICByYW5nZVtpZHhdID0gc3RhcnQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJhbmdlO1xuICB9O1xuXG4gIC8vIEZ1bmN0aW9uIChhaGVtKSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gRGV0ZXJtaW5lcyB3aGV0aGVyIHRvIGV4ZWN1dGUgYSBmdW5jdGlvbiBhcyBhIGNvbnN0cnVjdG9yXG4gIC8vIG9yIGEgbm9ybWFsIGZ1bmN0aW9uIHdpdGggdGhlIHByb3ZpZGVkIGFyZ3VtZW50c1xuICB2YXIgZXhlY3V0ZUJvdW5kID0gZnVuY3Rpb24oc291cmNlRnVuYywgYm91bmRGdW5jLCBjb250ZXh0LCBjYWxsaW5nQ29udGV4dCwgYXJncykge1xuICAgIGlmICghKGNhbGxpbmdDb250ZXh0IGluc3RhbmNlb2YgYm91bmRGdW5jKSkgcmV0dXJuIHNvdXJjZUZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgdmFyIHNlbGYgPSBiYXNlQ3JlYXRlKHNvdXJjZUZ1bmMucHJvdG90eXBlKTtcbiAgICB2YXIgcmVzdWx0ID0gc291cmNlRnVuYy5hcHBseShzZWxmLCBhcmdzKTtcbiAgICBpZiAoXy5pc09iamVjdChyZXN1bHQpKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBzZWxmO1xuICB9O1xuXG4gIC8vIENyZWF0ZSBhIGZ1bmN0aW9uIGJvdW5kIHRvIGEgZ2l2ZW4gb2JqZWN0IChhc3NpZ25pbmcgYHRoaXNgLCBhbmQgYXJndW1lbnRzLFxuICAvLyBvcHRpb25hbGx5KS4gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYEZ1bmN0aW9uLmJpbmRgIGlmXG4gIC8vIGF2YWlsYWJsZS5cbiAgXy5iaW5kID0gZnVuY3Rpb24oZnVuYywgY29udGV4dCkge1xuICAgIGlmIChuYXRpdmVCaW5kICYmIGZ1bmMuYmluZCA9PT0gbmF0aXZlQmluZCkgcmV0dXJuIG5hdGl2ZUJpbmQuYXBwbHkoZnVuYywgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgICBpZiAoIV8uaXNGdW5jdGlvbihmdW5jKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignQmluZCBtdXN0IGJlIGNhbGxlZCBvbiBhIGZ1bmN0aW9uJyk7XG4gICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgdmFyIGJvdW5kID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZXhlY3V0ZUJvdW5kKGZ1bmMsIGJvdW5kLCBjb250ZXh0LCB0aGlzLCBhcmdzLmNvbmNhdChzbGljZS5jYWxsKGFyZ3VtZW50cykpKTtcbiAgICB9O1xuICAgIHJldHVybiBib3VuZDtcbiAgfTtcblxuICAvLyBQYXJ0aWFsbHkgYXBwbHkgYSBmdW5jdGlvbiBieSBjcmVhdGluZyBhIHZlcnNpb24gdGhhdCBoYXMgaGFkIHNvbWUgb2YgaXRzXG4gIC8vIGFyZ3VtZW50cyBwcmUtZmlsbGVkLCB3aXRob3V0IGNoYW5naW5nIGl0cyBkeW5hbWljIGB0aGlzYCBjb250ZXh0LiBfIGFjdHNcbiAgLy8gYXMgYSBwbGFjZWhvbGRlciwgYWxsb3dpbmcgYW55IGNvbWJpbmF0aW9uIG9mIGFyZ3VtZW50cyB0byBiZSBwcmUtZmlsbGVkLlxuICBfLnBhcnRpYWwgPSBmdW5jdGlvbihmdW5jKSB7XG4gICAgdmFyIGJvdW5kQXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICB2YXIgYm91bmQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBwb3NpdGlvbiA9IDAsIGxlbmd0aCA9IGJvdW5kQXJncy5sZW5ndGg7XG4gICAgICB2YXIgYXJncyA9IEFycmF5KGxlbmd0aCk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGFyZ3NbaV0gPSBib3VuZEFyZ3NbaV0gPT09IF8gPyBhcmd1bWVudHNbcG9zaXRpb24rK10gOiBib3VuZEFyZ3NbaV07XG4gICAgICB9XG4gICAgICB3aGlsZSAocG9zaXRpb24gPCBhcmd1bWVudHMubGVuZ3RoKSBhcmdzLnB1c2goYXJndW1lbnRzW3Bvc2l0aW9uKytdKTtcbiAgICAgIHJldHVybiBleGVjdXRlQm91bmQoZnVuYywgYm91bmQsIHRoaXMsIHRoaXMsIGFyZ3MpO1xuICAgIH07XG4gICAgcmV0dXJuIGJvdW5kO1xuICB9O1xuXG4gIC8vIEJpbmQgYSBudW1iZXIgb2YgYW4gb2JqZWN0J3MgbWV0aG9kcyB0byB0aGF0IG9iamVjdC4gUmVtYWluaW5nIGFyZ3VtZW50c1xuICAvLyBhcmUgdGhlIG1ldGhvZCBuYW1lcyB0byBiZSBib3VuZC4gVXNlZnVsIGZvciBlbnN1cmluZyB0aGF0IGFsbCBjYWxsYmFja3NcbiAgLy8gZGVmaW5lZCBvbiBhbiBvYmplY3QgYmVsb25nIHRvIGl0LlxuICBfLmJpbmRBbGwgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgaSwgbGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aCwga2V5O1xuICAgIGlmIChsZW5ndGggPD0gMSkgdGhyb3cgbmV3IEVycm9yKCdiaW5kQWxsIG11c3QgYmUgcGFzc2VkIGZ1bmN0aW9uIG5hbWVzJyk7XG4gICAgZm9yIChpID0gMTsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBrZXkgPSBhcmd1bWVudHNbaV07XG4gICAgICBvYmpba2V5XSA9IF8uYmluZChvYmpba2V5XSwgb2JqKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBNZW1vaXplIGFuIGV4cGVuc2l2ZSBmdW5jdGlvbiBieSBzdG9yaW5nIGl0cyByZXN1bHRzLlxuICBfLm1lbW9pemUgPSBmdW5jdGlvbihmdW5jLCBoYXNoZXIpIHtcbiAgICB2YXIgbWVtb2l6ZSA9IGZ1bmN0aW9uKGtleSkge1xuICAgICAgdmFyIGNhY2hlID0gbWVtb2l6ZS5jYWNoZTtcbiAgICAgIHZhciBhZGRyZXNzID0gJycgKyAoaGFzaGVyID8gaGFzaGVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykgOiBrZXkpO1xuICAgICAgaWYgKCFfLmhhcyhjYWNoZSwgYWRkcmVzcykpIGNhY2hlW2FkZHJlc3NdID0gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgcmV0dXJuIGNhY2hlW2FkZHJlc3NdO1xuICAgIH07XG4gICAgbWVtb2l6ZS5jYWNoZSA9IHt9O1xuICAgIHJldHVybiBtZW1vaXplO1xuICB9O1xuXG4gIC8vIERlbGF5cyBhIGZ1bmN0aW9uIGZvciB0aGUgZ2l2ZW4gbnVtYmVyIG9mIG1pbGxpc2Vjb25kcywgYW5kIHRoZW4gY2FsbHNcbiAgLy8gaXQgd2l0aCB0aGUgYXJndW1lbnRzIHN1cHBsaWVkLlxuICBfLmRlbGF5ID0gZnVuY3Rpb24oZnVuYywgd2FpdCkge1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICByZXR1cm4gZnVuYy5hcHBseShudWxsLCBhcmdzKTtcbiAgICB9LCB3YWl0KTtcbiAgfTtcblxuICAvLyBEZWZlcnMgYSBmdW5jdGlvbiwgc2NoZWR1bGluZyBpdCB0byBydW4gYWZ0ZXIgdGhlIGN1cnJlbnQgY2FsbCBzdGFjayBoYXNcbiAgLy8gY2xlYXJlZC5cbiAgXy5kZWZlciA9IF8ucGFydGlhbChfLmRlbGF5LCBfLCAxKTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24sIHRoYXQsIHdoZW4gaW52b2tlZCwgd2lsbCBvbmx5IGJlIHRyaWdnZXJlZCBhdCBtb3N0IG9uY2VcbiAgLy8gZHVyaW5nIGEgZ2l2ZW4gd2luZG93IG9mIHRpbWUuIE5vcm1hbGx5LCB0aGUgdGhyb3R0bGVkIGZ1bmN0aW9uIHdpbGwgcnVuXG4gIC8vIGFzIG11Y2ggYXMgaXQgY2FuLCB3aXRob3V0IGV2ZXIgZ29pbmcgbW9yZSB0aGFuIG9uY2UgcGVyIGB3YWl0YCBkdXJhdGlvbjtcbiAgLy8gYnV0IGlmIHlvdSdkIGxpa2UgdG8gZGlzYWJsZSB0aGUgZXhlY3V0aW9uIG9uIHRoZSBsZWFkaW5nIGVkZ2UsIHBhc3NcbiAgLy8gYHtsZWFkaW5nOiBmYWxzZX1gLiBUbyBkaXNhYmxlIGV4ZWN1dGlvbiBvbiB0aGUgdHJhaWxpbmcgZWRnZSwgZGl0dG8uXG4gIF8udGhyb3R0bGUgPSBmdW5jdGlvbihmdW5jLCB3YWl0LCBvcHRpb25zKSB7XG4gICAgdmFyIGNvbnRleHQsIGFyZ3MsIHJlc3VsdDtcbiAgICB2YXIgdGltZW91dCA9IG51bGw7XG4gICAgdmFyIHByZXZpb3VzID0gMDtcbiAgICBpZiAoIW9wdGlvbnMpIG9wdGlvbnMgPSB7fTtcbiAgICB2YXIgbGF0ZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgIHByZXZpb3VzID0gb3B0aW9ucy5sZWFkaW5nID09PSBmYWxzZSA/IDAgOiBfLm5vdygpO1xuICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgaWYgKCF0aW1lb3V0KSBjb250ZXh0ID0gYXJncyA9IG51bGw7XG4gICAgfTtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgbm93ID0gXy5ub3coKTtcbiAgICAgIGlmICghcHJldmlvdXMgJiYgb3B0aW9ucy5sZWFkaW5nID09PSBmYWxzZSkgcHJldmlvdXMgPSBub3c7XG4gICAgICB2YXIgcmVtYWluaW5nID0gd2FpdCAtIChub3cgLSBwcmV2aW91cyk7XG4gICAgICBjb250ZXh0ID0gdGhpcztcbiAgICAgIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICBpZiAocmVtYWluaW5nIDw9IDAgfHwgcmVtYWluaW5nID4gd2FpdCkge1xuICAgICAgICBpZiAodGltZW91dCkge1xuICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgICB0aW1lb3V0ID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBwcmV2aW91cyA9IG5vdztcbiAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgICAgaWYgKCF0aW1lb3V0KSBjb250ZXh0ID0gYXJncyA9IG51bGw7XG4gICAgICB9IGVsc2UgaWYgKCF0aW1lb3V0ICYmIG9wdGlvbnMudHJhaWxpbmcgIT09IGZhbHNlKSB7XG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGxhdGVyLCByZW1haW5pbmcpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiwgdGhhdCwgYXMgbG9uZyBhcyBpdCBjb250aW51ZXMgdG8gYmUgaW52b2tlZCwgd2lsbCBub3RcbiAgLy8gYmUgdHJpZ2dlcmVkLiBUaGUgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgYWZ0ZXIgaXQgc3RvcHMgYmVpbmcgY2FsbGVkIGZvclxuICAvLyBOIG1pbGxpc2Vjb25kcy4gSWYgYGltbWVkaWF0ZWAgaXMgcGFzc2VkLCB0cmlnZ2VyIHRoZSBmdW5jdGlvbiBvbiB0aGVcbiAgLy8gbGVhZGluZyBlZGdlLCBpbnN0ZWFkIG9mIHRoZSB0cmFpbGluZy5cbiAgXy5kZWJvdW5jZSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQsIGltbWVkaWF0ZSkge1xuICAgIHZhciB0aW1lb3V0LCBhcmdzLCBjb250ZXh0LCB0aW1lc3RhbXAsIHJlc3VsdDtcblxuICAgIHZhciBsYXRlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGxhc3QgPSBfLm5vdygpIC0gdGltZXN0YW1wO1xuXG4gICAgICBpZiAobGFzdCA8IHdhaXQgJiYgbGFzdCA+PSAwKSB7XG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGxhdGVyLCB3YWl0IC0gbGFzdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aW1lb3V0ID0gbnVsbDtcbiAgICAgICAgaWYgKCFpbW1lZGlhdGUpIHtcbiAgICAgICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgICAgIGlmICghdGltZW91dCkgY29udGV4dCA9IGFyZ3MgPSBudWxsO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGNvbnRleHQgPSB0aGlzO1xuICAgICAgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIHRpbWVzdGFtcCA9IF8ubm93KCk7XG4gICAgICB2YXIgY2FsbE5vdyA9IGltbWVkaWF0ZSAmJiAhdGltZW91dDtcbiAgICAgIGlmICghdGltZW91dCkgdGltZW91dCA9IHNldFRpbWVvdXQobGF0ZXIsIHdhaXQpO1xuICAgICAgaWYgKGNhbGxOb3cpIHtcbiAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgICAgY29udGV4dCA9IGFyZ3MgPSBudWxsO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyB0aGUgZmlyc3QgZnVuY3Rpb24gcGFzc2VkIGFzIGFuIGFyZ3VtZW50IHRvIHRoZSBzZWNvbmQsXG4gIC8vIGFsbG93aW5nIHlvdSB0byBhZGp1c3QgYXJndW1lbnRzLCBydW4gY29kZSBiZWZvcmUgYW5kIGFmdGVyLCBhbmRcbiAgLy8gY29uZGl0aW9uYWxseSBleGVjdXRlIHRoZSBvcmlnaW5hbCBmdW5jdGlvbi5cbiAgXy53cmFwID0gZnVuY3Rpb24oZnVuYywgd3JhcHBlcikge1xuICAgIHJldHVybiBfLnBhcnRpYWwod3JhcHBlciwgZnVuYyk7XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIG5lZ2F0ZWQgdmVyc2lvbiBvZiB0aGUgcGFzc2VkLWluIHByZWRpY2F0ZS5cbiAgXy5uZWdhdGUgPSBmdW5jdGlvbihwcmVkaWNhdGUpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gIXByZWRpY2F0ZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgaXMgdGhlIGNvbXBvc2l0aW9uIG9mIGEgbGlzdCBvZiBmdW5jdGlvbnMsIGVhY2hcbiAgLy8gY29uc3VtaW5nIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGZ1bmN0aW9uIHRoYXQgZm9sbG93cy5cbiAgXy5jb21wb3NlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgdmFyIHN0YXJ0ID0gYXJncy5sZW5ndGggLSAxO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBpID0gc3RhcnQ7XG4gICAgICB2YXIgcmVzdWx0ID0gYXJnc1tzdGFydF0uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIHdoaWxlIChpLS0pIHJlc3VsdCA9IGFyZ3NbaV0uY2FsbCh0aGlzLCByZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IHdpbGwgb25seSBiZSBleGVjdXRlZCBvbiBhbmQgYWZ0ZXIgdGhlIE50aCBjYWxsLlxuICBfLmFmdGVyID0gZnVuY3Rpb24odGltZXMsIGZ1bmMpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoLS10aW1lcyA8IDEpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIH1cbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IHdpbGwgb25seSBiZSBleGVjdXRlZCB1cCB0byAoYnV0IG5vdCBpbmNsdWRpbmcpIHRoZSBOdGggY2FsbC5cbiAgXy5iZWZvcmUgPSBmdW5jdGlvbih0aW1lcywgZnVuYykge1xuICAgIHZhciBtZW1vO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICgtLXRpbWVzID4gMCkge1xuICAgICAgICBtZW1vID0gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgfVxuICAgICAgaWYgKHRpbWVzIDw9IDEpIGZ1bmMgPSBudWxsO1xuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGV4ZWN1dGVkIGF0IG1vc3Qgb25lIHRpbWUsIG5vIG1hdHRlciBob3dcbiAgLy8gb2Z0ZW4geW91IGNhbGwgaXQuIFVzZWZ1bCBmb3IgbGF6eSBpbml0aWFsaXphdGlvbi5cbiAgXy5vbmNlID0gXy5wYXJ0aWFsKF8uYmVmb3JlLCAyKTtcblxuICAvLyBPYmplY3QgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBLZXlzIGluIElFIDwgOSB0aGF0IHdvbid0IGJlIGl0ZXJhdGVkIGJ5IGBmb3Iga2V5IGluIC4uLmAgYW5kIHRodXMgbWlzc2VkLlxuICB2YXIgaGFzRW51bUJ1ZyA9ICF7dG9TdHJpbmc6IG51bGx9LnByb3BlcnR5SXNFbnVtZXJhYmxlKCd0b1N0cmluZycpO1xuICB2YXIgbm9uRW51bWVyYWJsZVByb3BzID0gWyd2YWx1ZU9mJywgJ2lzUHJvdG90eXBlT2YnLCAndG9TdHJpbmcnLFxuICAgICAgICAgICAgICAgICAgICAgICdwcm9wZXJ0eUlzRW51bWVyYWJsZScsICdoYXNPd25Qcm9wZXJ0eScsICd0b0xvY2FsZVN0cmluZyddO1xuXG4gIGZ1bmN0aW9uIGNvbGxlY3ROb25FbnVtUHJvcHMob2JqLCBrZXlzKSB7XG4gICAgdmFyIG5vbkVudW1JZHggPSBub25FbnVtZXJhYmxlUHJvcHMubGVuZ3RoO1xuICAgIHZhciBjb25zdHJ1Y3RvciA9IG9iai5jb25zdHJ1Y3RvcjtcbiAgICB2YXIgcHJvdG8gPSAoXy5pc0Z1bmN0aW9uKGNvbnN0cnVjdG9yKSAmJiBjb25zdHJ1Y3Rvci5wcm90b3R5cGUpIHx8IE9ialByb3RvO1xuXG4gICAgLy8gQ29uc3RydWN0b3IgaXMgYSBzcGVjaWFsIGNhc2UuXG4gICAgdmFyIHByb3AgPSAnY29uc3RydWN0b3InO1xuICAgIGlmIChfLmhhcyhvYmosIHByb3ApICYmICFfLmNvbnRhaW5zKGtleXMsIHByb3ApKSBrZXlzLnB1c2gocHJvcCk7XG5cbiAgICB3aGlsZSAobm9uRW51bUlkeC0tKSB7XG4gICAgICBwcm9wID0gbm9uRW51bWVyYWJsZVByb3BzW25vbkVudW1JZHhdO1xuICAgICAgaWYgKHByb3AgaW4gb2JqICYmIG9ialtwcm9wXSAhPT0gcHJvdG9bcHJvcF0gJiYgIV8uY29udGFpbnMoa2V5cywgcHJvcCkpIHtcbiAgICAgICAga2V5cy5wdXNoKHByb3ApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFJldHJpZXZlIHRoZSBuYW1lcyBvZiBhbiBvYmplY3QncyBvd24gcHJvcGVydGllcy5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYE9iamVjdC5rZXlzYFxuICBfLmtleXMgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIV8uaXNPYmplY3Qob2JqKSkgcmV0dXJuIFtdO1xuICAgIGlmIChuYXRpdmVLZXlzKSByZXR1cm4gbmF0aXZlS2V5cyhvYmopO1xuICAgIHZhciBrZXlzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikgaWYgKF8uaGFzKG9iaiwga2V5KSkga2V5cy5wdXNoKGtleSk7XG4gICAgLy8gQWhlbSwgSUUgPCA5LlxuICAgIGlmIChoYXNFbnVtQnVnKSBjb2xsZWN0Tm9uRW51bVByb3BzKG9iaiwga2V5cyk7XG4gICAgcmV0dXJuIGtleXM7XG4gIH07XG5cbiAgLy8gUmV0cmlldmUgYWxsIHRoZSBwcm9wZXJ0eSBuYW1lcyBvZiBhbiBvYmplY3QuXG4gIF8uYWxsS2V5cyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghXy5pc09iamVjdChvYmopKSByZXR1cm4gW107XG4gICAgdmFyIGtleXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSBrZXlzLnB1c2goa2V5KTtcbiAgICAvLyBBaGVtLCBJRSA8IDkuXG4gICAgaWYgKGhhc0VudW1CdWcpIGNvbGxlY3ROb25FbnVtUHJvcHMob2JqLCBrZXlzKTtcbiAgICByZXR1cm4ga2V5cztcbiAgfTtcblxuICAvLyBSZXRyaWV2ZSB0aGUgdmFsdWVzIG9mIGFuIG9iamVjdCdzIHByb3BlcnRpZXMuXG4gIF8udmFsdWVzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGtleXMgPSBfLmtleXMob2JqKTtcbiAgICB2YXIgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgdmFyIHZhbHVlcyA9IEFycmF5KGxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFsdWVzW2ldID0gb2JqW2tleXNbaV1dO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWVzO1xuICB9O1xuXG4gIC8vIFJldHVybnMgdGhlIHJlc3VsdHMgb2YgYXBwbHlpbmcgdGhlIGl0ZXJhdGVlIHRvIGVhY2ggZWxlbWVudCBvZiB0aGUgb2JqZWN0XG4gIC8vIEluIGNvbnRyYXN0IHRvIF8ubWFwIGl0IHJldHVybnMgYW4gb2JqZWN0XG4gIF8ubWFwT2JqZWN0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gIF8ua2V5cyhvYmopLFxuICAgICAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoLFxuICAgICAgICAgIHJlc3VsdHMgPSB7fSxcbiAgICAgICAgICBjdXJyZW50S2V5O1xuICAgICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICBjdXJyZW50S2V5ID0ga2V5c1tpbmRleF07XG4gICAgICAgIHJlc3VsdHNbY3VycmVudEtleV0gPSBpdGVyYXRlZShvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaik7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICAvLyBDb252ZXJ0IGFuIG9iamVjdCBpbnRvIGEgbGlzdCBvZiBgW2tleSwgdmFsdWVdYCBwYWlycy5cbiAgXy5wYWlycyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgdmFyIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgIHZhciBwYWlycyA9IEFycmF5KGxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgcGFpcnNbaV0gPSBba2V5c1tpXSwgb2JqW2tleXNbaV1dXTtcbiAgICB9XG4gICAgcmV0dXJuIHBhaXJzO1xuICB9O1xuXG4gIC8vIEludmVydCB0aGUga2V5cyBhbmQgdmFsdWVzIG9mIGFuIG9iamVjdC4gVGhlIHZhbHVlcyBtdXN0IGJlIHNlcmlhbGl6YWJsZS5cbiAgXy5pbnZlcnQgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgdmFyIGtleXMgPSBfLmtleXMob2JqKTtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgcmVzdWx0W29ialtrZXlzW2ldXV0gPSBrZXlzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHNvcnRlZCBsaXN0IG9mIHRoZSBmdW5jdGlvbiBuYW1lcyBhdmFpbGFibGUgb24gdGhlIG9iamVjdC5cbiAgLy8gQWxpYXNlZCBhcyBgbWV0aG9kc2BcbiAgXy5mdW5jdGlvbnMgPSBfLm1ldGhvZHMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgbmFtZXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoXy5pc0Z1bmN0aW9uKG9ialtrZXldKSkgbmFtZXMucHVzaChrZXkpO1xuICAgIH1cbiAgICByZXR1cm4gbmFtZXMuc29ydCgpO1xuICB9O1xuXG4gIC8vIEV4dGVuZCBhIGdpdmVuIG9iamVjdCB3aXRoIGFsbCB0aGUgcHJvcGVydGllcyBpbiBwYXNzZWQtaW4gb2JqZWN0KHMpLlxuICBfLmV4dGVuZCA9IGNyZWF0ZUFzc2lnbmVyKF8uYWxsS2V5cyk7XG5cbiAgLy8gQXNzaWducyBhIGdpdmVuIG9iamVjdCB3aXRoIGFsbCB0aGUgb3duIHByb3BlcnRpZXMgaW4gdGhlIHBhc3NlZC1pbiBvYmplY3QocylcbiAgLy8gKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL09iamVjdC9hc3NpZ24pXG4gIF8uZXh0ZW5kT3duID0gXy5hc3NpZ24gPSBjcmVhdGVBc3NpZ25lcihfLmtleXMpO1xuXG4gIC8vIFJldHVybnMgdGhlIGZpcnN0IGtleSBvbiBhbiBvYmplY3QgdGhhdCBwYXNzZXMgYSBwcmVkaWNhdGUgdGVzdFxuICBfLmZpbmRLZXkgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgdmFyIGtleXMgPSBfLmtleXMob2JqKSwga2V5O1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBrZXkgPSBrZXlzW2ldO1xuICAgICAgaWYgKHByZWRpY2F0ZShvYmpba2V5XSwga2V5LCBvYmopKSByZXR1cm4ga2V5O1xuICAgIH1cbiAgfTtcblxuICAvLyBSZXR1cm4gYSBjb3B5IG9mIHRoZSBvYmplY3Qgb25seSBjb250YWluaW5nIHRoZSB3aGl0ZWxpc3RlZCBwcm9wZXJ0aWVzLlxuICBfLnBpY2sgPSBmdW5jdGlvbihvYmplY3QsIG9pdGVyYXRlZSwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHQgPSB7fSwgb2JqID0gb2JqZWN0LCBpdGVyYXRlZSwga2V5cztcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKF8uaXNGdW5jdGlvbihvaXRlcmF0ZWUpKSB7XG4gICAgICBrZXlzID0gXy5hbGxLZXlzKG9iaik7XG4gICAgICBpdGVyYXRlZSA9IG9wdGltaXplQ2Iob2l0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICB9IGVsc2Uge1xuICAgICAga2V5cyA9IGZsYXR0ZW4oYXJndW1lbnRzLCBmYWxzZSwgZmFsc2UsIDEpO1xuICAgICAgaXRlcmF0ZWUgPSBmdW5jdGlvbih2YWx1ZSwga2V5LCBvYmopIHsgcmV0dXJuIGtleSBpbiBvYmo7IH07XG4gICAgICBvYmogPSBPYmplY3Qob2JqKTtcbiAgICB9XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGtleXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBrZXkgPSBrZXlzW2ldO1xuICAgICAgdmFyIHZhbHVlID0gb2JqW2tleV07XG4gICAgICBpZiAoaXRlcmF0ZWUodmFsdWUsIGtleSwgb2JqKSkgcmVzdWx0W2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAgLy8gUmV0dXJuIGEgY29weSBvZiB0aGUgb2JqZWN0IHdpdGhvdXQgdGhlIGJsYWNrbGlzdGVkIHByb3BlcnRpZXMuXG4gIF8ub21pdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpZiAoXy5pc0Z1bmN0aW9uKGl0ZXJhdGVlKSkge1xuICAgICAgaXRlcmF0ZWUgPSBfLm5lZ2F0ZShpdGVyYXRlZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBrZXlzID0gXy5tYXAoZmxhdHRlbihhcmd1bWVudHMsIGZhbHNlLCBmYWxzZSwgMSksIFN0cmluZyk7XG4gICAgICBpdGVyYXRlZSA9IGZ1bmN0aW9uKHZhbHVlLCBrZXkpIHtcbiAgICAgICAgcmV0dXJuICFfLmNvbnRhaW5zKGtleXMsIGtleSk7XG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gXy5waWNrKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpO1xuICB9O1xuXG4gIC8vIEZpbGwgaW4gYSBnaXZlbiBvYmplY3Qgd2l0aCBkZWZhdWx0IHByb3BlcnRpZXMuXG4gIF8uZGVmYXVsdHMgPSBjcmVhdGVBc3NpZ25lcihfLmFsbEtleXMsIHRydWUpO1xuXG4gIC8vIENyZWF0ZXMgYW4gb2JqZWN0IHRoYXQgaW5oZXJpdHMgZnJvbSB0aGUgZ2l2ZW4gcHJvdG90eXBlIG9iamVjdC5cbiAgLy8gSWYgYWRkaXRpb25hbCBwcm9wZXJ0aWVzIGFyZSBwcm92aWRlZCB0aGVuIHRoZXkgd2lsbCBiZSBhZGRlZCB0byB0aGVcbiAgLy8gY3JlYXRlZCBvYmplY3QuXG4gIF8uY3JlYXRlID0gZnVuY3Rpb24ocHJvdG90eXBlLCBwcm9wcykge1xuICAgIHZhciByZXN1bHQgPSBiYXNlQ3JlYXRlKHByb3RvdHlwZSk7XG4gICAgaWYgKHByb3BzKSBfLmV4dGVuZE93bihyZXN1bHQsIHByb3BzKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIENyZWF0ZSBhIChzaGFsbG93LWNsb25lZCkgZHVwbGljYXRlIG9mIGFuIG9iamVjdC5cbiAgXy5jbG9uZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghXy5pc09iamVjdChvYmopKSByZXR1cm4gb2JqO1xuICAgIHJldHVybiBfLmlzQXJyYXkob2JqKSA/IG9iai5zbGljZSgpIDogXy5leHRlbmQoe30sIG9iaik7XG4gIH07XG5cbiAgLy8gSW52b2tlcyBpbnRlcmNlcHRvciB3aXRoIHRoZSBvYmosIGFuZCB0aGVuIHJldHVybnMgb2JqLlxuICAvLyBUaGUgcHJpbWFyeSBwdXJwb3NlIG9mIHRoaXMgbWV0aG9kIGlzIHRvIFwidGFwIGludG9cIiBhIG1ldGhvZCBjaGFpbiwgaW5cbiAgLy8gb3JkZXIgdG8gcGVyZm9ybSBvcGVyYXRpb25zIG9uIGludGVybWVkaWF0ZSByZXN1bHRzIHdpdGhpbiB0aGUgY2hhaW4uXG4gIF8udGFwID0gZnVuY3Rpb24ob2JqLCBpbnRlcmNlcHRvcikge1xuICAgIGludGVyY2VwdG9yKG9iaik7XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBSZXR1cm5zIHdoZXRoZXIgYW4gb2JqZWN0IGhhcyBhIGdpdmVuIHNldCBvZiBga2V5OnZhbHVlYCBwYWlycy5cbiAgXy5pc01hdGNoID0gZnVuY3Rpb24ob2JqZWN0LCBhdHRycykge1xuICAgIHZhciBrZXlzID0gXy5rZXlzKGF0dHJzKSwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgaWYgKG9iamVjdCA9PSBudWxsKSByZXR1cm4gIWxlbmd0aDtcbiAgICB2YXIgb2JqID0gT2JqZWN0KG9iamVjdCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGtleSA9IGtleXNbaV07XG4gICAgICBpZiAoYXR0cnNba2V5XSAhPT0gb2JqW2tleV0gfHwgIShrZXkgaW4gb2JqKSkgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuXG4gIC8vIEludGVybmFsIHJlY3Vyc2l2ZSBjb21wYXJpc29uIGZ1bmN0aW9uIGZvciBgaXNFcXVhbGAuXG4gIHZhciBlcSA9IGZ1bmN0aW9uKGEsIGIsIGFTdGFjaywgYlN0YWNrKSB7XG4gICAgLy8gSWRlbnRpY2FsIG9iamVjdHMgYXJlIGVxdWFsLiBgMCA9PT0gLTBgLCBidXQgdGhleSBhcmVuJ3QgaWRlbnRpY2FsLlxuICAgIC8vIFNlZSB0aGUgW0hhcm1vbnkgYGVnYWxgIHByb3Bvc2FsXShodHRwOi8vd2lraS5lY21hc2NyaXB0Lm9yZy9kb2t1LnBocD9pZD1oYXJtb255OmVnYWwpLlxuICAgIGlmIChhID09PSBiKSByZXR1cm4gYSAhPT0gMCB8fCAxIC8gYSA9PT0gMSAvIGI7XG4gICAgLy8gQSBzdHJpY3QgY29tcGFyaXNvbiBpcyBuZWNlc3NhcnkgYmVjYXVzZSBgbnVsbCA9PSB1bmRlZmluZWRgLlxuICAgIGlmIChhID09IG51bGwgfHwgYiA9PSBudWxsKSByZXR1cm4gYSA9PT0gYjtcbiAgICAvLyBVbndyYXAgYW55IHdyYXBwZWQgb2JqZWN0cy5cbiAgICBpZiAoYSBpbnN0YW5jZW9mIF8pIGEgPSBhLl93cmFwcGVkO1xuICAgIGlmIChiIGluc3RhbmNlb2YgXykgYiA9IGIuX3dyYXBwZWQ7XG4gICAgLy8gQ29tcGFyZSBgW1tDbGFzc11dYCBuYW1lcy5cbiAgICB2YXIgY2xhc3NOYW1lID0gdG9TdHJpbmcuY2FsbChhKTtcbiAgICBpZiAoY2xhc3NOYW1lICE9PSB0b1N0cmluZy5jYWxsKGIpKSByZXR1cm4gZmFsc2U7XG4gICAgc3dpdGNoIChjbGFzc05hbWUpIHtcbiAgICAgIC8vIFN0cmluZ3MsIG51bWJlcnMsIHJlZ3VsYXIgZXhwcmVzc2lvbnMsIGRhdGVzLCBhbmQgYm9vbGVhbnMgYXJlIGNvbXBhcmVkIGJ5IHZhbHVlLlxuICAgICAgY2FzZSAnW29iamVjdCBSZWdFeHBdJzpcbiAgICAgIC8vIFJlZ0V4cHMgYXJlIGNvZXJjZWQgdG8gc3RyaW5ncyBmb3IgY29tcGFyaXNvbiAoTm90ZTogJycgKyAvYS9pID09PSAnL2EvaScpXG4gICAgICBjYXNlICdbb2JqZWN0IFN0cmluZ10nOlxuICAgICAgICAvLyBQcmltaXRpdmVzIGFuZCB0aGVpciBjb3JyZXNwb25kaW5nIG9iamVjdCB3cmFwcGVycyBhcmUgZXF1aXZhbGVudDsgdGh1cywgYFwiNVwiYCBpc1xuICAgICAgICAvLyBlcXVpdmFsZW50IHRvIGBuZXcgU3RyaW5nKFwiNVwiKWAuXG4gICAgICAgIHJldHVybiAnJyArIGEgPT09ICcnICsgYjtcbiAgICAgIGNhc2UgJ1tvYmplY3QgTnVtYmVyXSc6XG4gICAgICAgIC8vIGBOYU5gcyBhcmUgZXF1aXZhbGVudCwgYnV0IG5vbi1yZWZsZXhpdmUuXG4gICAgICAgIC8vIE9iamVjdChOYU4pIGlzIGVxdWl2YWxlbnQgdG8gTmFOXG4gICAgICAgIGlmICgrYSAhPT0gK2EpIHJldHVybiArYiAhPT0gK2I7XG4gICAgICAgIC8vIEFuIGBlZ2FsYCBjb21wYXJpc29uIGlzIHBlcmZvcm1lZCBmb3Igb3RoZXIgbnVtZXJpYyB2YWx1ZXMuXG4gICAgICAgIHJldHVybiArYSA9PT0gMCA/IDEgLyArYSA9PT0gMSAvIGIgOiArYSA9PT0gK2I7XG4gICAgICBjYXNlICdbb2JqZWN0IERhdGVdJzpcbiAgICAgIGNhc2UgJ1tvYmplY3QgQm9vbGVhbl0nOlxuICAgICAgICAvLyBDb2VyY2UgZGF0ZXMgYW5kIGJvb2xlYW5zIHRvIG51bWVyaWMgcHJpbWl0aXZlIHZhbHVlcy4gRGF0ZXMgYXJlIGNvbXBhcmVkIGJ5IHRoZWlyXG4gICAgICAgIC8vIG1pbGxpc2Vjb25kIHJlcHJlc2VudGF0aW9ucy4gTm90ZSB0aGF0IGludmFsaWQgZGF0ZXMgd2l0aCBtaWxsaXNlY29uZCByZXByZXNlbnRhdGlvbnNcbiAgICAgICAgLy8gb2YgYE5hTmAgYXJlIG5vdCBlcXVpdmFsZW50LlxuICAgICAgICByZXR1cm4gK2EgPT09ICtiO1xuICAgIH1cblxuICAgIHZhciBhcmVBcnJheXMgPSBjbGFzc05hbWUgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gICAgaWYgKCFhcmVBcnJheXMpIHtcbiAgICAgIGlmICh0eXBlb2YgYSAhPSAnb2JqZWN0JyB8fCB0eXBlb2YgYiAhPSAnb2JqZWN0JykgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAvLyBPYmplY3RzIHdpdGggZGlmZmVyZW50IGNvbnN0cnVjdG9ycyBhcmUgbm90IGVxdWl2YWxlbnQsIGJ1dCBgT2JqZWN0YHMgb3IgYEFycmF5YHNcbiAgICAgIC8vIGZyb20gZGlmZmVyZW50IGZyYW1lcyBhcmUuXG4gICAgICB2YXIgYUN0b3IgPSBhLmNvbnN0cnVjdG9yLCBiQ3RvciA9IGIuY29uc3RydWN0b3I7XG4gICAgICBpZiAoYUN0b3IgIT09IGJDdG9yICYmICEoXy5pc0Z1bmN0aW9uKGFDdG9yKSAmJiBhQ3RvciBpbnN0YW5jZW9mIGFDdG9yICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXy5pc0Z1bmN0aW9uKGJDdG9yKSAmJiBiQ3RvciBpbnN0YW5jZW9mIGJDdG9yKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAmJiAoJ2NvbnN0cnVjdG9yJyBpbiBhICYmICdjb25zdHJ1Y3RvcicgaW4gYikpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBBc3N1bWUgZXF1YWxpdHkgZm9yIGN5Y2xpYyBzdHJ1Y3R1cmVzLiBUaGUgYWxnb3JpdGhtIGZvciBkZXRlY3RpbmcgY3ljbGljXG4gICAgLy8gc3RydWN0dXJlcyBpcyBhZGFwdGVkIGZyb20gRVMgNS4xIHNlY3Rpb24gMTUuMTIuMywgYWJzdHJhY3Qgb3BlcmF0aW9uIGBKT2AuXG5cbiAgICAvLyBJbml0aWFsaXppbmcgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgLy8gSXQncyBkb25lIGhlcmUgc2luY2Ugd2Ugb25seSBuZWVkIHRoZW0gZm9yIG9iamVjdHMgYW5kIGFycmF5cyBjb21wYXJpc29uLlxuICAgIGFTdGFjayA9IGFTdGFjayB8fCBbXTtcbiAgICBiU3RhY2sgPSBiU3RhY2sgfHwgW107XG4gICAgdmFyIGxlbmd0aCA9IGFTdGFjay5sZW5ndGg7XG4gICAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgICAvLyBMaW5lYXIgc2VhcmNoLiBQZXJmb3JtYW5jZSBpcyBpbnZlcnNlbHkgcHJvcG9ydGlvbmFsIHRvIHRoZSBudW1iZXIgb2ZcbiAgICAgIC8vIHVuaXF1ZSBuZXN0ZWQgc3RydWN0dXJlcy5cbiAgICAgIGlmIChhU3RhY2tbbGVuZ3RoXSA9PT0gYSkgcmV0dXJuIGJTdGFja1tsZW5ndGhdID09PSBiO1xuICAgIH1cblxuICAgIC8vIEFkZCB0aGUgZmlyc3Qgb2JqZWN0IHRvIHRoZSBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0cy5cbiAgICBhU3RhY2sucHVzaChhKTtcbiAgICBiU3RhY2sucHVzaChiKTtcblxuICAgIC8vIFJlY3Vyc2l2ZWx5IGNvbXBhcmUgb2JqZWN0cyBhbmQgYXJyYXlzLlxuICAgIGlmIChhcmVBcnJheXMpIHtcbiAgICAgIC8vIENvbXBhcmUgYXJyYXkgbGVuZ3RocyB0byBkZXRlcm1pbmUgaWYgYSBkZWVwIGNvbXBhcmlzb24gaXMgbmVjZXNzYXJ5LlxuICAgICAgbGVuZ3RoID0gYS5sZW5ndGg7XG4gICAgICBpZiAobGVuZ3RoICE9PSBiLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgICAgLy8gRGVlcCBjb21wYXJlIHRoZSBjb250ZW50cywgaWdub3Jpbmcgbm9uLW51bWVyaWMgcHJvcGVydGllcy5cbiAgICAgIHdoaWxlIChsZW5ndGgtLSkge1xuICAgICAgICBpZiAoIWVxKGFbbGVuZ3RoXSwgYltsZW5ndGhdLCBhU3RhY2ssIGJTdGFjaykpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRGVlcCBjb21wYXJlIG9iamVjdHMuXG4gICAgICB2YXIga2V5cyA9IF8ua2V5cyhhKSwga2V5O1xuICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgICAvLyBFbnN1cmUgdGhhdCBib3RoIG9iamVjdHMgY29udGFpbiB0aGUgc2FtZSBudW1iZXIgb2YgcHJvcGVydGllcyBiZWZvcmUgY29tcGFyaW5nIGRlZXAgZXF1YWxpdHkuXG4gICAgICBpZiAoXy5rZXlzKGIpLmxlbmd0aCAhPT0gbGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICAgICAgLy8gRGVlcCBjb21wYXJlIGVhY2ggbWVtYmVyXG4gICAgICAgIGtleSA9IGtleXNbbGVuZ3RoXTtcbiAgICAgICAgaWYgKCEoXy5oYXMoYiwga2V5KSAmJiBlcShhW2tleV0sIGJba2V5XSwgYVN0YWNrLCBiU3RhY2spKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBSZW1vdmUgdGhlIGZpcnN0IG9iamVjdCBmcm9tIHRoZSBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0cy5cbiAgICBhU3RhY2sucG9wKCk7XG4gICAgYlN0YWNrLnBvcCgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG4gIC8vIFBlcmZvcm0gYSBkZWVwIGNvbXBhcmlzb24gdG8gY2hlY2sgaWYgdHdvIG9iamVjdHMgYXJlIGVxdWFsLlxuICBfLmlzRXF1YWwgPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgcmV0dXJuIGVxKGEsIGIpO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gYXJyYXksIHN0cmluZywgb3Igb2JqZWN0IGVtcHR5P1xuICAvLyBBbiBcImVtcHR5XCIgb2JqZWN0IGhhcyBubyBlbnVtZXJhYmxlIG93bi1wcm9wZXJ0aWVzLlxuICBfLmlzRW1wdHkgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiB0cnVlO1xuICAgIGlmIChpc0FycmF5TGlrZShvYmopICYmIChfLmlzQXJyYXkob2JqKSB8fCBfLmlzU3RyaW5nKG9iaikgfHwgXy5pc0FyZ3VtZW50cyhvYmopKSkgcmV0dXJuIG9iai5sZW5ndGggPT09IDA7XG4gICAgcmV0dXJuIF8ua2V5cyhvYmopLmxlbmd0aCA9PT0gMDtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGEgRE9NIGVsZW1lbnQ/XG4gIF8uaXNFbGVtZW50ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuICEhKG9iaiAmJiBvYmoubm9kZVR5cGUgPT09IDEpO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgYW4gYXJyYXk/XG4gIC8vIERlbGVnYXRlcyB0byBFQ01BNSdzIG5hdGl2ZSBBcnJheS5pc0FycmF5XG4gIF8uaXNBcnJheSA9IG5hdGl2ZUlzQXJyYXkgfHwgZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIHRvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhcmlhYmxlIGFuIG9iamVjdD9cbiAgXy5pc09iamVjdCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciB0eXBlID0gdHlwZW9mIG9iajtcbiAgICByZXR1cm4gdHlwZSA9PT0gJ2Z1bmN0aW9uJyB8fCB0eXBlID09PSAnb2JqZWN0JyAmJiAhIW9iajtcbiAgfTtcblxuICAvLyBBZGQgc29tZSBpc1R5cGUgbWV0aG9kczogaXNBcmd1bWVudHMsIGlzRnVuY3Rpb24sIGlzU3RyaW5nLCBpc051bWJlciwgaXNEYXRlLCBpc1JlZ0V4cCwgaXNFcnJvci5cbiAgXy5lYWNoKFsnQXJndW1lbnRzJywgJ0Z1bmN0aW9uJywgJ1N0cmluZycsICdOdW1iZXInLCAnRGF0ZScsICdSZWdFeHAnLCAnRXJyb3InXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIF9bJ2lzJyArIG5hbWVdID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gdG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCAnICsgbmFtZSArICddJztcbiAgICB9O1xuICB9KTtcblxuICAvLyBEZWZpbmUgYSBmYWxsYmFjayB2ZXJzaW9uIG9mIHRoZSBtZXRob2QgaW4gYnJvd3NlcnMgKGFoZW0sIElFIDwgOSksIHdoZXJlXG4gIC8vIHRoZXJlIGlzbid0IGFueSBpbnNwZWN0YWJsZSBcIkFyZ3VtZW50c1wiIHR5cGUuXG4gIGlmICghXy5pc0FyZ3VtZW50cyhhcmd1bWVudHMpKSB7XG4gICAgXy5pc0FyZ3VtZW50cyA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIF8uaGFzKG9iaiwgJ2NhbGxlZScpO1xuICAgIH07XG4gIH1cblxuICAvLyBPcHRpbWl6ZSBgaXNGdW5jdGlvbmAgaWYgYXBwcm9wcmlhdGUuIFdvcmsgYXJvdW5kIHNvbWUgdHlwZW9mIGJ1Z3MgaW4gb2xkIHY4LFxuICAvLyBJRSAxMSAoIzE2MjEpLCBhbmQgaW4gU2FmYXJpIDggKCMxOTI5KS5cbiAgaWYgKHR5cGVvZiAvLi8gIT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgSW50OEFycmF5ICE9ICdvYmplY3QnKSB7XG4gICAgXy5pc0Z1bmN0aW9uID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gdHlwZW9mIG9iaiA9PSAnZnVuY3Rpb24nIHx8IGZhbHNlO1xuICAgIH07XG4gIH1cblxuICAvLyBJcyBhIGdpdmVuIG9iamVjdCBhIGZpbml0ZSBudW1iZXI/XG4gIF8uaXNGaW5pdGUgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gaXNGaW5pdGUob2JqKSAmJiAhaXNOYU4ocGFyc2VGbG9hdChvYmopKTtcbiAgfTtcblxuICAvLyBJcyB0aGUgZ2l2ZW4gdmFsdWUgYE5hTmA/IChOYU4gaXMgdGhlIG9ubHkgbnVtYmVyIHdoaWNoIGRvZXMgbm90IGVxdWFsIGl0c2VsZikuXG4gIF8uaXNOYU4gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gXy5pc051bWJlcihvYmopICYmIG9iaiAhPT0gK29iajtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGEgYm9vbGVhbj9cbiAgXy5pc0Jvb2xlYW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSB0cnVlIHx8IG9iaiA9PT0gZmFsc2UgfHwgdG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCBCb29sZWFuXSc7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBlcXVhbCB0byBudWxsP1xuICBfLmlzTnVsbCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IG51bGw7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YXJpYWJsZSB1bmRlZmluZWQ/XG4gIF8uaXNVbmRlZmluZWQgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSB2b2lkIDA7XG4gIH07XG5cbiAgLy8gU2hvcnRjdXQgZnVuY3Rpb24gZm9yIGNoZWNraW5nIGlmIGFuIG9iamVjdCBoYXMgYSBnaXZlbiBwcm9wZXJ0eSBkaXJlY3RseVxuICAvLyBvbiBpdHNlbGYgKGluIG90aGVyIHdvcmRzLCBub3Qgb24gYSBwcm90b3R5cGUpLlxuICBfLmhhcyA9IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG4gICAgcmV0dXJuIG9iaiAhPSBudWxsICYmIGhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpO1xuICB9O1xuXG4gIC8vIFV0aWxpdHkgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gUnVuIFVuZGVyc2NvcmUuanMgaW4gKm5vQ29uZmxpY3QqIG1vZGUsIHJldHVybmluZyB0aGUgYF9gIHZhcmlhYmxlIHRvIGl0c1xuICAvLyBwcmV2aW91cyBvd25lci4gUmV0dXJucyBhIHJlZmVyZW5jZSB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QuXG4gIF8ubm9Db25mbGljdCA9IGZ1bmN0aW9uKCkge1xuICAgIHJvb3QuXyA9IHByZXZpb3VzVW5kZXJzY29yZTtcbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICAvLyBLZWVwIHRoZSBpZGVudGl0eSBmdW5jdGlvbiBhcm91bmQgZm9yIGRlZmF1bHQgaXRlcmF0ZWVzLlxuICBfLmlkZW50aXR5ID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH07XG5cbiAgLy8gUHJlZGljYXRlLWdlbmVyYXRpbmcgZnVuY3Rpb25zLiBPZnRlbiB1c2VmdWwgb3V0c2lkZSBvZiBVbmRlcnNjb3JlLlxuICBfLmNvbnN0YW50ID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfTtcbiAgfTtcblxuICBfLm5vb3AgPSBmdW5jdGlvbigpe307XG5cbiAgXy5wcm9wZXJ0eSA9IHByb3BlcnR5O1xuXG4gIC8vIEdlbmVyYXRlcyBhIGZ1bmN0aW9uIGZvciBhIGdpdmVuIG9iamVjdCB0aGF0IHJldHVybnMgYSBnaXZlbiBwcm9wZXJ0eS5cbiAgXy5wcm9wZXJ0eU9mID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PSBudWxsID8gZnVuY3Rpb24oKXt9IDogZnVuY3Rpb24oa2V5KSB7XG4gICAgICByZXR1cm4gb2JqW2tleV07XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgcHJlZGljYXRlIGZvciBjaGVja2luZyB3aGV0aGVyIGFuIG9iamVjdCBoYXMgYSBnaXZlbiBzZXQgb2ZcbiAgLy8gYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8ubWF0Y2hlciA9IF8ubWF0Y2hlcyA9IGZ1bmN0aW9uKGF0dHJzKSB7XG4gICAgYXR0cnMgPSBfLmV4dGVuZE93bih7fSwgYXR0cnMpO1xuICAgIHJldHVybiBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBfLmlzTWF0Y2gob2JqLCBhdHRycyk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSdW4gYSBmdW5jdGlvbiAqKm4qKiB0aW1lcy5cbiAgXy50aW1lcyA9IGZ1bmN0aW9uKG4sIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgdmFyIGFjY3VtID0gQXJyYXkoTWF0aC5tYXgoMCwgbikpO1xuICAgIGl0ZXJhdGVlID0gb3B0aW1pemVDYihpdGVyYXRlZSwgY29udGV4dCwgMSk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyBpKyspIGFjY3VtW2ldID0gaXRlcmF0ZWUoaSk7XG4gICAgcmV0dXJuIGFjY3VtO1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHJhbmRvbSBpbnRlZ2VyIGJldHdlZW4gbWluIGFuZCBtYXggKGluY2x1c2l2ZSkuXG4gIF8ucmFuZG9tID0gZnVuY3Rpb24obWluLCBtYXgpIHtcbiAgICBpZiAobWF4ID09IG51bGwpIHtcbiAgICAgIG1heCA9IG1pbjtcbiAgICAgIG1pbiA9IDA7XG4gICAgfVxuICAgIHJldHVybiBtaW4gKyBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAobWF4IC0gbWluICsgMSkpO1xuICB9O1xuXG4gIC8vIEEgKHBvc3NpYmx5IGZhc3Rlcikgd2F5IHRvIGdldCB0aGUgY3VycmVudCB0aW1lc3RhbXAgYXMgYW4gaW50ZWdlci5cbiAgXy5ub3cgPSBEYXRlLm5vdyB8fCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIH07XG5cbiAgIC8vIExpc3Qgb2YgSFRNTCBlbnRpdGllcyBmb3IgZXNjYXBpbmcuXG4gIHZhciBlc2NhcGVNYXAgPSB7XG4gICAgJyYnOiAnJmFtcDsnLFxuICAgICc8JzogJyZsdDsnLFxuICAgICc+JzogJyZndDsnLFxuICAgICdcIic6ICcmcXVvdDsnLFxuICAgIFwiJ1wiOiAnJiN4Mjc7JyxcbiAgICAnYCc6ICcmI3g2MDsnXG4gIH07XG4gIHZhciB1bmVzY2FwZU1hcCA9IF8uaW52ZXJ0KGVzY2FwZU1hcCk7XG5cbiAgLy8gRnVuY3Rpb25zIGZvciBlc2NhcGluZyBhbmQgdW5lc2NhcGluZyBzdHJpbmdzIHRvL2Zyb20gSFRNTCBpbnRlcnBvbGF0aW9uLlxuICB2YXIgY3JlYXRlRXNjYXBlciA9IGZ1bmN0aW9uKG1hcCkge1xuICAgIHZhciBlc2NhcGVyID0gZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgIHJldHVybiBtYXBbbWF0Y2hdO1xuICAgIH07XG4gICAgLy8gUmVnZXhlcyBmb3IgaWRlbnRpZnlpbmcgYSBrZXkgdGhhdCBuZWVkcyB0byBiZSBlc2NhcGVkXG4gICAgdmFyIHNvdXJjZSA9ICcoPzonICsgXy5rZXlzKG1hcCkuam9pbignfCcpICsgJyknO1xuICAgIHZhciB0ZXN0UmVnZXhwID0gUmVnRXhwKHNvdXJjZSk7XG4gICAgdmFyIHJlcGxhY2VSZWdleHAgPSBSZWdFeHAoc291cmNlLCAnZycpO1xuICAgIHJldHVybiBmdW5jdGlvbihzdHJpbmcpIHtcbiAgICAgIHN0cmluZyA9IHN0cmluZyA9PSBudWxsID8gJycgOiAnJyArIHN0cmluZztcbiAgICAgIHJldHVybiB0ZXN0UmVnZXhwLnRlc3Qoc3RyaW5nKSA/IHN0cmluZy5yZXBsYWNlKHJlcGxhY2VSZWdleHAsIGVzY2FwZXIpIDogc3RyaW5nO1xuICAgIH07XG4gIH07XG4gIF8uZXNjYXBlID0gY3JlYXRlRXNjYXBlcihlc2NhcGVNYXApO1xuICBfLnVuZXNjYXBlID0gY3JlYXRlRXNjYXBlcih1bmVzY2FwZU1hcCk7XG5cbiAgLy8gSWYgdGhlIHZhbHVlIG9mIHRoZSBuYW1lZCBgcHJvcGVydHlgIGlzIGEgZnVuY3Rpb24gdGhlbiBpbnZva2UgaXQgd2l0aCB0aGVcbiAgLy8gYG9iamVjdGAgYXMgY29udGV4dDsgb3RoZXJ3aXNlLCByZXR1cm4gaXQuXG4gIF8ucmVzdWx0ID0gZnVuY3Rpb24ob2JqZWN0LCBwcm9wZXJ0eSwgZmFsbGJhY2spIHtcbiAgICB2YXIgdmFsdWUgPSBvYmplY3QgPT0gbnVsbCA/IHZvaWQgMCA6IG9iamVjdFtwcm9wZXJ0eV07XG4gICAgaWYgKHZhbHVlID09PSB2b2lkIDApIHtcbiAgICAgIHZhbHVlID0gZmFsbGJhY2s7XG4gICAgfVxuICAgIHJldHVybiBfLmlzRnVuY3Rpb24odmFsdWUpID8gdmFsdWUuY2FsbChvYmplY3QpIDogdmFsdWU7XG4gIH07XG5cbiAgLy8gR2VuZXJhdGUgYSB1bmlxdWUgaW50ZWdlciBpZCAodW5pcXVlIHdpdGhpbiB0aGUgZW50aXJlIGNsaWVudCBzZXNzaW9uKS5cbiAgLy8gVXNlZnVsIGZvciB0ZW1wb3JhcnkgRE9NIGlkcy5cbiAgdmFyIGlkQ291bnRlciA9IDA7XG4gIF8udW5pcXVlSWQgPSBmdW5jdGlvbihwcmVmaXgpIHtcbiAgICB2YXIgaWQgPSArK2lkQ291bnRlciArICcnO1xuICAgIHJldHVybiBwcmVmaXggPyBwcmVmaXggKyBpZCA6IGlkO1xuICB9O1xuXG4gIC8vIEJ5IGRlZmF1bHQsIFVuZGVyc2NvcmUgdXNlcyBFUkItc3R5bGUgdGVtcGxhdGUgZGVsaW1pdGVycywgY2hhbmdlIHRoZVxuICAvLyBmb2xsb3dpbmcgdGVtcGxhdGUgc2V0dGluZ3MgdG8gdXNlIGFsdGVybmF0aXZlIGRlbGltaXRlcnMuXG4gIF8udGVtcGxhdGVTZXR0aW5ncyA9IHtcbiAgICBldmFsdWF0ZSAgICA6IC88JShbXFxzXFxTXSs/KSU+L2csXG4gICAgaW50ZXJwb2xhdGUgOiAvPCU9KFtcXHNcXFNdKz8pJT4vZyxcbiAgICBlc2NhcGUgICAgICA6IC88JS0oW1xcc1xcU10rPyklPi9nXG4gIH07XG5cbiAgLy8gV2hlbiBjdXN0b21pemluZyBgdGVtcGxhdGVTZXR0aW5nc2AsIGlmIHlvdSBkb24ndCB3YW50IHRvIGRlZmluZSBhblxuICAvLyBpbnRlcnBvbGF0aW9uLCBldmFsdWF0aW9uIG9yIGVzY2FwaW5nIHJlZ2V4LCB3ZSBuZWVkIG9uZSB0aGF0IGlzXG4gIC8vIGd1YXJhbnRlZWQgbm90IHRvIG1hdGNoLlxuICB2YXIgbm9NYXRjaCA9IC8oLileLztcblxuICAvLyBDZXJ0YWluIGNoYXJhY3RlcnMgbmVlZCB0byBiZSBlc2NhcGVkIHNvIHRoYXQgdGhleSBjYW4gYmUgcHV0IGludG8gYVxuICAvLyBzdHJpbmcgbGl0ZXJhbC5cbiAgdmFyIGVzY2FwZXMgPSB7XG4gICAgXCInXCI6ICAgICAgXCInXCIsXG4gICAgJ1xcXFwnOiAgICAgJ1xcXFwnLFxuICAgICdcXHInOiAgICAgJ3InLFxuICAgICdcXG4nOiAgICAgJ24nLFxuICAgICdcXHUyMDI4JzogJ3UyMDI4JyxcbiAgICAnXFx1MjAyOSc6ICd1MjAyOSdcbiAgfTtcblxuICB2YXIgZXNjYXBlciA9IC9cXFxcfCd8XFxyfFxcbnxcXHUyMDI4fFxcdTIwMjkvZztcblxuICB2YXIgZXNjYXBlQ2hhciA9IGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgcmV0dXJuICdcXFxcJyArIGVzY2FwZXNbbWF0Y2hdO1xuICB9O1xuXG4gIC8vIEphdmFTY3JpcHQgbWljcm8tdGVtcGxhdGluZywgc2ltaWxhciB0byBKb2huIFJlc2lnJ3MgaW1wbGVtZW50YXRpb24uXG4gIC8vIFVuZGVyc2NvcmUgdGVtcGxhdGluZyBoYW5kbGVzIGFyYml0cmFyeSBkZWxpbWl0ZXJzLCBwcmVzZXJ2ZXMgd2hpdGVzcGFjZSxcbiAgLy8gYW5kIGNvcnJlY3RseSBlc2NhcGVzIHF1b3RlcyB3aXRoaW4gaW50ZXJwb2xhdGVkIGNvZGUuXG4gIC8vIE5COiBgb2xkU2V0dGluZ3NgIG9ubHkgZXhpc3RzIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eS5cbiAgXy50ZW1wbGF0ZSA9IGZ1bmN0aW9uKHRleHQsIHNldHRpbmdzLCBvbGRTZXR0aW5ncykge1xuICAgIGlmICghc2V0dGluZ3MgJiYgb2xkU2V0dGluZ3MpIHNldHRpbmdzID0gb2xkU2V0dGluZ3M7XG4gICAgc2V0dGluZ3MgPSBfLmRlZmF1bHRzKHt9LCBzZXR0aW5ncywgXy50ZW1wbGF0ZVNldHRpbmdzKTtcblxuICAgIC8vIENvbWJpbmUgZGVsaW1pdGVycyBpbnRvIG9uZSByZWd1bGFyIGV4cHJlc3Npb24gdmlhIGFsdGVybmF0aW9uLlxuICAgIHZhciBtYXRjaGVyID0gUmVnRXhwKFtcbiAgICAgIChzZXR0aW5ncy5lc2NhcGUgfHwgbm9NYXRjaCkuc291cmNlLFxuICAgICAgKHNldHRpbmdzLmludGVycG9sYXRlIHx8IG5vTWF0Y2gpLnNvdXJjZSxcbiAgICAgIChzZXR0aW5ncy5ldmFsdWF0ZSB8fCBub01hdGNoKS5zb3VyY2VcbiAgICBdLmpvaW4oJ3wnKSArICd8JCcsICdnJyk7XG5cbiAgICAvLyBDb21waWxlIHRoZSB0ZW1wbGF0ZSBzb3VyY2UsIGVzY2FwaW5nIHN0cmluZyBsaXRlcmFscyBhcHByb3ByaWF0ZWx5LlxuICAgIHZhciBpbmRleCA9IDA7XG4gICAgdmFyIHNvdXJjZSA9IFwiX19wKz0nXCI7XG4gICAgdGV4dC5yZXBsYWNlKG1hdGNoZXIsIGZ1bmN0aW9uKG1hdGNoLCBlc2NhcGUsIGludGVycG9sYXRlLCBldmFsdWF0ZSwgb2Zmc2V0KSB7XG4gICAgICBzb3VyY2UgKz0gdGV4dC5zbGljZShpbmRleCwgb2Zmc2V0KS5yZXBsYWNlKGVzY2FwZXIsIGVzY2FwZUNoYXIpO1xuICAgICAgaW5kZXggPSBvZmZzZXQgKyBtYXRjaC5sZW5ndGg7XG5cbiAgICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgc291cmNlICs9IFwiJytcXG4oKF9fdD0oXCIgKyBlc2NhcGUgKyBcIikpPT1udWxsPycnOl8uZXNjYXBlKF9fdCkpK1xcbidcIjtcbiAgICAgIH0gZWxzZSBpZiAoaW50ZXJwb2xhdGUpIHtcbiAgICAgICAgc291cmNlICs9IFwiJytcXG4oKF9fdD0oXCIgKyBpbnRlcnBvbGF0ZSArIFwiKSk9PW51bGw/Jyc6X190KStcXG4nXCI7XG4gICAgICB9IGVsc2UgaWYgKGV2YWx1YXRlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIic7XFxuXCIgKyBldmFsdWF0ZSArIFwiXFxuX19wKz0nXCI7XG4gICAgICB9XG5cbiAgICAgIC8vIEFkb2JlIFZNcyBuZWVkIHRoZSBtYXRjaCByZXR1cm5lZCB0byBwcm9kdWNlIHRoZSBjb3JyZWN0IG9mZmVzdC5cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgICB9KTtcbiAgICBzb3VyY2UgKz0gXCInO1xcblwiO1xuXG4gICAgLy8gSWYgYSB2YXJpYWJsZSBpcyBub3Qgc3BlY2lmaWVkLCBwbGFjZSBkYXRhIHZhbHVlcyBpbiBsb2NhbCBzY29wZS5cbiAgICBpZiAoIXNldHRpbmdzLnZhcmlhYmxlKSBzb3VyY2UgPSAnd2l0aChvYmp8fHt9KXtcXG4nICsgc291cmNlICsgJ31cXG4nO1xuXG4gICAgc291cmNlID0gXCJ2YXIgX190LF9fcD0nJyxfX2o9QXJyYXkucHJvdG90eXBlLmpvaW4sXCIgK1xuICAgICAgXCJwcmludD1mdW5jdGlvbigpe19fcCs9X19qLmNhbGwoYXJndW1lbnRzLCcnKTt9O1xcblwiICtcbiAgICAgIHNvdXJjZSArICdyZXR1cm4gX19wO1xcbic7XG5cbiAgICB0cnkge1xuICAgICAgdmFyIHJlbmRlciA9IG5ldyBGdW5jdGlvbihzZXR0aW5ncy52YXJpYWJsZSB8fCAnb2JqJywgJ18nLCBzb3VyY2UpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGUuc291cmNlID0gc291cmNlO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG5cbiAgICB2YXIgdGVtcGxhdGUgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICByZXR1cm4gcmVuZGVyLmNhbGwodGhpcywgZGF0YSwgXyk7XG4gICAgfTtcblxuICAgIC8vIFByb3ZpZGUgdGhlIGNvbXBpbGVkIHNvdXJjZSBhcyBhIGNvbnZlbmllbmNlIGZvciBwcmVjb21waWxhdGlvbi5cbiAgICB2YXIgYXJndW1lbnQgPSBzZXR0aW5ncy52YXJpYWJsZSB8fCAnb2JqJztcbiAgICB0ZW1wbGF0ZS5zb3VyY2UgPSAnZnVuY3Rpb24oJyArIGFyZ3VtZW50ICsgJyl7XFxuJyArIHNvdXJjZSArICd9JztcblxuICAgIHJldHVybiB0ZW1wbGF0ZTtcbiAgfTtcblxuICAvLyBBZGQgYSBcImNoYWluXCIgZnVuY3Rpb24uIFN0YXJ0IGNoYWluaW5nIGEgd3JhcHBlZCBVbmRlcnNjb3JlIG9iamVjdC5cbiAgXy5jaGFpbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBpbnN0YW5jZSA9IF8ob2JqKTtcbiAgICBpbnN0YW5jZS5fY2hhaW4gPSB0cnVlO1xuICAgIHJldHVybiBpbnN0YW5jZTtcbiAgfTtcblxuICAvLyBPT1BcbiAgLy8gLS0tLS0tLS0tLS0tLS0tXG4gIC8vIElmIFVuZGVyc2NvcmUgaXMgY2FsbGVkIGFzIGEgZnVuY3Rpb24sIGl0IHJldHVybnMgYSB3cmFwcGVkIG9iamVjdCB0aGF0XG4gIC8vIGNhbiBiZSB1c2VkIE9PLXN0eWxlLiBUaGlzIHdyYXBwZXIgaG9sZHMgYWx0ZXJlZCB2ZXJzaW9ucyBvZiBhbGwgdGhlXG4gIC8vIHVuZGVyc2NvcmUgZnVuY3Rpb25zLiBXcmFwcGVkIG9iamVjdHMgbWF5IGJlIGNoYWluZWQuXG5cbiAgLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGNvbnRpbnVlIGNoYWluaW5nIGludGVybWVkaWF0ZSByZXN1bHRzLlxuICB2YXIgcmVzdWx0ID0gZnVuY3Rpb24oaW5zdGFuY2UsIG9iaikge1xuICAgIHJldHVybiBpbnN0YW5jZS5fY2hhaW4gPyBfKG9iaikuY2hhaW4oKSA6IG9iajtcbiAgfTtcblxuICAvLyBBZGQgeW91ciBvd24gY3VzdG9tIGZ1bmN0aW9ucyB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QuXG4gIF8ubWl4aW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICBfLmVhY2goXy5mdW5jdGlvbnMob2JqKSwgZnVuY3Rpb24obmFtZSkge1xuICAgICAgdmFyIGZ1bmMgPSBfW25hbWVdID0gb2JqW25hbWVdO1xuICAgICAgXy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBbdGhpcy5fd3JhcHBlZF07XG4gICAgICAgIHB1c2guYXBwbHkoYXJncywgYXJndW1lbnRzKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdCh0aGlzLCBmdW5jLmFwcGx5KF8sIGFyZ3MpKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gQWRkIGFsbCBvZiB0aGUgVW5kZXJzY29yZSBmdW5jdGlvbnMgdG8gdGhlIHdyYXBwZXIgb2JqZWN0LlxuICBfLm1peGluKF8pO1xuXG4gIC8vIEFkZCBhbGwgbXV0YXRvciBBcnJheSBmdW5jdGlvbnMgdG8gdGhlIHdyYXBwZXIuXG4gIF8uZWFjaChbJ3BvcCcsICdwdXNoJywgJ3JldmVyc2UnLCAnc2hpZnQnLCAnc29ydCcsICdzcGxpY2UnLCAndW5zaGlmdCddLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgdmFyIG1ldGhvZCA9IEFycmF5UHJvdG9bbmFtZV07XG4gICAgXy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBvYmogPSB0aGlzLl93cmFwcGVkO1xuICAgICAgbWV0aG9kLmFwcGx5KG9iaiwgYXJndW1lbnRzKTtcbiAgICAgIGlmICgobmFtZSA9PT0gJ3NoaWZ0JyB8fCBuYW1lID09PSAnc3BsaWNlJykgJiYgb2JqLmxlbmd0aCA9PT0gMCkgZGVsZXRlIG9ialswXTtcbiAgICAgIHJldHVybiByZXN1bHQodGhpcywgb2JqKTtcbiAgICB9O1xuICB9KTtcblxuICAvLyBBZGQgYWxsIGFjY2Vzc29yIEFycmF5IGZ1bmN0aW9ucyB0byB0aGUgd3JhcHBlci5cbiAgXy5lYWNoKFsnY29uY2F0JywgJ2pvaW4nLCAnc2xpY2UnXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIHZhciBtZXRob2QgPSBBcnJheVByb3RvW25hbWVdO1xuICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcmVzdWx0KHRoaXMsIG1ldGhvZC5hcHBseSh0aGlzLl93cmFwcGVkLCBhcmd1bWVudHMpKTtcbiAgICB9O1xuICB9KTtcblxuICAvLyBFeHRyYWN0cyB0aGUgcmVzdWx0IGZyb20gYSB3cmFwcGVkIGFuZCBjaGFpbmVkIG9iamVjdC5cbiAgXy5wcm90b3R5cGUudmFsdWUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5fd3JhcHBlZDtcbiAgfTtcblxuICAvLyBQcm92aWRlIHVud3JhcHBpbmcgcHJveHkgZm9yIHNvbWUgbWV0aG9kcyB1c2VkIGluIGVuZ2luZSBvcGVyYXRpb25zXG4gIC8vIHN1Y2ggYXMgYXJpdGhtZXRpYyBhbmQgSlNPTiBzdHJpbmdpZmljYXRpb24uXG4gIF8ucHJvdG90eXBlLnZhbHVlT2YgPSBfLnByb3RvdHlwZS50b0pTT04gPSBfLnByb3RvdHlwZS52YWx1ZTtcblxuICBfLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiAnJyArIHRoaXMuX3dyYXBwZWQ7XG4gIH07XG5cbiAgLy8gQU1EIHJlZ2lzdHJhdGlvbiBoYXBwZW5zIGF0IHRoZSBlbmQgZm9yIGNvbXBhdGliaWxpdHkgd2l0aCBBTUQgbG9hZGVyc1xuICAvLyB0aGF0IG1heSBub3QgZW5mb3JjZSBuZXh0LXR1cm4gc2VtYW50aWNzIG9uIG1vZHVsZXMuIEV2ZW4gdGhvdWdoIGdlbmVyYWxcbiAgLy8gcHJhY3RpY2UgZm9yIEFNRCByZWdpc3RyYXRpb24gaXMgdG8gYmUgYW5vbnltb3VzLCB1bmRlcnNjb3JlIHJlZ2lzdGVyc1xuICAvLyBhcyBhIG5hbWVkIG1vZHVsZSBiZWNhdXNlLCBsaWtlIGpRdWVyeSwgaXQgaXMgYSBiYXNlIGxpYnJhcnkgdGhhdCBpc1xuICAvLyBwb3B1bGFyIGVub3VnaCB0byBiZSBidW5kbGVkIGluIGEgdGhpcmQgcGFydHkgbGliLCBidXQgbm90IGJlIHBhcnQgb2ZcbiAgLy8gYW4gQU1EIGxvYWQgcmVxdWVzdC4gVGhvc2UgY2FzZXMgY291bGQgZ2VuZXJhdGUgYW4gZXJyb3Igd2hlbiBhblxuICAvLyBhbm9ueW1vdXMgZGVmaW5lKCkgaXMgY2FsbGVkIG91dHNpZGUgb2YgYSBsb2FkZXIgcmVxdWVzdC5cbiAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZSgndW5kZXJzY29yZScsIFtdLCBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBfO1xuICAgIH0pO1xuICB9XG59LmNhbGwodGhpcykpO1xuIiwiLy8gVmVuZG9yc1xudmFyICQgPSByZXF1aXJlKCdqcXVlcnknKTtcbnZhciBCYWNrYm9uZSA9IHJlcXVpcmUoJ2JhY2tib25lJyk7XG5CYWNrYm9uZS4kID0gJDtcbnZhciBNYXJpb25ldHRlID0gcmVxdWlyZSgnYmFja2JvbmUubWFyaW9uZXR0ZScpO1xudmFyIEJhY2tib25lUmFwaGFlbCA9IHJlcXVpcmUoJy4vdmVuZG9ycy9iYWNrYm9uZS5yYXBoYWVsLmpzJylcbi8vIExvY2FsXG52YXIgVG9kb01vZHVsZSA9IHJlcXVpcmUoJy4vbW9kdWxlcy90b2RvL21vZHVsZScpO1xuXG4vLyBhcHAgYm9vdHN0cmFwXG52YXIgYXBwID0gbmV3IE1hcmlvbmV0dGUuQXBwbGljYXRpb24oKTtcbmFwcC5tb2R1bGUoJ3RvZG8nLCBUb2RvTW9kdWxlKTtcbmFwcC5zdGFydCgpO1xuQmFja2JvbmUuaGlzdG9yeS5zdGFydCgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGFwcDtcbiIsInZhciBNYXJpb25ldHRlID0gcmVxdWlyZSgnYmFja2JvbmUubWFyaW9uZXR0ZScpO1xuXG52YXIgQmFja2JvbmUgPSByZXF1aXJlKCdiYWNrYm9uZScpO1xuXG5cbnZhciBUb2RvTGF5b3V0ID0gcmVxdWlyZSgnLi92aWV3cy9sYXlvdXQvbGF5b3V0Jyk7XG52YXIgVG9kb3NDb2xsZWN0aW9uID0gcmVxdWlyZSgnLi9tb2RlbHMvdG9kb3MnKTtcblxudmFyIHBlcmlvZGUgPSAxMDAwXG5cblxubW9kdWxlLmV4cG9ydHMgPSBNYXJpb25ldHRlLkNvbnRyb2xsZXIuZXh0ZW5kKHtcblxuICAgIG9uU3RhcnQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB0aGlzLnRvZG9zQ29sbGVjdGlvbiA9IG5ldyBUb2Rvc0NvbGxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy50b2Rvc0xheW91dCA9IG5ldyBUb2RvTGF5b3V0KHt0b2Rvc0NvbGxlY3Rpb246IHRoaXMudG9kb3NDb2xsZWN0aW9ufSk7XG5cbiAgICAgICAgdmFyIG9uU3VjY2VzcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5vcHRpb25zLnRvZG9SZWdpb24uc2hvdyh0aGlzLnRvZG9zTGF5b3V0KTtcbiAgICAgICAgfS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnRvZG9zQ29sbGVjdGlvbi5mZXRjaCh7c3VjY2Vzczogb25TdWNjZXNzLFxuICAgICAgICAgICAgY29tcGxldGU6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgc2V0SW50ZXJ2YWwoZnVuY3Rpb24oKSB7IEJhY2tib25lLnRyaWdnZXIoJ3RpY2s6MzBzZWNzJyk7IH0sIHBlcmlvZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgY29uc29sZS5sb2cgKHRoaXMudG9kb3NDb2xsZWN0aW9uKVxuICAgIH0sXG5cblxuICAgIGZpbHRlckl0ZW1zOiBmdW5jdGlvbihmaWx0ZXIpIHtcbiAgICAgICAgLy8gZmlsdGVyID0gKGZpbHRlciAmJiBmaWx0ZXIudHJpbSgpIHx8ICdhbGwnKTtcbiAgICAgICAgLy8gdGhpcy50b2Rvc0xheW91dC51cGRhdGVGaWx0ZXIoZmlsdGVyKTtcbiAgICB9XG5cbn0pO1xuIiwidmFyIEJhY2tib25lID0gcmVxdWlyZSgnYmFja2JvbmUnKTtcblxuXG5cbm1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcblxuICAgIGRlZmF1bHRzOiB7XG4gICAgICAgIHJhZGlvOiAxMDBcbiAgICB9LFxuXG4gICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBpZiAodGhpcy5pc05ldygpKSB7XG4gICAgICAgIC8vICAgICB0aGlzLnNldCgnY3JlYXRlZCcsIERhdGUubm93KCkpO1xuICAgICAgICAvLyB9XG4gICAgfSxcblxuICAgIGdldENvbG9yOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBjb2xvcnMgPSBbXG4gICAgICAgICAgICBcIiNiZjAwMDBcIixcbiAgICAgICAgICAgIFwiI2JmNTYwMFwiLFxuICAgICAgICAgICAgXCIjYmZhYzAwXCIsXG4gICAgICAgICAgICBcIiM3Y2JmMDBcIixcbiAgICAgICAgICAgIFwiIzI2YmYwMFwiLFxuICAgICAgICAgIF1cblxuICAgICAgICAgIGZyZWVfcGxhY2VzID0gdGhpcy5nZXQoJ2ZyZWVfcGxhY2VzJylcbiAgICAgICAgICByZXR1cm4gY29sb3JzW2ZyZWVfcGxhY2VzXVxuICAgIH0sXG5cbiAgICAvLyB0b2dnbGU6IGZ1bmN0aW9uICgpIHtcbiAgICAvLyAgICAgcmV0dXJuIHRoaXMuc2V0KCdjb21wbGV0ZWQnLCAhdGhpcy5pc0NvbXBsZXRlZCgpKTtcbiAgICAvLyB9LFxuXG4gICAgLy8gaXNDb21wbGV0ZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAvLyAgICAgcmV0dXJuIHRoaXMuZ2V0KCdjb21wbGV0ZWQnKTtcbiAgICAvLyB9XG5cbn0pOyIsInZhciBCYWNrYm9uZSA9IHJlcXVpcmUoJ2JhY2tib25lJyk7XG5CYWNrYm9uZS5Mb2NhbFN0b3JhZ2UgPSByZXF1aXJlKFwiYmFja2JvbmUubG9jYWxzdG9yYWdlXCIpO1xuXG52YXIgVGFibGVNb2RlbCA9IHJlcXVpcmUoJy4vdGFibGUnKTtcblxuXG5cbm1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuQ29sbGVjdGlvbi5leHRlbmQoe1xuXG4gICAgbW9kZWw6IFRhYmxlTW9kZWwsXG5cbiAgICAvLyBsb2NhbFN0b3JhZ2U6IG5ldyBCYWNrYm9uZS5Mb2NhbFN0b3JhZ2UoJ3RvZG9zLWJhY2tib25lLW1hcmlvbmV0dGUtYnJvd3NlcmlmeScpLFxuICAgIHVybDogJ2h0dHA6Ly9sb2NhbGhvc3Qvc2VydmV1ci9wcm9jZXNzLnBocCcsXG5cbiAgICBpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMubGlzdGVuVG8oIEJhY2tib25lLCAndGljazozMHNlY3MnLCB0aGlzLmZldGNoLCB0aGlzICk7XG4gICAgfSxcbiAgICBnZXRDb21wbGV0ZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZmlsdGVyKHRoaXMuX2lzQ29tcGxldGVkKTtcbiAgICB9LFxuXG4gICAgZmV0Y2hnOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIHJldHVybiB0aGlzLnJlamVjdCh0aGlzLl9pc0NvbXBsZXRlZCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCd5ZWgoJylcbiAgICB9LFxuXG4gICAgY29tcGFyYXRvcjogZnVuY3Rpb24gKHRvZG8pIHtcbiAgICAgICAgcmV0dXJuIHRvZG8uZ2V0KCdjcmVhdGVkJyk7XG4gICAgfSxcblxuXG5cbiAgICBfaXNDb21wbGV0ZWQ6IGZ1bmN0aW9uICh0b2RvKSB7XG4gICAgICAgIHJldHVybiB0b2RvLmlzQ29tcGxldGVkKCk7XG4gICAgfVxuXG59KTsiLCJNYXJpb25ldHRlID0gcmVxdWlyZSAnYmFja2JvbmUubWFyaW9uZXR0ZSdcblxuUm91dGVyID0gcmVxdWlyZSAnLi9yb3V0ZXInXG5Db250cm9sbGVyID0gcmVxdWlyZSAnLi9jb250cm9sbGVyJ1xuXG5cblxuY2xhc3MgVG9kb01vZHVsZSBleHRlbmRzIE1hcmlvbmV0dGUuTW9kdWxlXG5cbiAgICBpbml0aWFsaXplOiAtPlxuICAgICAgICB0aGlzLnRvZG9SZWdpb25JZCA9ICd0b2RvLW1vZHVsZS1yZWdpb24nXG5cblxuICAgIG9uU3RhcnQ6IC0+XG4gICAgICAgICMgZW5jYXBzdWxhdGUgZWFjaCBtb2R1bGUgaW4gYSBjb250YWluZXJcbiAgICAgICAgIyBzbyB5b3UgY2FuIGRvIHdoYXQgeW91IHdhbnQgd2l0aG91dFxuICAgICAgICAjIGFmZmVjdGluZyBvdGhlciBtb2R1bGVzXG4gICAgICAgIHRoaXMuX2NyZWF0ZUNvbnRhaW5lcigpXG4gICAgICAgIHRoaXMuX2FkZFJlZ2lvbigpXG4gICAgICAgIHRoaXMuX3N0YXJ0TWVkaWF0b3IoKVxuXG4gICAgb25TdG9wOiAtPlxuICAgICAgICAjIHJlbW92ZSByZWdpb24gJiBjb250YWluZXIgd2hlbiBzdG9wcGluZ1xuICAgICAgICAjIHVubG9hZCBvZiBtb2R1bGUgY291bGQgYmUgaW1wb3J0YW50IGluIGJpZyBhcHAgLyBtb2R1bGVzXG4gICAgICAgIHRoaXMuX3N0b3BNZWRpYXRvcigpXG4gICAgICAgIHRoaXMuX3JlbW92ZVJlZ2lvbigpXG4gICAgICAgIHRoaXMuX2Rlc3Ryb3lDb250YWluZXIoKVxuXG5cblxuICAgIF9jcmVhdGVDb250YWluZXI6IC0+XG4gICAgICAgIG5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50ICdkaXYnXG4gICAgICAgIG5vZGUuaWQgPSB0aGlzLnRvZG9SZWdpb25JZFxuICAgICAgICBub2RlLmNsYXNzID0gJ2NvbnRlbnQnXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQgbm9kZVxuXG4gICAgX2FkZFJlZ2lvbjogLT5cbiAgICAgICAgdGhpcy5hcHAuYWRkUmVnaW9ucyB0b2RvUmVnaW9uOiAnIycgKyB0aGlzLnRvZG9SZWdpb25JZFxuXG4gICAgX3N0YXJ0TWVkaWF0b3I6IC0+XG4gICAgICAgIHRoaXMuY29udHJvbGxlciA9IG5ldyBDb250cm9sbGVyIHRvZG9SZWdpb246IHRoaXMuYXBwLnRvZG9SZWdpb25cbiAgICAgICAgcm91dGVyID0gbmV3IFJvdXRlciBjb250cm9sbGVyOiB0aGlzLmNvbnRyb2xsZXJcblxuXG5cblxuICAgIF9kZXN0cm95Q29udGFpbmVyOiAtPlxuICAgICAgICBub2RlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQgdGhpcy50b2RvUmVnaW9uSWRcbiAgICAgICAgbm9kZT8ucGFyZW50RWxlbWVudC5yZW1vdmVDaGlsZCBub2RlXG5cbiAgICBfcmVtb3ZlUmVnaW9uOiAtPlxuICAgICAgICB0aGlzLmFwcC5yZW1vdmVSZWdpb24gJ3RvZG9SZWdpb24nXG5cbiAgICBfc3RvcE1lZGlhdG9yOiAtPlxuICAgICAgICB0aGlzLmNvbnRyb2xsZXIuc3RvcCgpXG5cblxuXG5cblxuXG5tb2R1bGUuZXhwb3J0cyA9IFRvZG9Nb2R1bGVcblxuIiwidmFyIE1hcmlvbmV0dGUgPSByZXF1aXJlKCdiYWNrYm9uZS5tYXJpb25ldHRlJyk7XG5cblxuXG5tb2R1bGUuZXhwb3J0cyA9IE1hcmlvbmV0dGUuQXBwUm91dGVyLmV4dGVuZCh7XG5cbiAgICAvLyBleHRlbmQgQXBwUm91dGVyIHRvIHRlbGwgdGhlIGNvbnRyb2xsZXJcbiAgICAvLyB3aGVuIHRoZSByb3V0ZXIgaXMgb2tcbiAgICBjb25zdHJ1Y3RvcjogZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICBNYXJpb25ldHRlLkFwcFJvdXRlci5wcm90b3R5cGUuY29uc3RydWN0b3IuY2FsbCh0aGlzLCBvcHRpb25zKTtcbiAgICAgICAgdGhpcy5fZ2V0Q29udHJvbGxlcigpLnRyaWdnZXJNZXRob2QoJ3N0YXJ0Jyk7XG4gICAgfSxcblxuXG4gICAgYXBwUm91dGVzOiB7XG4gICAgICAgICcqZmlsdGVyJzogJ2ZpbHRlckl0ZW1zJ1xuICAgIH1cblxufSk7IiwiLy8gaGJzZnkgY29tcGlsZWQgSGFuZGxlYmFycyB0ZW1wbGF0ZVxudmFyIEhhbmRsZWJhcnMgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnMudGVtcGxhdGUoZnVuY3Rpb24gKEhhbmRsZWJhcnMsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICB0aGlzLmNvbXBpbGVySW5mbyA9IFs0LCc+PSAxLjAuMCddO1xuaGVscGVycyA9IHRoaXMubWVyZ2UoaGVscGVycywgSGFuZGxlYmFycy5oZWxwZXJzKTsgZGF0YSA9IGRhdGEgfHwge307XG4gIHZhciBidWZmZXIgPSBcIlwiLCBzdGFjazEsIGhlbHBlciwgZnVuY3Rpb25UeXBlPVwiZnVuY3Rpb25cIiwgZXNjYXBlRXhwcmVzc2lvbj10aGlzLmVzY2FwZUV4cHJlc3Npb24sIHNlbGY9dGhpcztcblxuZnVuY3Rpb24gcHJvZ3JhbTEoZGVwdGgwLGRhdGEpIHtcbiAgXG4gIFxuICByZXR1cm4gXCJjbGFzcz1cXFwiaGlkZGVuXFxcIlwiO1xuICB9XG5cbiAgYnVmZmVyICs9IFwiPHNwYW4gaWQ9XFxcInRvZG8tY291bnRcXFwiPlxcbiAgICA8c3Ryb25nPlwiO1xuICBpZiAoaGVscGVyID0gaGVscGVycy5hY3RpdmVDb3VudCkgeyBzdGFjazEgPSBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pOyB9XG4gIGVsc2UgeyBoZWxwZXIgPSAoZGVwdGgwICYmIGRlcHRoMC5hY3RpdmVDb3VudCk7IHN0YWNrMSA9IHR5cGVvZiBoZWxwZXIgPT09IGZ1bmN0aW9uVHlwZSA/IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSkgOiBoZWxwZXI7IH1cbiAgYnVmZmVyICs9IGVzY2FwZUV4cHJlc3Npb24oc3RhY2sxKVxuICAgICsgXCI8L3N0cm9uZz4gXCI7XG4gIGlmIChoZWxwZXIgPSBoZWxwZXJzLmFjdGl2ZUNvdW50TGFiZWwpIHsgc3RhY2sxID0gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KTsgfVxuICBlbHNlIHsgaGVscGVyID0gKGRlcHRoMCAmJiBkZXB0aDAuYWN0aXZlQ291bnRMYWJlbCk7IHN0YWNrMSA9IHR5cGVvZiBoZWxwZXIgPT09IGZ1bmN0aW9uVHlwZSA/IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSkgOiBoZWxwZXI7IH1cbiAgYnVmZmVyICs9IGVzY2FwZUV4cHJlc3Npb24oc3RhY2sxKVxuICAgICsgXCJcXG48L3NwYW4+XFxuPHVsIGlkPVxcXCJmaWx0ZXJzXFxcIj5cXG4gICAgPGxpPlxcbiAgICAgICAgPGEgaHJlZj1cXFwiI1xcXCI+QWxsPC9hPlxcbiAgICA8L2xpPlxcbiAgICA8bGk+XFxuICAgICAgICA8YSBocmVmPVxcXCIjYWN0aXZlXFxcIj5BY3RpdmU8L2E+XFxuICAgIDwvbGk+XFxuICAgIDxsaT5cXG4gICAgICAgIDxhIGhyZWY9XFxcIiNjb21wbGV0ZWRcXFwiPkNvbXBsZXRlZDwvYT5cXG4gICAgPC9saT5cXG48L3VsPlxcbjxidXR0b24gaWQ9XFxcImNsZWFyLWNvbXBsZXRlZFxcXCIgXCI7XG4gIHN0YWNrMSA9IGhlbHBlcnMudW5sZXNzLmNhbGwoZGVwdGgwLCAoZGVwdGgwICYmIGRlcHRoMC5jb21wbGV0ZWRDb3VudCksIHtoYXNoOnt9LGludmVyc2U6c2VsZi5ub29wLGZuOnNlbGYucHJvZ3JhbSgxLCBwcm9ncmFtMSwgZGF0YSksZGF0YTpkYXRhfSk7XG4gIGlmKHN0YWNrMSB8fCBzdGFjazEgPT09IDApIHsgYnVmZmVyICs9IHN0YWNrMTsgfVxuICBidWZmZXIgKz0gXCI+XFxuICAgIENsZWFyIGNvbXBsZXRlZCAoXCI7XG4gIGlmIChoZWxwZXIgPSBoZWxwZXJzLmNvbXBsZXRlZENvdW50KSB7IHN0YWNrMSA9IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSk7IH1cbiAgZWxzZSB7IGhlbHBlciA9IChkZXB0aDAgJiYgZGVwdGgwLmNvbXBsZXRlZENvdW50KTsgc3RhY2sxID0gdHlwZW9mIGhlbHBlciA9PT0gZnVuY3Rpb25UeXBlID8gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KSA6IGhlbHBlcjsgfVxuICBidWZmZXIgKz0gZXNjYXBlRXhwcmVzc2lvbihzdGFjazEpXG4gICAgKyBcIilcXG48L2J1dHRvbj5cIjtcbiAgcmV0dXJuIGJ1ZmZlcjtcbiAgfSk7XG4iLCJ2YXIgTWFyaW9uZXR0ZSA9IHJlcXVpcmUoJ2JhY2tib25lLm1hcmlvbmV0dGUnKTtcblxudmFyIHRwbCA9IHJlcXVpcmUoJy4vZm9vdGVyLmhicycpO1xuXG5cblxubW9kdWxlLmV4cG9ydHMgPSBNYXJpb25ldHRlLkl0ZW1WaWV3LmV4dGVuZCh7XG4gICAgdGVtcGxhdGU6IHRwbCxcblxuICAgIHVpOiB7XG4gICAgICAgIGZpbHRlcnM6ICcjZmlsdGVycyBhJ1xuICAgIH0sXG5cbiAgICBldmVudHM6IHtcbiAgICAgICAgJ2NsaWNrICNjbGVhci1jb21wbGV0ZWQnOiAnb25DbGVhckNsaWNrJ1xuICAgIH0sXG5cbiAgICBjb2xsZWN0aW9uRXZlbnRzOiB7XG4gICAgICAgICdhbGwnOiAncmVuZGVyJ1xuICAgIH0sXG5cbiAgICB0ZW1wbGF0ZUhlbHBlcnM6IHtcbiAgICAgICAgYWN0aXZlQ291bnRMYWJlbDogKHRoaXMuYWN0aXZlQ291bnQgPT09IDEgPyAnaXRlbScgOiAnaXRlbXMnKSArICcgbGVmdCdcbiAgICB9LFxuXG4gICAgc2VyaWFsaXplRGF0YTogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgYWN0aXZlID0gdGhpcy5jb2xsZWN0aW9uLmdldEFjdGl2ZSgpLmxlbmd0aDtcbiAgICAgICAgdmFyIHRvdGFsID0gdGhpcy5jb2xsZWN0aW9uLmxlbmd0aDtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgYWN0aXZlQ291bnQ6IGFjdGl2ZSxcbiAgICAgICAgICAgIHRvdGFsQ291bnQ6IHRvdGFsLFxuICAgICAgICAgICAgY29tcGxldGVkQ291bnQ6IHRvdGFsIC0gYWN0aXZlXG4gICAgICAgIH07XG4gICAgfSxcblxuICAgIC8vIHVzZSBvblJlbmRlciBvbmx5IGZvciB1cGRhdGUgYWZ0ZXJcbiAgICAvLyBmaXJzdCByZW5kZXIgLyBzaG93XG4gICAgb25SZW5kZXI6IGZ1bmN0aW9uKCkge1xuICAgICAgICB0aGlzLnVwZGF0ZSgpO1xuICAgIH0sXG5cbiAgICAvLyB1c2Ugb25TaG93IHJhdGhlciB0aGFuIG9uUmVuZGVyIGJlY2F1c2UgRE9NIGlzIG5vdCByZWFkeVxuICAgIC8vIGFuZCB0aGlzLiRlbCBmaW5kIG9yIHBhcmVudCB3aWxsIHJldHVybiBub3RoaW5nXG4gICAgb25TaG93OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgfSxcblxuICAgIG9uQ2xlYXJDbGljazogZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgY29tcGxldGVkID0gdGhpcy5jb2xsZWN0aW9uLmdldENvbXBsZXRlZCgpO1xuICAgICAgICBjb21wbGV0ZWQuZm9yRWFjaChmdW5jdGlvbiAodG9kbykge1xuICAgICAgICAgICAgdG9kby5kZXN0cm95KCk7XG4gICAgICAgIH0pO1xuICAgIH0sXG5cbiAgICB1cGRhdGU6IGZ1bmN0aW9uKCkge1xuICAgICAgICB0aGlzLiRlbC5wYXJlbnQoKS50b2dnbGUodGhpcy5jb2xsZWN0aW9uLmxlbmd0aCA+IDApO1xuICAgIH1cblxufSk7IiwiLy8gaGJzZnkgY29tcGlsZWQgSGFuZGxlYmFycyB0ZW1wbGF0ZVxudmFyIEhhbmRsZWJhcnMgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnMudGVtcGxhdGUoZnVuY3Rpb24gKEhhbmRsZWJhcnMsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICB0aGlzLmNvbXBpbGVySW5mbyA9IFs0LCc+PSAxLjAuMCddO1xuaGVscGVycyA9IHRoaXMubWVyZ2UoaGVscGVycywgSGFuZGxlYmFycy5oZWxwZXJzKTsgZGF0YSA9IGRhdGEgfHwge307XG4gIFxuXG5cbiAgcmV0dXJuIFwiPGgxPnRvZG9zPC9oMT5cXG48Zm9ybT5cXG4gICAgPGlucHV0IGlkPVxcXCJuZXctdG9kb1xcXCIgcGxhY2Vob2xkZXI9XFxcIldoYXQgbmVlZHMgdG8gYmUgZG9uZT9cXFwiIGF1dG9mb2N1cz5cXG48L2Zvcm0+XCI7XG4gIH0pO1xuIiwidmFyIE1hcmlvbmV0dGUgPSByZXF1aXJlKCdiYWNrYm9uZS5tYXJpb25ldHRlJyk7XG5cbnZhciB0cGwgPSByZXF1aXJlKCcuL2hlYWRlci5oYnMnKTtcblxuXG5cbm1vZHVsZS5leHBvcnRzID0gTWFyaW9uZXR0ZS5JdGVtVmlldy5leHRlbmQoe1xuXG4gICAgdGVtcGxhdGU6IHRwbCxcblxuICAgIHVpOiB7XG4gICAgICAgIGlucHV0OiAnI25ldy10b2RvJ1xuICAgIH0sXG5cbiAgICBldmVudHM6IHtcbiAgICAgICAgJ3N1Ym1pdCBmb3JtJzogJ29uU3VibWl0J1xuICAgIH0sXG5cblxuXG4gICAgb25TdWJtaXQ6IGZ1bmN0aW9uIChlKSB7XG4gICAgICAgIC8vIHByZXZlbnQgZm9ybSBvcmlnbmFsIHN1Ym1pdFxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgdmFyIHRvZG9UZXh0ID0gdGhpcy51aS5pbnB1dC52YWwoKS50cmltKCk7XG4gICAgICAgIGlmICh0b2RvVGV4dCkge1xuICAgICAgICAgICAgdGhpcy5jb2xsZWN0aW9uLmNyZWF0ZSh7XG4gICAgICAgICAgICAgICAgdGl0bGU6IHRvZG9UZXh0XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMudWkuaW5wdXQudmFsKCcnKTtcbiAgICAgICAgfVxuICAgIH1cblxufSk7IiwiLy8gaGJzZnkgY29tcGlsZWQgSGFuZGxlYmFycyB0ZW1wbGF0ZVxudmFyIEhhbmRsZWJhcnMgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnMudGVtcGxhdGUoZnVuY3Rpb24gKEhhbmRsZWJhcnMsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICB0aGlzLmNvbXBpbGVySW5mbyA9IFs0LCc+PSAxLjAuMCddO1xuaGVscGVycyA9IHRoaXMubWVyZ2UoaGVscGVycywgSGFuZGxlYmFycy5oZWxwZXJzKTsgZGF0YSA9IGRhdGEgfHwge307XG4gIFxuXG5cbiAgcmV0dXJuIFwiPGRpdiBjbGFzcz1cXFwiY29udGVudC1yZXN0b1xcXCIgaWQ9XFxcImhvbGRlclxcXCI+XFxuICAgIDxzZWN0aW9uIGlkPVxcXCJ0b2RvYXBwXFxcIj5cXG4gICAgICAgIDxoZWFkZXIgaWQ9XFxcImhlYWRlclxcXCI+PC9oZWFkZXI+XFxuICAgICAgICA8c2VjdGlvbiBpZD1cXFwibWFpblxcXCI+PC9zZWN0aW9uPlxcbiAgICAgICAgPGZvb3RlciBpZD1cXFwiZm9vdGVyXFxcIj48L2Zvb3Rlcj5cXG4gICAgPC9zZWN0aW9uPlxcbiAgICA8cCBpZD1cXFwiY29weVxcXCI+TWluaVByb2pldCAtIEZhc3RSZXN0bzwvcD5cXG48L2Rpdj5cXG5cXG48IS0tIDxmb290ZXIgaWQ9XFxcImluZm9cXFwiPlxcbiAgICA8cD5Eb3VibGUtY2xpY2sgdG8gZWRpdCBhIHRvZG88L3A+XFxuICAgIDxwPldyaXR0ZW4gYnkgPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL0pTdGV1bm91XFxcIj5Kw6lyw7RtZSBTdGV1bm91PC9hPlxcbiAgICAgICAgYmFzZWQgb24gPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2FkZHlvc21hbmlcXFwiPkFkZHkgT3NtYW5pIFRvZG9NVkMgcHJvamVjdDwvYT48YnI+XFxuICAgICAgICBhbmQgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly90b2RvbXZjLmNvbS9sYWJzL2FyY2hpdGVjdHVyZS1leGFtcGxlcy9iYWNrYm9uZV9tYXJpb25ldHRlL1xcXCI+TWFyaW9uZXR0ZSBUb2RvTVZDPC9hPlxcbiAgICAgICAgY3JlYXRlZCBieSA8YSBocmVmPVxcXCJodHRwOi8vZ2l0aHViLmNvbS9qc292ZXJzb25cXFwiPkphcnJvZCBPdmVyc29uPC9hPlxcbiAgICAgICAgYW5kIDxhIGhyZWY9XFxcImh0dHA6Ly9naXRodWIuY29tL2Rlcmlja2JhaWxleVxcXCI+RGVyaWNrIEJhaWxleTwvYT5cXG4gICAgPC9wPlxcbjwvZm9vdGVyPiAtLT5cXG5cIjtcbiAgfSk7XG4iLCJ2YXIgTWFyaW9uZXR0ZSA9IHJlcXVpcmUoJ2JhY2tib25lLm1hcmlvbmV0dGUnKTtcblxuXG52YXIgSGVhZGVyVmlldyA9IHJlcXVpcmUoJy4vaGVhZGVyL2hlYWRlcicpO1xudmFyIFRvZG9zVmlldyA9IHJlcXVpcmUoJy4uL3RvZG9zL2NvbGxlY3Rpb24nKTtcbnZhciBGb290ZXJWaWV3ID0gcmVxdWlyZSgnLi9mb290ZXIvZm9vdGVyJyk7XG52YXIgdHBsID0gcmVxdWlyZSgnLi9sYXlvdXQuaGJzJyk7XG5cblxuXG5tb2R1bGUuZXhwb3J0cyA9IE1hcmlvbmV0dGUuTGF5b3V0LmV4dGVuZCh7XG4gICAgdGVtcGxhdGU6IHRwbCxcbiAgICBjbGFzc05hbWU6ICcnLFxuICAgIGlkOiAnbWFpbi1yZWdpb24nLFxuXG4gICAgdWk6IHtcbiAgICAgICAgYXBwOiAnI3RvZG9hcHAnXG4gICAgfSxcblxuICAgIHJlZ2lvbnM6IHtcbiAgICAgICAgaGVhZGVyOiAgICAgJyNoZWFkZXInLFxuICAgICAgICBtYWluOiAgICAgICAnI21haW4nLFxuICAgICAgICBmb290ZXI6ICAgICAnI2Zvb3RlcidcbiAgICB9LFxuXG5cblxuICAgIHVwZGF0ZUZpbHRlcjogZnVuY3Rpb24oZmlsdGVyKSB7XG4gICAgICAgIHRoaXMudWkuYXBwLmF0dHIoJ2NsYXNzJywgJ2ZpbHRlci0nICsgZmlsdGVyKTtcbiAgICB9LFxuXG5cblxuICAgIG9uU2hvdzogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBvcHRpb25zID0ge2NvbGxlY3Rpb246IHRoaXMub3B0aW9ucy50b2Rvc0NvbGxlY3Rpb259O1xuXG4gICAgICAgIC8vIHRoaXMuaGVhZGVyLnNob3cobmV3IEhlYWRlclZpZXcob3B0aW9ucykpO1xuICAgICAgICB0aGlzLm1haW4uc2hvdyhuZXcgVG9kb3NWaWV3KG9wdGlvbnMpKTtcbiAgICAgICAgLy8gdGhpcy5mb290ZXIuc2hvdyhuZXcgRm9vdGVyVmlldyhvcHRpb25zKSk7XG4gICAgfVxuXG59KTtcbiIsIi8vIGhic2Z5IGNvbXBpbGVkIEhhbmRsZWJhcnMgdGVtcGxhdGVcbnZhciBIYW5kbGViYXJzID0gcmVxdWlyZSgnaGJzZnkvcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICBcblxuXG4gIHJldHVybiBcIjxkaXYgaWQ9XFxcInRvZG8tbGlzdFxcXCI+PC9kaXY+XCI7XG4gIH0pO1xuIiwidmFyIE1hcmlvbmV0dGUgPSByZXF1aXJlKCdiYWNrYm9uZS5tYXJpb25ldHRlJyk7XG5cbnZhciBUb2RvSXRlbVZpZXcgPSByZXF1aXJlKCcuL2l0ZW0nKTtcbnZhciB0cGwgPSByZXF1aXJlKCcuL2NvbGxlY3Rpb24uaGJzJyk7XG52YXIgUmFwaGFlbCA9IHJlcXVpcmUoJ3JhcGhhZWwnKTtcblxuXG5cbi8vIEl0ZW0gTGlzdCBWaWV3XG4vLyAtLS0tLS0tLS0tLS0tLVxuLy9cbi8vIENvbnRyb2xzIHRoZSByZW5kZXJpbmcgb2YgdGhlIGxpc3Qgb2YgaXRlbXMsIGluY2x1ZGluZyB0aGVcbi8vIGZpbHRlcmluZyBvZiBhY3RpdnMgdnMgY29tcGxldGVkIGl0ZW1zIGZvciBkaXNwbGF5LlxubW9kdWxlLmV4cG9ydHMgPSBNYXJpb25ldHRlLkNvbXBvc2l0ZVZpZXcuZXh0ZW5kKHtcbiAgICB0ZW1wbGF0ZTogdHBsLFxuICAgIGl0ZW1WaWV3OiBUb2RvSXRlbVZpZXcsXG4gICAgaXRlbVZpZXdDb250YWluZXI6ICcjdG9kby1saXN0JyxcbiAgICBpdGVtVmlld09wdGlvbnM6IGZ1bmN0aW9uKCl7XG4gICAgICAgIHJldHVybiB7cGFwZXI6IHRoaXMucGFwZXJ9XG4gICAgfSxcblxuICAgIHVpOiB7XG4gICAgICAgIHRvZ2dsZTogJyN0b2dnbGUtYWxsJ1xuICAgIH0sXG5cbiAgICBldmVudHM6IHtcbiAgICAgICAgJ2NsaWNrIEB1aS50b2dnbGUnOiAnb25Ub2dnbGVBbGxDbGljaydcbiAgICB9LFxuXG4gICAgY29sbGVjdGlvbkV2ZW50czoge1xuICAgICAgICAnc3luYyc6ICd1cGRhdGUnXG4gICAgfSxcblxuICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uKG9wdGlvbnMpe1xuICAgICAgICB0aGlzLnBhcGVyID0gUmFwaGFlbChcImhvbGRlclwiLCAxNjAwLCA2ODApO1xuICAgICAgICAvLyB0aGlzLnBhcGVyLmNsZWFyKClcbiAgICB9LFxuICAgIC8vIHVzZSBvblNob3cgcmF0aGVyIHRoYW4gb25SZW5kZXIgYmVjYXVzZSBET00gaXMgbm90IHJlYWR5XG4gICAgLy8gYW5kIHRoaXMuJGVsIGZpbmQgb3IgcGFyZW50IHdpbGwgcmV0dXJuIG5vdGhpbmdcbiAgICBvblNob3c6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gdGhpcy51cGRhdGUoKTtcbiAgICB9LFxuXG4gICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIGZ1bmN0aW9uIHJlZHVjZUNvbXBsZXRlZChsZWZ0LCByaWdodCkge1xuICAgICAgICAvLyAgICAgcmV0dXJuIGxlZnQgJiYgcmlnaHQuZ2V0KCdjb21wbGV0ZWQnKTtcbiAgICAgICAgLy8gfVxuXG4gICAgICAgIC8vIHZhciBhbGxDb21wbGV0ZWQgPSB0aGlzLmNvbGxlY3Rpb24ucmVkdWNlKHJlZHVjZUNvbXBsZXRlZCwgdHJ1ZSk7XG5cbiAgICAgICAgLy8gdGhpcy51aS50b2dnbGUucHJvcCgnY2hlY2tlZCcsIGFsbENvbXBsZXRlZCk7XG4gICAgICAgIC8vIHRoaXMuJGVsLnBhcmVudCgpLnRvZ2dsZSghIXRoaXMuY29sbGVjdGlvbi5sZW5ndGgpO1xuICAgICAgICAvLyB0aGlzLnBhcGVyLmNsZWFyKClcbiAgICB9LFxuXG4gICAgb25Ub2dnbGVBbGxDbGljazogZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgdmFyIGlzQ2hlY2tlZCA9IGUuY3VycmVudFRhcmdldC5jaGVja2VkO1xuXG4gICAgICAgIHRoaXMuY29sbGVjdGlvbi5lYWNoKGZ1bmN0aW9uICh0b2RvKSB7XG4gICAgICAgICAgICB0b2RvLnNhdmUoeyAnY29tcGxldGVkJzogaXNDaGVja2VkIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbn0pO1xuIiwiLy8gaGJzZnkgY29tcGlsZWQgSGFuZGxlYmFycyB0ZW1wbGF0ZVxudmFyIEhhbmRsZWJhcnMgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnMudGVtcGxhdGUoZnVuY3Rpb24gKEhhbmRsZWJhcnMsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICB0aGlzLmNvbXBpbGVySW5mbyA9IFs0LCc+PSAxLjAuMCddO1xuaGVscGVycyA9IHRoaXMubWVyZ2UoaGVscGVycywgSGFuZGxlYmFycy5oZWxwZXJzKTsgZGF0YSA9IGRhdGEgfHwge307XG4gIHZhciBidWZmZXIgPSBcIlwiLCBzdGFjazEsIGhlbHBlciwgZnVuY3Rpb25UeXBlPVwiZnVuY3Rpb25cIiwgZXNjYXBlRXhwcmVzc2lvbj10aGlzLmVzY2FwZUV4cHJlc3Npb24sIHNlbGY9dGhpcztcblxuZnVuY3Rpb24gcHJvZ3JhbTEoZGVwdGgwLGRhdGEpIHtcbiAgXG4gIFxuICByZXR1cm4gXCJjaGVja2VkXCI7XG4gIH1cblxuICBidWZmZXIgKz0gXCI8IS0tIDxkaXYgaWQ9XFxcImVsZW1lbnQtXCI7XG4gIGlmIChoZWxwZXIgPSBoZWxwZXJzLmlkKSB7IHN0YWNrMSA9IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSk7IH1cbiAgZWxzZSB7IGhlbHBlciA9IChkZXB0aDAgJiYgZGVwdGgwLmlkKTsgc3RhY2sxID0gdHlwZW9mIGhlbHBlciA9PT0gZnVuY3Rpb25UeXBlID8gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KSA6IGhlbHBlcjsgfVxuICBidWZmZXIgKz0gZXNjYXBlRXhwcmVzc2lvbihzdGFjazEpXG4gICAgKyBcIlxcXCJjbGFzcz1cXFwidmlld1xcXCI+XFxuICAgIDxpbnB1dCBjbGFzcz1cXFwidG9nZ2xlXFxcIiB0eXBlPVxcXCJjaGVja2JveFxcXCIgXCI7XG4gIHN0YWNrMSA9IGhlbHBlcnNbJ2lmJ10uY2FsbChkZXB0aDAsIChkZXB0aDAgJiYgZGVwdGgwLmNvbXBsZXRlZCksIHtoYXNoOnt9LGludmVyc2U6c2VsZi5ub29wLGZuOnNlbGYucHJvZ3JhbSgxLCBwcm9ncmFtMSwgZGF0YSksZGF0YTpkYXRhfSk7XG4gIGlmKHN0YWNrMSB8fCBzdGFjazEgPT09IDApIHsgYnVmZmVyICs9IHN0YWNrMTsgfVxuICBidWZmZXIgKz0gXCI+XFxuICAgIDxsYWJlbD5cIjtcbiAgaWYgKGhlbHBlciA9IGhlbHBlcnMudGl0bGUpIHsgc3RhY2sxID0gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KTsgfVxuICBlbHNlIHsgaGVscGVyID0gKGRlcHRoMCAmJiBkZXB0aDAudGl0bGUpOyBzdGFjazEgPSB0eXBlb2YgaGVscGVyID09PSBmdW5jdGlvblR5cGUgPyBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pIDogaGVscGVyOyB9XG4gIGJ1ZmZlciArPSBlc2NhcGVFeHByZXNzaW9uKHN0YWNrMSlcbiAgICArIFwiPC9sYWJlbD5cXG4gICAgPGJ1dHRvbiBjbGFzcz1cXFwiZGVzdHJveVxcXCI+PC9idXR0b24+XFxuPC9kaXY+XFxuPGlucHV0IGNsYXNzPVxcXCJlZGl0XFxcIiB2YWx1ZT1cXFwiXCI7XG4gIGlmIChoZWxwZXIgPSBoZWxwZXJzLnRpdGxlKSB7IHN0YWNrMSA9IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSk7IH1cbiAgZWxzZSB7IGhlbHBlciA9IChkZXB0aDAgJiYgZGVwdGgwLnRpdGxlKTsgc3RhY2sxID0gdHlwZW9mIGhlbHBlciA9PT0gZnVuY3Rpb25UeXBlID8gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KSA6IGhlbHBlcjsgfVxuICBidWZmZXIgKz0gZXNjYXBlRXhwcmVzc2lvbihzdGFjazEpXG4gICAgKyBcIlxcXCI+IC0tPlxcbjwhLS0gPGlucHV0IGNsYXNzPVxcXCJlZGl0XFxcIiB2YWx1ZT1cXFwiXCI7XG4gIGlmIChoZWxwZXIgPSBoZWxwZXJzLmZyZWVfcGxhY2VzKSB7IHN0YWNrMSA9IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSk7IH1cbiAgZWxzZSB7IGhlbHBlciA9IChkZXB0aDAgJiYgZGVwdGgwLmZyZWVfcGxhY2VzKTsgc3RhY2sxID0gdHlwZW9mIGhlbHBlciA9PT0gZnVuY3Rpb25UeXBlID8gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KSA6IGhlbHBlcjsgfVxuICBidWZmZXIgKz0gZXNjYXBlRXhwcmVzc2lvbihzdGFjazEpXG4gICAgKyBcIlxcXCI+IC0tPlwiO1xuICByZXR1cm4gYnVmZmVyO1xuICB9KTtcbiIsInZhciBNYXJpb25ldHRlID0gcmVxdWlyZSgnYmFja2JvbmUubWFyaW9uZXR0ZScpO1xuXG4vLyB2YXIgUmFwaGFlbCA9IHJlcXVpcmUoJ3JhcGhhZWwnKTtcblxuXG52YXIgdHBsID0gcmVxdWlyZSgnLi9pdGVtLmhicycpO1xudmFyIGNvdW50ID0gMTtcbi8vIFRvZG8gTGlzdCBJdGVtIFZpZXdcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vXG4vLyBEaXNwbGF5IGFuIGluZGl2aWR1YWwgdG9kbyBpdGVtLCBhbmQgcmVzcG9uZCB0byBjaGFuZ2VzXG4vLyB0aGF0IGFyZSBtYWRlIHRvIHRoZSBpdGVtLCBpbmNsdWRpbmcgbWFya2luZyBjb21wbGV0ZWQuXG5tb2R1bGUuZXhwb3J0cyA9IE1hcmlvbmV0dGUuSXRlbVZpZXcuZXh0ZW5kKHtcbiAgICAvLyB0YWdOYW1lOiAnbGknLFxuICAgIHRlbXBsYXRlOiB0cGwsXG5cbiAgICB1aToge1xuICAgICAgICBlZGl0OiAnLmVkaXQnXG4gICAgfSxcblxuICAgIC8vIGV2ZW50czoge1xuICAgIC8vICAgICAnY2xpY2sgLmRlc3Ryb3knOiAgICAgICAnZGVzdHJveScsXG4gICAgLy8gICAgICdjbGljayAudG9nZ2xlJzogICAgICAgICd0b2dnbGUnLFxuICAgIC8vICAgICAnZGJsY2xpY2sgbGFiZWwnOiAgICAgICAnb25FZGl0Q2xpY2snLFxuICAgIC8vICAgICAna2V5ZG93biAgQHVpLmVkaXQnOiAgICAnb25FZGl0S2V5cHJlc3MnLFxuICAgIC8vICAgICAnZm9jdXNvdXQgQHVpLmVkaXQnOiAgICAnb25FZGl0Rm9jdXNvdXQnXG4gICAgLy8gfSxcblxuICAgIG1vZGVsRXZlbnRzOiB7XG4gICAgICAgICdjaGFuZ2UnOiAncmVuZGVyJ1xuICAgIH0sXG4gICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24ob3B0aW9ucyl7XG4gICAgICAgIHRoaXMucGFwZXIgPSBvcHRpb25zLnBhcGVyXG4gICAgfSxcbiAgICBlcmFzZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBjb25zb2xlLmxvZygnZGVzdHJ1aWRvJyk7XG4gICAgfSxcbiAgICBvbkJlZm9yZURlc3Ryb3k6IGZ1bmN0aW9uKCkge1xuICAgIC8vIGN1c3RvbSBkZXN0cm95aW5nIGFuZCBub24tRE9NIHJlbGF0ZWQgY2xlYW51cCBnb2VzIGhlcmVcbiAgfSxcbiAgICBvblJlbmRlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyB0aGlzLiRlbC5yZW1vdmVDbGFzcygnYWN0aXZlIGNvbXBsZXRlZCcpO1xuXG4gICAgICAgIC8vIGlmICh0aGlzLm1vZGVsLmdldCgnY29tcGxldGVkJykpIHtcbiAgICAgICAgLy8gICAgIHRoaXMuJGVsLmFkZENsYXNzKCdjb21wbGV0ZWQnKTtcbiAgICAgICAgLy8gfSBlbHNlIHtcbiAgICAgICAgLy8gICAgIHRoaXMuJGVsLmFkZENsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgLy8gfVxuICAgICAgICBtb2RlbCA9IHRoaXMubW9kZWxcbiAgICAgICAgLy8gdmFyIHBhcGVyID0gUmFwaGFlbChcInRvZG8tbGlzdFwiLCA0ODAsIDk0MCk7XG4gICAgICAgIHBhcGVyID0gdGhpcy5wYXBlclxuXG4gICAgICAgIGlmKHRoaXMuY2lyY2xlICYmIHRoaXMubGJsKXtcbiAgICAgICAgICAgIHRoaXMuY2lyY2xlLnJlbW92ZSgpXG4gICAgICAgICAgICB0aGlzLmxibC5yZW1vdmUoKVxuICAgICAgICB9XG4gICAgICAgIHggPSBtb2RlbC5nZXQoXCJwb3NpdGlvbl94XCIpXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKGNvdW50KVxuICAgICAgICAvLyB4ID0gKGNvdW50KjU1MClcbiAgICAgICAgLy8gaWYgKGNvdW50IDw9IDEpIGNvdW50KytcbiAgICAgICAgeSA9IHBhcnNlSW50KG1vZGVsLmdldChcInBvc2l0aW9uX3lcIikpXG5cbiAgICAgICAgY29sb3IgPSBtb2RlbC5nZXRDb2xvcigpXG4gICAgICAgIHRoaXMuY2lyY2xlID0gcGFwZXIuY2lyY2xlKHgsIHksIG1vZGVsLmdldChcInJhZGlvXCIpKVxuICAgICAgICAuYXR0cih7c3Ryb2tlOiBjb2xvciwgZmlsbDogY29sb3IsIFwiZmlsbC1vcGFjaXR5XCI6IC43NX0pXG4gICAgICAgIHRoaXMubGJsID0gcGFwZXIudGV4dCh4LCB5LCBtb2RlbC5nZXQoXCJmcmVlX3BsYWNlc1wiKSlcbiAgICAgICAgLmF0dHIoe1wiZm9udFwiOiAnNWVtIFwiSGVsdmV0aWNhIE5ldWVcIiwgQXJpYWwnLCBzdHJva2U6IFwibm9uZVwiLCBmaWxsOiBcIiNmZmZcIn0pXG4gICAgfSxcbiAgICBkZXN0cm95OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMubW9kZWwuZGVzdHJveSgpO1xuICAgIH0sXG5cbiAgICB0b2dnbGU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5tb2RlbC50b2dnbGUoKS5zYXZlKCk7XG4gICAgfSxcblxuICAgIG9uRWRpdENsaWNrOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuJGVsLmFkZENsYXNzKCdlZGl0aW5nJyk7XG4gICAgICAgIHRoaXMudWkuZWRpdC5mb2N1cygpO1xuICAgICAgICB0aGlzLnVpLmVkaXQudmFsKHRoaXMudWkuZWRpdC52YWwoKSk7XG4gICAgfSxcblxuICAgIG9uRWRpdEZvY3Vzb3V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciB0b2RvVGV4dCA9IHRoaXMudWkuZWRpdC52YWwoKS50cmltKCk7XG4gICAgICAgIGlmICh0b2RvVGV4dCkge1xuICAgICAgICAgICAgdGhpcy5tb2RlbC5zZXQoJ3RpdGxlJywgdG9kb1RleHQpLnNhdmUoKTtcbiAgICAgICAgICAgIHRoaXMuJGVsLnJlbW92ZUNsYXNzKCdlZGl0aW5nJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmRlc3Ryb3koKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBvbkVkaXRLZXlwcmVzczogZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgdmFyIEVOVEVSX0tFWSA9IDEzLCBFU0NfS0VZID0gMjc7XG5cbiAgICAgICAgaWYgKGUud2hpY2ggPT09IEVOVEVSX0tFWSkge1xuICAgICAgICAgICAgdGhpcy5vbkVkaXRGb2N1c291dCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGUud2hpY2ggPT09IEVTQ19LRVkpIHtcbiAgICAgICAgICAgIHRoaXMudWkuZWRpdC52YWwodGhpcy5tb2RlbC5nZXQoJ3RpdGxlJykpO1xuICAgICAgICAgICAgdGhpcy4kZWwucmVtb3ZlQ2xhc3MoJ2VkaXRpbmcnKTtcbiAgICAgICAgfVxuICAgIH1cbn0pO1xuXG4iLCJ2YXIgTWFyaW9uZXR0ZSA9IHJlcXVpcmUoJ2JhY2tib25lLm1hcmlvbmV0dGUnKTtcbnZhciBCYWNrYm9uZSA9IHJlcXVpcmUoJ2JhY2tib25lJyk7XG52YXIgXyA9IHJlcXVpcmUoJ3VuZGVyc2NvcmUnKTtcblxuXG5CYWNrYm9uZS5SYXBoYWVsVmlldyA9IE1hcmlvbmV0dGUuSXRlbVZpZXcuZXh0ZW5kKHtcblxuICAgIHNldEVsZW1lbnQ6IGZ1bmN0aW9uKGVsZW1lbnQsIGRlbGVnYXRlLCB1bmRlbGVnYXRlRXZlbnRzKSB7XG4gICAgICAgIGlmICh0aGlzLmVsICYmIHVuZGVsZWdhdGVFdmVudHMpIHRoaXMudW5kZWxlZ2F0ZUV2ZW50cygpO1xuICAgICAgICAvLyBlbCBhbmQgJGVsIHdpbGwgYmUgdGhlIHNhbWUsICRlbCB3b3VsZCBoYXZlIG5vIHNwZWNpYWwgbWVhbmluZy4uLlxuICAgICAgICB0aGlzLmVsID0gdGhpcy4kZWwgPSBlbGVtZW50O1xuICAgICAgICBpZiAoZGVsZWdhdGUgIT09IGZhbHNlKSB0aGlzLmRlbGVnYXRlRXZlbnRzKCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICBkZWxlZ2F0ZUV2ZW50czogZnVuY3Rpb24oZXZlbnRzLCB1bmRlbGVnYXRlRXZlbnRzKSB7XG4gICAgICAgIGlmICghKGV2ZW50cyB8fCAoZXZlbnRzID0gXy5yZXN1bHQodGhpcywgJ2V2ZW50cycpKSkpIHJldHVybiB0aGlzO1xuICAgICAgICBpZih1bmRlbGVnYXRlRXZlbnRzKSB0aGlzLnVuZGVsZWdhdGVFdmVudHMoKTtcbiAgICAgICAgZm9yICh2YXIgZXZlbnROYW1lIGluIGV2ZW50cykge1xuICAgICAgICAgICAgdmFyIG1ldGhvZCA9IGV2ZW50c1tldmVudE5hbWVdO1xuICAgICAgICAgICAgaWYgKCFfLmlzRnVuY3Rpb24obWV0aG9kKSkgbWV0aG9kID0gdGhpc1tldmVudHNbZXZlbnROYW1lXV07XG4gICAgICAgICAgICBpZiAoIW1ldGhvZCkgY29udGludWU7XG5cbiAgICAgICAgICAgIG1ldGhvZCA9IF8uYmluZChtZXRob2QsIHRoaXMpO1xuICAgICAgICAgICAgLy9JZiBpdCBpcyBvbmUgb2YgdGhlIHN2Zy92bWwgZXZlbnRzXG4gICAgICAgICAgICBpZih0aGlzLmVsW2V2ZW50TmFtZV0pe1xuICAgICAgICAgICAgICAgIHRoaXMuZWxbZXZlbnROYW1lXShtZXRob2QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gQ3VzdG9tIGV2ZW50cyBmb3IgUmFwaGFlbFZpZXcgb2JqZWN0XG4gICAgICAgICAgICBlbHNle1xuICAgICAgICAgICAgICAgIHRoaXMub24oZXZlbnROYW1lLCBtZXRob2QpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8vIENsZWFycyBhbGwgY2FsbGJhY2tzIHByZXZpb3VzbHkgYm91bmQgdG8gdGhlIHZpZXcgd2l0aCBgZGVsZWdhdGVFdmVudHNgLlxuICAgIHVuZGVsZWdhdGVFdmVudHM6IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZih0aGlzLmVsLnR5cGUpIHRoaXMuZWwudW5iaW5kQWxsKCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxufSk7XG5cbiJdfQ==
