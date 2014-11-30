
(function() { // Need comment ending with semicolon to trick post-processor ;
/**
 * almond 0.2.6 Copyright (c) 2011-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */


var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (typeof callback === 'function') {

            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback.apply(defined[name], args);

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        config = cfg;
        if (config.deps) {
            req(config.deps, config.callback);
        }
        return req;
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());
/*
 * pmrpc 0.7.1 - Inter-widget remote procedure call library based on HTML5
 *               postMessage API and JSON-RPC. https://github.com/izuzak/pmrpc
 *
 * Copyright 2012 Ivan Zuzak, Marko Ivankovic
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


pmrpc = self.pmrpc =  function() {
  // check if JSON library is available
  if (typeof JSON === "undefined" || typeof JSON.stringify === "undefined" ||
      typeof JSON.parse === "undefined") {
    throw "pmrpc requires the JSON library";
  }

  // TODO: make "contextType" private variable
  // check if postMessage APIs are available
  if (typeof this.postMessage === "undefined" &&  // window or worker
        typeof this.onconnect === "undefined") {  // shared worker
      throw "pmrpc requires the HTML5 cross-document messaging and worker APIs";
  }

  // Generates a version 4 UUID
  function generateUUID() {
    var uuid = [], nineteen = "89AB", hex = "0123456789ABCDEF";
    for (var i=0; i<36; i++) {
      uuid[i] = hex[Math.floor(Math.random() * 16)];
    }
    uuid[14] = '4';
    uuid[19] = nineteen[Math.floor(Math.random() * 4)];
    uuid[8] = uuid[13] = uuid[18] = uuid[23] = '-';
    return uuid.join('');
  }

  // Checks whether a domain satisfies the access control list. The access
  // control list has a whitelist and a blacklist. In order to satisfy the acl,
  // the domain must be on the whitelist, and must not be on the blacklist.
  function checkACL(accessControlList, origin) {
    var aclWhitelist = accessControlList.whitelist;
    var aclBlacklist = accessControlList.blacklist;

    var isWhitelisted = false;
    var isBlacklisted = false;

    for (var i=0; i<aclWhitelist.length; ++i) {
      if(origin.match(new RegExp(aclWhitelist[i]))) {
        isWhitelisted = true;
        break;
      }
    }

    for (var j=0; j<aclBlacklist.length; ++j) {
      if(origin.match(new RegExp(aclBlacklist[j]))) {
        isBlacklisted = true;
        break;
      }
    }

    return isWhitelisted && !isBlacklisted;
  }

  // Calls a function with either positional or named parameters
  // In either case, additionalParams will be appended to the end
  function invokeProcedure(fn, self, params, additionalParams) {
    if (!(params instanceof Array)) {
      // get string representation of function
      var fnDef = fn.toString();

      // parse the string representation and retrieve order of parameters
      var argNames = fnDef.substring(fnDef.indexOf("(")+1, fnDef.indexOf(")"));
      argNames = (argNames === "") ? [] : argNames.split(", ");

      var argIndexes = {};
      for (var i=0; i<argNames.length; i++) {
        argIndexes[argNames[i]] = i;
      }

      // construct an array of arguments from a dictionary
      var callParameters = [];
      for (var paramName in params) {
        if (typeof argIndexes[paramName] !== "undefined") {
          callParameters[argIndexes[paramName]] = params[paramName];
        } else {
          throw "No such param: " + paramName;
        }
      }

      params = callParameters;
    }

    // append additional parameters
    if (typeof additionalParams !== "undefined") {
      params = params.concat(additionalParams);
    }

    // invoke function with specified context and arguments array
    return fn.apply(self, params);
  }

  // JSON encode an object into pmrpc message
  function encode(obj) {
    return "pmrpc." + JSON.stringify(obj);
  }

  // JSON decode a pmrpc message
  function decode(str) {
    return JSON.parse(str.substring("pmrpc.".length));
  }

  // Creates a base JSON-RPC object, usable for both request and response.
  // As of JSON-RPC 2.0 it only contains one field "jsonrpc" with value "2.0"
  function createJSONRpcBaseObject() {
    var call = {};
    call.jsonrpc = "2.0";
    return call;
  }

  // Creates a JSON-RPC request object for the given method and parameters
  function createJSONRpcRequestObject(procedureName, parameters, id) {
    var call = createJSONRpcBaseObject();
    call.method = procedureName;
    call.params = parameters;
    if (typeof id !== "undefined") {
      call.id = id;
    }
    return call;
  }

  // Creates a JSON-RPC error object complete with message and error code
  function createJSONRpcErrorObject(errorcode, message, data) {
    var error = {};
    error.code = errorcode;
    error.message = message;
    error.data = data;
    return error;
  }

  // Creates a JSON-RPC response object.
  function createJSONRpcResponseObject(error, result, id) {
    var response = createJSONRpcBaseObject();
    response.id = id;

    if (typeof error === "undefined" || error === null) {
      response.result = (result === "undefined") ? null : result;
    } else {
      response.error = error;
    }

    return response;
  }

  // dictionary of services registered for remote calls
  var registeredServices = {};
  // dictionary of requests being processed on the client side
  var callQueue = {};

  var reservedProcedureNames = {};
  // register a service available for remote calls
  // if no acl is given, assume that it is available to everyone
  function register(config) {
    if (config.publicProcedureName in reservedProcedureNames) {
      return false;
    } else {
      registeredServices[config.publicProcedureName] = {
        "publicProcedureName" : config.publicProcedureName,
        "procedure" : config.procedure,
        "context" : config.procedure.context,
        "isAsync" : typeof config.isAsynchronous !== "undefined" ?
                      config.isAsynchronous : false,
        "acl" : typeof config.acl !== "undefined" ?
                  config.acl : {whitelist: ["(.*)"], blacklist: []}};
      return true;
    }
  }

  // unregister a previously registered procedure
  function unregister(publicProcedureName) {
    if (publicProcedureName in reservedProcedureNames) {
      return false;
    } else {
      delete registeredServices[publicProcedureName];
      return true;
    }
  }

  // retreive service for a specific procedure name
  function fetchRegisteredService(publicProcedureName){
    return registeredServices[publicProcedureName];
  }

  // receive and execute a pmrpc call which may be a request or a response
  function processPmrpcMessage(eventParams) {
    var serviceCallEvent = eventParams.event;
    var eventSource = eventParams.source;
    var isWorkerComm = typeof eventSource !== "undefined" && eventSource !== null;

    // if the message is not for pmrpc, ignore it.
    if (serviceCallEvent.data.indexOf("pmrpc.") !== 0) {
      return;
    } else {
      var message = decode(serviceCallEvent.data);

      if (typeof message.method !== "undefined") {
        // this is a request

        var newServiceCallEvent = {
          data : serviceCallEvent.data,
          source : isWorkerComm ? eventSource : serviceCallEvent.source,
          origin : isWorkerComm ? "*" : serviceCallEvent.origin,
          shouldCheckACL : !isWorkerComm
        };

        var response = processJSONRpcRequest(message, newServiceCallEvent);

        // return the response
        if (response !== null) {
          sendPmrpcMessage(
            newServiceCallEvent.source, response, newServiceCallEvent.origin);
        }
      } else {
        // this is a response
        processJSONRpcResponse(message);
      }
    }
  }

  // Process a single JSON-RPC Request
  function processJSONRpcRequest(request, serviceCallEvent, shouldCheckACL) {
    if (request.jsonrpc !== "2.0") {
      // Invalid JSON-RPC request
      return createJSONRpcResponseObject(
        createJSONRpcErrorObject(-32600, "Invalid request.",
          "The recived JSON is not a valid JSON-RPC 2.0 request."),
        null,
        null);
    }

    var id = request.id;
    var service = fetchRegisteredService(request.method);

    if (typeof service !== "undefined") {
      // check the acl rights
      if (!serviceCallEvent.shouldCheckACL ||
            checkACL(service.acl, serviceCallEvent.origin)) {
        try {
          if (service.isAsync) {
            // if the service is async, create a callback which the service
            // must call in order to send a response back
            var cb = function (returnValue) {
                       sendPmrpcMessage(
                         serviceCallEvent.source,
                         createJSONRpcResponseObject(null, returnValue, id),
                         serviceCallEvent.origin);
                     };
             // create a errorback which the service
             // must call in order to send an error back
             var eb = function (errorValue) {
                 sendPmrpcMessage(
                   serviceCallEvent.source,
                   createJSONRpcResponseObject(
                		   createJSONRpcErrorObject(
                		     -1, "Application error.",errorValue.message),
                		   null, id),
                   serviceCallEvent.origin);
               };
            invokeProcedure(
              service.procedure, service.context, request.params, [cb, eb, serviceCallEvent]);
            return null;
          } else {
            // if the service is not async, just call it and return the value
            var returnValue = invokeProcedure(
                                service.procedure,
                                service.context,
                                request.params, [serviceCallEvent]);
            return (typeof id === "undefined") ? null :
              createJSONRpcResponseObject(null, returnValue, id);
          }
        } catch (error) {
          if (typeof id === "undefined") {
            // it was a notification nobody cares if it fails
            return null;
          }

          if (error.message.match("^(No such param)")) {
            return createJSONRpcResponseObject(
              createJSONRpcErrorObject(
                -32602, "Invalid params.", error.message),
              null,
              id);
          }

          // the -1 value is "application defined"
          return createJSONRpcResponseObject(
            createJSONRpcErrorObject(
              -1, "Application error.", error.message),
            null,
            id);
        }
      } else {
        // access denied
        return (typeof id === "undefined") ? null : createJSONRpcResponseObject(
          createJSONRpcErrorObject(
            -2, "Application error.", "Access denied on server."),
          null,
          id);
      }
    } else {
      // No such method
      return (typeof id === "undefined") ? null : createJSONRpcResponseObject(
        createJSONRpcErrorObject(
          -32601,
          "Method not found.",
          "The requestd remote procedure does not exist or is not available."),
        null,
        id);
    }
  }

  // internal rpc service that receives responses for rpc calls
  function processJSONRpcResponse(response) {
    var id = response.id;
    var callObj = callQueue[id];
    if (typeof callObj === "undefined" || callObj === null) {
      return;
    } else {
      delete callQueue[id];
    }

    // check if the call was sucessful or not
    if (typeof response.error === "undefined") {
      callObj.onSuccess( {
        "destination" : callObj.destination,
        "publicProcedureName" : callObj.publicProcedureName,
        "params" : callObj.params,
        "status" : "success",
        "returnValue" : response.result} );
    } else {
      callObj.onError( {
        "destination" : callObj.destination,
        "publicProcedureName" : callObj.publicProcedureName,
        "params" : callObj.params,
        "status" : "error",
        "message" : response.error.message + " " + response.error.data} );
    }
  }

  // call remote procedure
  function call(config) {
    // check that number of retries is not -1, that is a special internal value
    if (config.retries && config.retries < 0) {
      throw new Exception("number of retries must be 0 or higher");
    }

    var destContexts = [];

    if (typeof config.destination === "undefined" || config.destination === null || config.destination === "workerParent") {
      destContexts = [{context : null, type : "workerParent"}];
    } else if (config.destination === "publish") {
      destContexts = findAllReachableContexts();
    } else if (config.destination instanceof Array) {
      for (var i=0; i<config.destination.length; i++) {
        if (config.destination[i] === "workerParent") {
          destContexts.push({context : null, type : "workerParent"});
        } else if (typeof config.destination[i].frames !== "undefined") {
          destContexts.push({context : config.destination[i], type : "window"});
        } else {
          destContexts.push({context : config.destination[i], type : "worker"});
        }
      }
    } else {
      if (typeof config.destination.frames !== "undefined") {
        destContexts.push({context : config.destination, type : "window"});
      } else {
        destContexts.push({context : config.destination, type : "worker"});
      }
    }

    for (var i=0; i<destContexts.length; i++) {
      var callObj = {
        destination : destContexts[i].context,
        destinationDomain : typeof config.destinationDomain === "undefined" ? ["*"] : (typeof config.destinationDomain === "string" ? [config.destinationDomain] : config.destinationDomain),
        publicProcedureName : config.publicProcedureName,
        onSuccess : typeof config.onSuccess !== "undefined" ?
                      config.onSuccess : function (){},
        onError : typeof config.onError !== "undefined" ?
                      config.onError : function (){},
        retries : typeof config.retries !== "undefined" ? config.retries : 5,
        timeout : typeof config.timeout !== "undefined" ? config.timeout : 500,
        status : "requestNotSent"
      };

      isNotification = typeof config.onError === "undefined" && typeof config.onSuccess === "undefined";
      params = (typeof config.params !== "undefined") ? config.params : [];
      callId = generateUUID();
      callQueue[callId] = callObj;

      if (isNotification) {
        callObj.message = createJSONRpcRequestObject(
                    config.publicProcedureName, params);
      } else {
        callObj.message = createJSONRpcRequestObject(
                            config.publicProcedureName, params, callId);
      }

      waitAndSendRequest(callId);
    }
  }

  // Use the postMessage API to send a pmrpc message to a destination
  function sendPmrpcMessage(destination, message, acl) {
    if (typeof destination === "undefined" || destination === null) {
      self.postMessage(encode(message));
    } else if (typeof destination.frames !== "undefined") {
      return destination.postMessage(encode(message), acl);
    } else {
      destination.postMessage(encode(message));
    }
  }

  // Execute a remote call by first pinging the destination and afterwards
  // sending the request
  function waitAndSendRequest(callId) {
    var callObj = callQueue[callId];
    if (typeof callObj === "undefined") {
      return;
    } else if (callObj.retries <= -1) {
      processJSONRpcResponse(
        createJSONRpcResponseObject(
          createJSONRpcErrorObject(
          -4, "Application error.", "Destination unavailable."),
          null,
          callId));
    } else if (callObj.status === "requestSent") {
      return;
    } else if (callObj.retries === 0 || callObj.status === "available") {
      callObj.status = "requestSent";
      callObj.retries = -1;
      callQueue[callId] = callObj;
      for (var i=0; i<callObj.destinationDomain.length; i++) {
        sendPmrpcMessage(
          callObj.destination, callObj.message, callObj.destinationDomain[i], callObj);
        self.setTimeout(function() { waitAndSendRequest(callId); }, callObj.timeout);
      }
    } else {
      // if we can ping some more - send a new ping request
      callObj.status = "pinging";
      var retries = callObj.retries;
      callObj.retries = retries - 1;

      call({
        "destination" : callObj.destination,
        "publicProcedureName" : "receivePingRequest",
        "onSuccess" : function (callResult) {
                        if (callResult.returnValue === true &&
                            typeof callQueue[callId] !== 'undefined') {
                          callQueue[callId].status = "available";
                          waitAndSendRequest(callId);
                        }
                      },
        "params" : [callObj.publicProcedureName],
        "retries" : 0,
        "destinationDomain" : callObj.destinationDomain});
      callQueue[callId] = callObj;
      self.setTimeout(function() {
        if (callQueue[callId] && callQueue[callId].status === "pinging") {
          waitAndSendRequest(callId);
        }
      }, callObj.timeout / retries);
    }
  }

  // attach the pmrpc event listener
  function addCrossBrowserEventListerner(obj, eventName, handler, bubble) {
    if ("addEventListener" in obj) {
      // FF
      obj.addEventListener(eventName, handler, bubble);
    } else {
      // IE
      obj.attachEvent("on" + eventName, handler);
    }
  }

  function createHandler(method, source, destinationType) {
    return function(event) {
      var params = {event : event, source : source, destinationType : destinationType};
      method(params);
    };
  }

  if ('window' in this) {
    // window object - window-to-window comm
    var handler = createHandler(processPmrpcMessage, null, "window");
    addCrossBrowserEventListerner(this, "message", handler, false);
  } else if ('onmessage' in this) {
    // dedicated worker - parent X to worker comm
    var handler = createHandler(processPmrpcMessage, this, "worker");
    addCrossBrowserEventListerner(this, "message", handler, false);
  } else if ('onconnect' in this) {
    // shared worker - parent X to shared-worker comm
    var connectHandler = function(e) {
      //this.sendPort = e.ports[0];
      var handler = createHandler(processPmrpcMessage, e.ports[0], "sharedWorker");
      addCrossBrowserEventListerner(e.ports[0], "message", handler, false);
      e.ports[0].start();
    };
    addCrossBrowserEventListerner(this, "connect", connectHandler, false);
  } else {
    throw "Pmrpc must be loaded within a browser window or web worker.";
  }

  // Override Worker and SharedWorker constructors so that pmrpc may relay
  // messages. For each message received from the worker, call pmrpc processing
  // method. This is child worker to parent communication.

  var createDedicatedWorker = this.Worker;
  this.nonPmrpcWorker = createDedicatedWorker;
  var createSharedWorker = this.SharedWorker;
  this.nonPmrpcSharedWorker = createSharedWorker;

  var allWorkers = [];

  this.Worker = function(scriptUri) {
    var newWorker = new createDedicatedWorker(scriptUri);
    allWorkers.push({context : newWorker, type : 'worker'});
    var handler = createHandler(processPmrpcMessage, newWorker, "worker");
    addCrossBrowserEventListerner(newWorker, "message", handler, false);
    return newWorker;
  };

  this.SharedWorker = function(scriptUri, workerName) {
    var newWorker = new createSharedWorker(scriptUri, workerName);
    allWorkers.push({context : newWorker, type : 'sharedWorker'});
    var handler = createHandler(processPmrpcMessage, newWorker.port, "sharedWorker");
    addCrossBrowserEventListerner(newWorker.port, "message", handler, false);
    newWorker.postMessage = function (msg, portArray) {
      return newWorker.port.postMessage(msg, portArray);
    };
    newWorker.port.start();
    return newWorker;
  };

  // function that receives pings for methods and returns responses
  function receivePingRequest(publicProcedureName) {
    return typeof fetchRegisteredService(publicProcedureName) !== "undefined";
  }

  function subscribe(params) {
    return register(params);
  }

  function unsubscribe(params) {
    return unregister(params);
  }

  function findAllWindows() {
    var allWindowContexts = [];

    if (typeof window !== 'undefined') {
      allWindowContexts.push( { context : window.top, type : 'window' } );

      // walk through all iframes, starting with window.top
      for (var i=0; typeof allWindowContexts[i] !== 'undefined'; i++) {
        var currentWindow = allWindowContexts[i];
        for (var j=0; j<currentWindow.context.frames.length; j++) {
          allWindowContexts.push({
            context : currentWindow.context.frames[j],
            type : 'window'
          });
        }
      }
    } else {
      allWindowContexts.push( {context : this, type : 'workerParent'} );
    }

    return allWindowContexts;
  }

  function findAllWorkers() {
    return allWorkers;
  }

  function findAllReachableContexts() {
    var allWindows = findAllWindows();
    var allWorkers = findAllWorkers();
    var allContexts = allWindows.concat(allWorkers);

    return allContexts;
  }

  // register method for receiving and returning pings
  register({
    "publicProcedureName" : "receivePingRequest",
    "procedure" : receivePingRequest});

  function getRegisteredProcedures() {
    var regSvcs = [];
    var origin = typeof this.frames !== "undefined" ? (window.location.protocol + "//" + window.location.host + (window.location.port !== "" ? ":" + window.location.port : "")) : "";
    for (var publicProcedureName in registeredServices) {
      if (publicProcedureName in reservedProcedureNames) {
        continue;
      } else {
        regSvcs.push( {
          "publicProcedureName" : registeredServices[publicProcedureName].publicProcedureName,
          "acl" : registeredServices[publicProcedureName].acl,
          "origin" : origin
        } );
      }
    }
    return regSvcs;
  }

  // register method for returning registered procedures
  register({
    "publicProcedureName" : "getRegisteredProcedures",
    "procedure" : getRegisteredProcedures});

  function discover(params) {
    var windowsForDiscovery = null;

    if (typeof params.destination === "undefined") {
      windowsForDiscovery = findAllReachableContexts();
      for (var i=0; i<windowsForDiscovery.length; i++) {
        windowsForDiscovery[i] = windowsForDiscovery[i].context;
      }
    } else {
      windowsForDiscovery = params.destination;
    }
    var originRegex = typeof params.originRegex === "undefined" ?
      "(.*)" : params.originRegex;
    var nameRegex = typeof params.nameRegex === "undefined" ?
      "(.*)" : params.nameRegex;

    var counter = windowsForDiscovery.length;

    var discoveredMethods = [];
    function addToDiscoveredMethods(methods, destination) {
      for (var i=0; i<methods.length; i++) {
        if (methods[i].origin.match(new RegExp(originRegex)) &&
            methods[i].publicProcedureName.match(new RegExp(nameRegex))) {
          discoveredMethods.push({
            publicProcedureName : methods[i].publicProcedureName,
            destination : destination,
            procedureACL : methods[i].acl,
            destinationOrigin : methods[i].origin
          });
        }
      }
    }

    pmrpc.call({
      destination : windowsForDiscovery,
      destinationDomain : "*",
      publicProcedureName : "getRegisteredProcedures",
      onSuccess : function (callResult) {
                    counter--;
                    addToDiscoveredMethods(callResult.returnValue, callResult.destination);
                    if (counter === 0) {
                      params.callback(discoveredMethods);
                    }
                  },
      onError : function (callResult) {
                  counter--;
                  if (counter === 0) {
                    params.callback(discoveredMethods);
                  }
                }
    });
  }

  reservedProcedureNames = {"getRegisteredProcedures" : null, "receivePingRequest" : null};

  // return public methods
  return {
    register : register,
    unregister : unregister,
    call : call,
    discover : discover
  };
}();

//AMD suppport
if (typeof define == 'function' && define.amd) {
	define("pmrpc", pmrpc);
}
;
/*!
 * cookie-monster - a simple cookie library
 * v0.2.0
 * https://github.com/jgallen23/cookie-monster
 * copyright Greg Allen 2013
 * MIT License
*/

define('vendor/monster', {
  set: function(name, value, days, path, secure) {
    var date = new Date(),
        expires = '',
        type = typeof(value),
        valueToUse = '',
        secureFlag = '';
    path = path || "/";
    if (days) {
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toUTCString();
    }
    if (type === "object"  && type !== "undefined") {
        if(!("JSON" in window)) throw "Bummer, your browser doesn't support JSON parsing.";
        valueToUse = JSON.stringify({v:value});
    } else {
      valueToUse = encodeURIComponent(value);
    }
    if (secure){
      secureFlag = "; secure";
    }

    document.cookie = name + "=" + valueToUse + expires + "; path=" + path + secureFlag;
  },
  get: function(name) {
    var nameEQ = name + "=",
        ca = document.cookie.split(';'),
        value = '',
        firstChar = '',
        parsed={};
    for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) == ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) {
        value = c.substring(nameEQ.length, c.length);
        firstChar = value.substring(0, 1);
        if(firstChar=="{"){
          parsed = JSON.parse(value);
          if("v" in parsed) return parsed.v;
        }
        if (value=="undefined") return undefined;
        return decodeURIComponent(value);
      }
    }
    return null;
  },
  remove: function(name) {
    this.set(name, "", -1);
  },
  increment: function(name, days) {
    var value = this.get(name) || 0;
    this.set(name, (parseInt(value, 10) + 1), days);
  },
  decrement: function(name, days) {
    var value = this.get(name) || 0;
    this.set(name, (parseInt(value, 10) - 1), days);
  }
});
(function() {
  var x,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  x = require;

  define('memberful/embedded/config', window.MemberfulOptions || {});

  define('memberful/embedded/api', ['memberful/embedded/utils', 'memberful/embedded/config'], function(utils, config) {
    return (function() {
      function _Class() {
        this.setup = __bind(this.setup, this);
      }

      _Class.prototype.setup = function() {
        var Display, Interceptor, Log;
        Log = require('memberful/embedded/log');
        window.debug = new Log;
        window.debug.log("embedded.js built on 2014-11-28 22:27:42 UTC in production");
        Display = require('memberful/embedded/display');
        Interceptor = require('memberful/embedded/interceptor');
        this.display = new Display();
        return utils.ready((function(_this) {
          return function() {
            var link_to_preload, links, type, _ref;
            _ref = Interceptor.interceptableLinks();
            for (type in _ref) {
              links = _ref[type];
              link_to_preload = links[0] != null ? links[0].getAttribute('href') : "";
              Interceptor.intercept(links, _this.display.forType(type, link_to_preload));
            }
            _this.display.listenForFrameBust(config);
            _this.display.listenForClose();
            _this.display.listenForOpen();
            return _this.display.frameBust(config);
          };
        })(this));
      };

      _Class.prototype.lib = x;

      return _Class;

    })();
  });

}).call(this);
(function() {
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  define('memberful/embedded/display/fallback', ['memberful/embedded/utils'], function(utils) {
    var FakeDisplay;
    return FakeDisplay = (function() {
      function FakeDisplay() {}

      FakeDisplay.prototype.openUrl = function(url) {
        return utils.redirectToUrlInForeground(url);
      };

      FakeDisplay.prototype.setup = function() {};

      FakeDisplay.prototype.isActive = function() {
        return false;
      };

      return FakeDisplay;

    })();
  });

  define('memberful/embedded/cookie_check', ['memberful/embedded/utils', 'vendor/monster'], function(utils, cookies) {
    var debug, isTrustCached;
    debug = window.debug.context("memberful/embedded/cookie_check");
    isTrustCached = function() {
      return cookies.get("memberful_cookies_enabled") === true;
    };
    return {
      checkTrust: function(onBounceRequired, onBounceNotRequired) {
        var xhr;
        if (!utils.isSafari()) {
          return onBounceNotRequired("not_safari");
        }
        if (isTrustCached()) {
          return onBounceNotRequired("cached_yes");
        }
        xhr = new window.XMLHttpRequest();
        xhr.open('GET', utils.memberfulUrl("cookies?_=" + (Date.now())), true);
        xhr.setRequestHeader('Accept', '*/*');
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.withCredentials = true;
        xhr.onreadystatechange = function() {
          if (xhr.readyState >= 2) {
            xhr.onreadystatechange = (function() {});
            if (xhr.status >= 200 && xhr.status < 400) {
              cookies.set("memberful_cookies_enabled", true, 365);
              return onBounceNotRequired("cookies_found");
            } else {
              return onBounceRequired();
            }
          }
        };
        xhr.send(null);
        return null;
      }
    };
  });

  define('memberful/embedded/display', ['memberful/embedded/utils', 'memberful/embedded/display/overlay', 'memberful/embedded/display/fallback', 'memberful/embedded/cookie_check', 'memberful/embedded/display/untrusted_display', 'memberful/rpc'], function(utils, Overlay, FallbackDisplay, CookieTrustCheck, PotentiallyUntrustedDisplay, rpc) {
    var debug;
    debug = window.debug.context("memberful/embedded/display");
    return (function() {
      function _Class() {
        this.hideFrame = __bind(this.hideFrame, this);
        this.displays = {};
        this.browserTrustsMemberfulCookies = null;
        this.fallback = new FallbackDisplay;
      }

      _Class.prototype.active = function() {
        var display, _, _ref;
        _ref = this.displays;
        for (_ in _ref) {
          display = _ref[_];
          if (typeof display.isActive === "function" ? display.isActive() : void 0) {
            return display;
          }
        }
      };

      _Class.prototype.hideFrame = function(options) {
        var _ref;
        if (options == null) {
          options = {};
        }
        debug.info("closing frame");
        if ((_ref = this.active()) != null) {
          _ref.hide();
        }
        if ((options.load != null) && utils.isSafeUrlToRedirectTo(options.load)) {
          debug.info("method=hideFrame at=redirect_to url=" + options.load);
          return utils.redirectToUrlInForeground(options.load);
        } else if ((options.refresh != null) && options.refresh === true) {
          debug.info("method=hideFrame at=refresh url=" + document.URL);
          return utils.redirectToUrlInForeground(document.URL);
        }
      };

      _Class.prototype.frameBust = function(config) {
        var error;
        if (window.top === window.self) {
          debug.info("method=frameBust at=skip reason=not_in_frame");
          return;
        }
        if (config.memberSignedIn !== true) {
          debug.info("method=frameBust at=skip reason=not_signed_in");
          return;
        }
        try {
          debug.info("method=frameBust at=bust");
          return rpc.call(window.parent, "page.frame_bust", []);
        } catch (_error) {
          error = _error;
          debug.error("method=frameBust at=error");
          return debug.error(error);
        }
      };

      _Class.prototype.listenForFrameBust = function(config) {
        var error;
        if (config.memberSignedIn === true) {
          debug.info("method=listenForFrameBust at=skip reason=member_signed_in");
          return;
        }
        try {
          return rpc.listen("page.frame_bust", function() {
            debug.info("method=listenForFrameBust at=bust " + document.URL);
            return utils.redirectToUrlInForeground(document.URL);
          });
        } catch (_error) {
          error = _error;
          debug.error("method=listenForBust at=error");
          return debug.error(error);
        }
      };

      _Class.prototype.listenForClose = function() {
        var listenForEscape, listenForRpc;
        listenForEscape = function(callback) {
          var ESCAPE;
          ESCAPE = 27;
          return utils.handle(window, "keydown", function(e) {
            if (e.keyCode === ESCAPE) {
              debug.info("method=listenForClose at=esc_close");
              return callback();
            }
          });
        };
        listenForRpc = function(callback) {
          return rpc.listen("page.close", function() {
            debug.info("method=listenForClose at=rpc_close");
            return callback.apply(null, arguments);
          });
        };
        listenForEscape(this.hideFrame);
        return listenForRpc(this.hideFrame);
      };

      _Class.prototype.listenForOpen = function() {
        return rpc.listen("page.load_url_in_background", function(options) {
          var url;
          url = options.url;
          if (utils.isSafeUrlToRedirectTo(url)) {
            debug.info("method=listenForOpen heard=page.load_url_in_background at=url_safe url=" + url);
            return utils.loadUrlInBackground(url);
          } else {
            return debug.error("method=listenForOpen heard=page.load_url_in_background at=not_safe url=" + url);
          }
        });
      };

      _Class.prototype.forType = function(type, url_to_preload) {
        var frameName, overlay;
        if (!utils.browserSupportsOverlay()) {
          debug.info("method=forType at=browser_not_supported");
          return this.fallback;
        }
        debug.info("method=forType at=preloading_url frame=" + type + " url=" + url_to_preload);
        if (this.cookieCheckRunning !== true) {
          this.cookieCheckRunning = true;
          CookieTrustCheck.checkTrust((function(_this) {
            return function() {
              debug.info("method=forType at=memberful_is_untrusted called_for=" + type);
              return _this.browserTrustsMemberfulCookies = false;
            };
          })(this), (function(_this) {
            return function(reason) {
              debug.info("method=forType at=memberful_is_trusted called_for=" + type + " reason=" + reason);
              return _this.browserTrustsMemberfulCookies = true;
            };
          })(this));
        }
        frameName = (type === "checkout" ? type : "default");
        if (!this.displays[frameName]) {
          overlay = new Overlay(frameName, url_to_preload);
          overlay.setup(this);
          if (utils.frameNeedsCookieFallbackWrapper(frameName)) {
            overlay = new PotentiallyUntrustedDisplay(this, overlay);
          }
          this.displays[frameName] = overlay;
        }
        return this.displays[frameName];
      };

      return _Class;

    })();
  });

  define('memberful/embedded/display/untrusted_display', function() {
    return (function() {
      function _Class(display, overlay) {
        this.openUrl = __bind(this.openUrl, this);
        var funk, ref;
        this.display = display;
        this.overlay = overlay;
        for (ref in overlay) {
          funk = overlay[ref];
          if (ref === "openUrl") {
            continue;
          }
          this[ref] = funk;
        }
      }

      _Class.prototype.openUrl = function(url) {
        if (this.display.browserTrustsMemberfulCookies !== true) {
          return this.display.fallback.openUrl(url);
        }
        return this.overlay.openUrl(url);
      };

      return _Class;

    })();
  });

  define('memberful/embedded/display/overlay', ['memberful/embedded/display/frame/rpc', 'memberful/embedded/display/frame/src_change', 'memberful/embedded/utils'], function(RpcFrame, ManualFrame, utils) {
    var BackgroundImageCss, debug;
    debug = window.debug.context("memberful/embedded/overlay");
    BackgroundImageCss = "url(data:image/gif;base64,R0lGODlhIAAgAPcAAAAAADAwMC4uLiwsLDIyMlZWVkBAQHBwcDo6OmpqakRERD4%2BPkJCQkZGRkpKSkhISExMTFBQUE5OTlJSUlRUVGRkZGhoaDY2Njw8PFxcXGZmZlhYWF5eXjQ0NCoqKiYmJlpaWjg4OGJiYmBgYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH5BAEFACQAIf8LTkVUU0NBUEUyLjADAQAAACwAAAAAIAAgAAAI%2FgBJCBxIkESAgwgTFlzIUGDChwgFBGjYMIBEiBglUiSY8MKEDAsSGhCxAYHCjQ8VZMggIeGEChUaPKR4EeGFlRkIHCQgAmYIiAwxBiiwMmQAAzBBCC2IUIFJhA1WQjj4soIDkVcPEpSooEABBQhD4DzYs8LTABESJLgqYCBCCF4LRLhwkGgGBAtgZjh4gYPaBBsQOtwJN25IBSAgEOgwQQRYBRb%2BbqCrFaKBuAUMCHXw10JWoTYneNWMkXMCEWdBIyTQ4IFqChN0qp5Ne3OE27g%2Fg65woLfvCglxC49A27fxAwkdDI%2BgW6iI4wdE1J5O%2FShpoQhS077QwIEDDEJDmRgwsKADRAIGEy7w7h08RvHjDfw8uVoBewcmEShYQIAABvkBXBAfebJNJBBX7CkgmwEKKHCBgOPttEB8IbXlVgDrOWBUAB00CJZ1Bph3EALjzcdUABhQNmKDRv1nQGoXmLgQRgw0SBmEG54UVEIdNijSeAVqhRJC%2Bu2n3ngqGriRQRJ1wGCSAvJnkZJLOlRTRlRWyZFQ6G0UEAAh%2BQQBBQAkACwAAAAAIAAgAIcAAAAwMDAuLi4sLCwyMjJYWFhAQEBycnI8PDxsbGxGRkY%2BPj5CQkJISEhERERMTExKSkpOTk5QUFBUVFRSUlJWVlZmZmZwcHBoaGg2NjZeXl5aWlpgYGA0NDQqKiomJiZcXFw4ODg6OjpkZGQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI%2FgBJCBxIkESAgwgTFlzIUGDChwgFBGjYMIBEiBglUiSYMIOEAggSLuBQIYTCjQ8ZbNjwIKEEDhwUPKR4EWGGlQUIHCSgAWYGiAwxBpiwMmQAAzALCC2I0IBJhApWtgzwMqZICDonDpTIYMIEBjZxHuzJ4WmABxYsQLA4ECEErxMe%2FBy6UgSCpAczgEhrQelBhzvfeqUQkkGBBwQ6SNDgIACDEXwLdEBo8KEBuBMMCG3A10IDoQ8zRPCqGSNnCxpEgIZIQIFM0BQiZF1Nu7bpCLhzf6atIYHv3xoS5h4eofbv4wkSKiAe4fVqDsgTBLdNnToBA6WFbshZPYMD16oxmEY4cACD0YQEKiNE4Bq80PHkD0ylrJ4Ag%2FYKTIYwgIAAAQROBaDABfFxMJdWJEhkQHsMZIWdARlk8OBBIYxQIFttBcCeAud1MOFR2E12EAXkFYcgYAgcGMB%2B%2FB0EYIBNTRUURA%2FOJaEBC2BE0UMeYpfQg7P9hRJCLJ6nIXYqbtSWRB0AqKKE%2FVl0opIG1ZTRlFRmiFF6GwUEACH5BAEFACUALAAAAAAgACAAhwAAADAwMC4uLiwsLDIyMlZWVkBAQHBwcDo6Om5ubkRERD4%2BPkJCQkZGRkpKSkhISExMTFBQUE5OTlJSUlRUVGBgYGpqamxsbDQ0NDw8PFxcXGRkZFhYWGJiYl5eXmZmZioqKiYmJlpaWjY2Njg4OAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAj%2BAEsIHEiwRICDCBMWXMhQYMKHCAUEaNgwgESIGCVSJJhwRIQCCBIu0DCBhMKNDxkUKOAgYQQNGhQ8pHgRIYaVBQgcJABTwwiIDDEG%2BFggw0EDMAsILYjQgEmECla2HAqzgcgHOicOlGggQgQDCEfgDMAT5tMADjZseGBxIMIHXiM4wHBwwkoEGZIeHMFB7QalBx3uhBs3pAEKDggQkCBCJoMKfgvQDQyxa9wFQhv47WBVaEcIXjFj1LxBQ0jPDwkokOk5goSsqGPLxqjAge3brFFrsMC7t4aEt4NPRd27uIWEtYXn9rzb%2BO%2FZ0KETWCBaKIec0TEYWH0aooQDBz6TdEdIwGBCBKu5C4UAHjyEmebJbk%2F%2Fk4SBDIozOA2gIEF7DZNpVQJX6RmQlQEIYjACgmAFQEIH7XnQllsBoKdAd9oheFSCCEXgXmAcVRhghQiepp8B4xnwnoAhPsTgTwEsaEB1JwWVUIYNbmggfBQlZN99IiEII4gbGSQRBgsYMKJ2C%2BikUZEc1ZQRi1C2CFF5GwUEACH5BAEFACYALAAAAAAgACAAhwAAADAwMC4uLiwsLDIyMlpaWkBAQHJycjo6OnBwcERERD4%2BPkJCQkZGRkhISExMTEpKSk5OTlBQUFJSUlRUVFZWVlhYWGZmZmhoaGxsbDY2Njw8PF5eXmpqalxcXGBgYDQ0NCoqKiYmJjg4OGJiYmRkZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAj%2BAE0IHEjQRICDCBMWXMhQYMKHCAUEaNgwgESIGCVSJJhQwwMKCBIuKCBBg8KNDw1QoOAg4YMCBRg8pHgRoYaVEwgcJACzgMmZCzEGiLByw8GRBSYILYjQwIiEDFY2OPiygIKEG6YeJCjRQIQIBmzi1NnzZwAIHz5MFTAQYYOvERr8JAoSAUylATRUSPsB70SDOxXAfRDSgAQHBEA8qCDTAAe%2BORECFvkA7gKhDfhyuCq0I4SvlzEqSFsgZOeHBBjI7Bzhgc7TsGMLVdCgtm3Opwtc2M27QELbwLWe5k38QkLawVfnLn7Bt%2Bzn0BGYFlqBwmvZIAxof4rxQYYMF6aZIyQw%2BeAI7duFev%2BeAQLQ8QvQGzB5fgMBDRwOPAigoAN7n5IJJFF82i3wGnoaMHDAARiY9wF7HljEUQAIaDdddtoFQEACC04XwXf7%2FdVWACOYRaGFB3mwoAQJGeCeiBOmpN1PDSxoHEQUPYRhWDtxeIB4MDKU0HkGGIVQfvqdtJFBEoEQn4kKHEDCdEsyVVNGQVY5IkbkbRQQACH5BAEFACQALAAAAAAgACAAhwAAADAwMC4uLiwsLDIyMlZWVkBAQHBwcDw8PGpqakRERD4%2BPkJCQkZGRkpKSkhISExMTFBQUE5OTlJSUlRUVGBgYG5ubmRkZGZmZmhoaGxsbDY2NlpaWlhYWFxcXDQ0NCoqKiYmJjg4ODo6OgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAj%2BAEkIHEiQRICDCBMWXMhQYMKHCAUEaNgwgESIGCVSJJhwg4MIIxIiKCBhg8KNDw1EiNAgoYMCBQw8pHgR4YaVERLCLGBy5kKMASCsRHBwZIGcGAsiRNDzoMoICg6%2BLMBAZNSDBCUicOBggU2cB3c2feDBQ0sBAxEq4OpAwYeDQiOIMIp0A4WyHpBONHiQwFq2IVUqIPDBAQWZBjjgjfAWK8StbIliVIDXw1WgNhtwlQyRsocCIjBjNCATMwQHBESrXo3ZgILXsEuL5nChtm0OCWHrvozZtu8LCV3vlo25w%2B8LHVgrXx4AAWeMBSakVv6BtIHQGB0kSFDheV%2B%2BCEWNWL8OVPv2BA58IiSAYLxJ8QgIbOBgAUIABRjOc2i8l4RW6wtMZ90GDBxwAHABbOCBfhZxFIB45B1UHWkBEGCBgdgFIMF26fXn0INNPUiaZBwYKEFwHTI0Gmk9KWAggj6pmNCEslmIYYwVhTdiQiUeYB9CG6Ul0QfthVhgBSFpFCRHNWXk4ZIOYkRAkAEBACH5BAEFACYALAAAAAAgACAAhwAAADAwMC4uLiwsLDIyMlpaWkBAQHJycjw8PHBwcEJCQj4%2BPkZGRkREREhISEpKSkxMTE5OTlBQUFRUVFJSUlZWVlhYWGBgYGJiYmZmZmhoaGxsbG5ubjY2Nl5eXmpqalxcXDQ0NCoqKiYmJjg4ODo6OgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAj%2BAE0IHEjQRICDCBMWXMhQYMKHCAUEaNgwgESIGCVSJJiwAwMIJBIimAChg8KNDxdEiNAgoYMJEww8pHgRYYeVEBASgDnB5MyFGAM4WFni4EiSQQsiRODzoIGVCg6%2BnBB1acuDBCUiYMAAgU2cBynAbMqgQIGWAgYiNMCVgQICBx%2Bs7FACZoSDHSSYLXAXq8GDBNi2DYkAQgMCBBxIkGlgL98QCP%2BKdNDWK0YFjqsGtdm26GWzE0JuhrhA5uYHDuCOXs06KAIDsGNbHl3hgu3bFRLG3m169O3fF0TyNrCAdW3gE1orXx4AwWyMFCSobh0itmiIDjJkuOA5IQHJB0mZ7L7%2BMLv2DA5%2B6nwd22SEBCBChCjw4UEABRjOV2g6UGvsBap9cMABsG2wAQZ4FaCfRRwFIJ4B1yEwYAIBEGDgBtdBoJ19EzVIQlMBTDBgAQdZYGBfBy2QXodKQaTBgFc1YCCCEFH0kIQHJKCahQaSx2JFCEUwIAgJFWAgh35tJBkCGCSg2X0beBCSRkpyVFNGP1bZIEbfbRQQACH5BAEFACUALAAAAAAgACAAhwAAADAwMC4uLiwsLDIyMlZWVkBAQHBwcDo6OmpqakJCQj4%2BPkREREZGRkhISEpKSkxMTE5OTlBQUFJSUlRUVFxcXG5ubmBgYGRkZGZmZmhoaGxsbDY2Njw8PFpaWmJiYlhYWDQ0NCoqKiYmJjg4OAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAj%2BAEsIHEiwRICDCBMWXMhQYMKHCAUEaNgwgESIGCVSJJiQA4MHJBIikPCAg8KNDzs8eKAgYQMJEhY8pHgRYYiVDwgcJABTgsmZCzEGaLAyZICRJIUW3Ing58EFKw0cfClBKkIELQ8SlIiAAQMECDmsdHAwAkynDAoUaClgIEIDXhkY0Dl0JQekEA5yiKC2QF6tBncuiKsgZAcHUgk0iCBzQV%2B%2FdCdC7BoXLEYDj60KtanAq2WICtRKMLo5IYEOHUo7aBC5tOvXEBcYmE1bpmsKFXLrppCQtm%2FNm3ULr5BQ9m%2FbpScMrzABtvPnRz9jlBChtesQtEk%2FdIABQwXpOwOZIyThW7vL7hg%2BNACKkIDx2SYhWPDAIUSBDGQNXEBPIQTCgRK9twBdGRxwwGwJJHCBXiCgV4BFHB0122cdGLhBAARkkCBpD3RH1kQRkuBUABIY6MFBBST411PrgbgURBgYmJUCCS4IEUUPIWCgBXRluCFQOCIEgYkJpZjAh4BtZBBXF1gAnAEafGeRi0o6VFNGVFYZIUYEKBkQACH5BAEFACYALAAAAAAgACAAhwAAADAwMC4uLiwsLDIyMlpaWkBAQHJycjw8PG5ubkJCQj4%2BPkZGRkREREhISExMTEpKSk5OTlBQUFJSUlRUVFZWVlhYWGBgYGJiYmRkZGZmZmhoaGxsbDY2Nl5eXmpqalxcXDQ0NCoqKiYmJjg4ODo6OgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAj%2BAE0IHEjQRICDCBMWXMhQYMKHCAUEaNgwgESIGCVSJJiwgwIHHRKSeMAgJMKNBhMiYMDAQEIGESIgeEjxIsIQLBkQOEjgQcwQEBliDNCAJYmDJWI6GFoQIQmTB1e2PNgg5gKRLg8SlEjCgIGjB3GyPOgzAlQFFCi4FDAQIQKvBhDsDJCzAwmlYR%2BkpQDhZMqocA2ELNGSAIEGD2YimLDXwdyJELvCBQvRwN4JWYfeXOAV6kPLFMxqxohgpmaWj0erXg3xbeC4qycUmE17QsLXcFfT3l1AJe6rqiXwLiCBtfHjBCz01hzhQWrVCz4cOBBhKIMLFwpQRkjg78EI06eZP7COHTsDmn87XAif4PyDDwVCEKCQYakBD%2BUnANUqUCKG8BiYlEECCXCmgQYeHNRBBflZxFEAEkxnW1QEbhAAARkcSJkD5vHXVgARZAYigRUcRMGBfbl13kQLYYQBgQocpMCBCQZVUUIlEPjBXBhqiB5FCT1AoAUJnajBUn6hZFEAJXjAgYgGZKDdkig1ZVNGLFbZ4lDdbRQQACH5BAEFACUALAAAAAAgACAAhwAAADAwMC4uLiwsLDIyMlZWVkBAQHBwcDw8PGpqakJCQj4%2BPkREREZGRkpKSkhISExMTE5OTlBQUFJSUlRUVFxcXG5ubl5eXmJiYmRkZGZmZmxsbDY2NlhYWGBgYDQ0NFpaWioqKiYmJjg4ODo6OgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAj%2BAEsIHEiwRICDCBMWXMhQYMKHCAUEaNgwgESIGCVSJJjwgwEGHBKOcABS4caHIxgwWJBQgQMHCB5SvIiQgEoFCV86CClzIcYAClTyHEnyZ0GEI3geJKEyJtCXTg%2BOMICQoMSpBkYg%2FHAzAAGdHxAqkCCBqoCBCBEYWIuAwMGgIDm8bHBQLlkJD6oaTLt2bcgRCtoScBkTQYS7D9we3Cuyb9afBu5KYPmz4wK%2FkMlCUFo5IYKoGBng7Ey6dGW1jg2A%2FhmhgOvXERKm7lv6te0CnmdT7tz6dmzTwIETKNChMwQHik0j0HDgAISfDCpUKKD1IQHGByE0b%2B4AunTpDHqUIuRwYfuG8A40FPjwYQIGuga%2BV5AQdrFAiR62e%2BCJIUGCBQtkkEEFdU3wnQQWcRRABM0heBAC%2FmlAAAEYCFhdAA2AZx9aAUBAFUIR%2BIdbABMI2F1a4U3kE0Qe%2BDeaAQISCBFFKEVYU4UZcKYijQg5IGJCJWZAl14bGXRVBRp8eJABGHSglUZFckRTRjtGedRP120UEAAh%2BQQBBQAlACwAAAAAIAAgAIcAAAAwMDAuLi4sLCwyMjJaWlpAQEBycnI8PDxsbGxEREQ%2BPj5CQkJGRkZISEhKSkpMTExOTk5QUFBUVFRSUlJWVlZYWFhmZmZqamo2NjZgYGBoaGheXl5iYmI0NDQqKipcXFwmJiY4ODg6OjpkZGQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI%2FgBLCBxIsESAgwgTFlzIUGDChwgFBGjYMIBEiBglUiSY0AMCAxkSZnDAwIPCjQ9FGDCAIKGBBg1anmR4ESGBlQYSwmxg8iFDjAFwhgwgAqYCoAURihh6UCXLgy9jJlSJkKBEpyJs4jy4s2fQCBEWWByI8ONKBAQOLliZIYPRgx4cgI1w9KDDsjhBEn16s8GIAAggzG2Q1i5EpyuzYkQwF4JMoAg9rNWLcQHYB0whJ0TwGKOCnJpDi4Z84YDp0xdEQ5jAujWEhKdjHxDduvaEhKVlk1Bte8LrhwJqjh6ekMCECpofOCg8GsGFBAkeAFVQoMAExcUNJoQAHbqD6dWrlDPwqT1ABg7dMRx1QGKCBw8SOBxdYCF8BK8DJaKHzmGohgsXLICABhoUcFAGEtg3FlkBRABdBGUB2EEABHBAIHbUFVBXUgE8IBZCEAB4WwASENjAZhsuhBEHAIJmAIEWYERRSgCSUBgBBGqQ2UQoIeSAiAmVqEFddm3k0FUFkACaWhpcZxGPRpIlHEQaRfkTUAQYGRAAIfkEAQUAIgAsAAAAACAAIACHAAAAMDAwLi4uLCwsMjIyVlZWQEBAcHBwOjo6ampqREREPj4%2BQkJCSEhIRkZGSkpKTExMUFBQTk5OUlJSVFRUZGRkaGhoNjY2PDw8XFxcZmZmWlpaYGBgNDQ0KioqJiYmODg4YmJiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACP4ARQgcSFBEgIMIExZcyFBgwocIBQRo2DCARIgYJVIkmLDDAgMXEl5QYKCDwo0PQRgwgCGhAQUKEDykeBEhgZUGbMJUYHLmQowBcIYMMJIk0IIIEQw9iGClzAALYD49eGEBQoISmxqYenPlwZ09oT54YFXAQIQfVy4gcDDthaIMDhJwMPaBgqsG0eIEGUBlSwJRZSKoa5ftwbwJVeIEARRD3QZTgR70uHLpQ8cPGliWnDQyxJWGOYsejbHCgdOoK4x%2BEKG16wcJUcs%2BMNq17QgJQ8w%2BwGF0g9sRYJMePpzABAqcGzQIPRpDiAQJhENkUKDAhM0BCCA%2B%2BMAC9AQNgJMaqF4950mEFzZ813C3AYcJBAhEyHB3AfkCEEIPlJjhe4ahGVRQAQYLZJBBAVRFQB4EFnEUAATQMciUgL0RYOB%2FCClQXVwTOUhWQg8IiFsAEhjoQEJNHfYTRAFWYJ4BBiIIEUUPIUChYRYauNlG2zUg4AQJzUffSTxaFAACBYRgFVoZXGckj0jVlFGHUK6IkXYbBQQAIfkEAQUAJAAsAAAAACAAIACHAAAAMDAwLi4uLCwsMjIyWlpaQEBAcnJyPDw8cHBwREREPj4%2BQkJCRkZGSEhITExMSkpKTk5OUFBQVFRUUlJSVlZWWFhYZmZmbGxsNjY2YGBgaGhoXl5eYmJiNDQ0KioqJiYmODg4Ojo6ZGRkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACP4ASQgcSJBEgIMIExZcyFBgwocIBQRo2DCARIgYJVIkmNADAgMZEmYwsMCDwo0PQxgwgCDhRwMhHlKESGClgYQ2CUBkiDGAzZABRpLsWRChhJsIVbI8%2BDImwgwtDxKUKOHAgQkIa648aNMk0wYNWgoYiLCD1QMjnC5YmUEoUgIKwDZAOtHgwQwaziZoEEBlSwIfY4aQO1enVIgPzh540FMEYRE9HyLYYJUxRgRgFQCNnJBABQucFywwzLm0aYwaMKhercG0gwiwYztIuLo2BtOxc0dImNp269INdEfge7p4cQISKHAGS9o0Ag0XLszGaGDChAibs9pF6CB6dOIQq5dbn0BX6vYMFryPYBCgAQcJBAg8KMAeAYXxELzWJSGxgPcCQBWggQYIIFBAAVgF9QB%2BFnEUAATRWRaACANycNCBACKkgHVIFUWAA1Ed5MCAuwUwXwEKJKSSeUVBJKAGSC1woHI7VaRihYYRYMGB2e1n40EKDChBQieyh9BGZEkUwgQEulSABCFphCRHF%2FUk5ZQLRUYAkgEBACH5BAEFACQALAAAAAAgACAAhwAAADAwMC4uLiwsLDIyMlZWVkBAQHBwcDw8PGpqakRERD4%2BPkJCQkZGRkpKSkhISExMTFBQUE5OTlJSUlRUVF5eXm5ubmZmZmxsbDY2NlpaWmRkZDQ0NGJiYlxcXGBgYCoqKiYmJjg4ODo6OgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAj%2BAEkIHEiQRICDCBMWXMhQYMKHCAUEaNgwgESIGCVSJJiQAwIDGRJmMLCAg8KND0UYMIAg4UcDIh5SvIiQwEoDCW8SgMgQY4CbIQOMJOmzIEIJOBGqZHnwZUyEGUYgJCgxwoEDEWrePHjTZFMFCqQKGIiwwtUDHZ4uWJlhaFKbYBUsmGrwYAazVy00CKCyJYGPMTPEVWBg58G6CSGcPQDBp4jBT30iRHDhamOMjxUw8Co5IYECBTojaNm5tGnJFRKoXl3BtAIHsGMrSLi6dgLTsXM7SJjatgfXuh3MPk2cOIEIWSWDNXwagYcNG%2FZiNIAcQlDPiA8%2B6AA9uk%2FqyCOKzD2JkEOB7h1wKtAQgQMBBwVwIggf4QHzgRLPQy8QtECFCqOBlhwHDoT3gEUcBeAAdLsdJMJ%2FGhwEGn8IgZeUUQQ0QNpBDfx3GXwFDOfghQth5F8F4yEgIEYUpQRhTRNedxhKCCnwnwQJgZjUjBsZJJEIE2iwYQAqWmfRRD1yRFNGSCZZok8E9BgQACH5BAEFACYALAAAAAAgACAAhwAAADAwMC4uLiwsLDIyMlpaWkBAQHJycjw8PHBwcERERD4%2BPkJCQkZGRkhISExMTEpKSk5OTlBQUFRUVFJSUlZWVlhYWGRkZGZmZmhoaGxsbG5ubjY2NlxcXGpqamBgYDQ0NCoqKiYmJl5eXjg4ODo6OgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAj%2BAE0IHEjQRICDCBMWXMhQYMKHCAUEaNgQosWIEykOTIjgwgEFCTkYWABCocaHEQ4c6MDRgAESDylKTEhCZQICCF0awBlz4cUMKkEGEDnyYsGDBB4YSEhBZYGDCFzCRMhhakaBEiNo0BABIQKbOHWWPFhCagABGw922Krhw1QPKg0QXRqAwAKdCBA6PAiiAFsPICMkKECAQFSYcw0g4DkR4gO2GiBcJKFT7sWHHbdKtkjZJePLCAlMmAAaQV7QqFNfLoChteunqBU0mE1b6EHXuDGkps27QULWuWGDlt2bgerjyJN2vayAwWfUJQp8%2BODb4oIIESBwgEjAYMIG06eU28aMPcKDBT2pTgg%2FYqmCAg8KO6CwtMSD8goYD5S4fvqE7QFMUEABJZQw2nIcNFCeb2ilBd4HDiBEwoAVHETBaAAGYAB2dB0VgAKnHfQefAc5MBpdB5FwGkMWCVjAaQiM9oBFFD3EwYDCiYZhTzUiNOKMCJk4AYpXnSQRBxJYEGIAMT6wnUQa%2BTTTRVBGWdFF3WkUEAAh%2BQQBBQAlACwAAAAAIAAgAIcAAAAwMDAuLi4sLCwyMjJWVlZAQEBwcHA6OjpqampEREQ%2BPj5CQkJGRkZKSkpISEhMTExQUFBOTk5SUlJUVFRkZGRubm5mZmZoaGhsbGw2NjY8PDxaWlpYWFhcXFw0NDQqKiomJiY4ODhgYGBiYmIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI%2FgBLCBxIsESAgwgTFlzIUGDChwgFBGjYMIBEiBglUiSYEAGJAwwSajCw4IPCjQ8hHDjAIeEGAwZEPKR4ESGClRYIIIRpQOfMhRgDVFip4OBIkkELHiTgYEHCCCtbBnhpAIFImQcJSoSQIIEEmzh18jR5EAFMqwIGIuTQNYEHDQcvrDRw1MDSBTydZjVolG3XC0UhZOBAgMBLmXUNbPA5EaKDtgkcBBXBk27QhwhGdJWMkTJMxpcREogwITQCq6FTq77MoYLr11JDG1BAu7ZdhK9zV1Bdu3dRhB10V%2Bigerbv26uTr2YKQTby1QgKePDwG%2BICBw4awH1IgC9CBdOnl1d%2FuAE79g0%2FEX6IEJ6DUwYFHBRuEMEpAvMOFDAeKHFC%2BAlkTVBAAadFEEFzAXyggHlFpaVWAA1M1wBCIgxIQQCjGbhdANc1tdeDCqB2kAIDckZfBM9pgN5EQEEUwYArImAgZz8x9JAGAxbAmIERbPhhRQjBF19CJ%2Br1I0UWBaABBAR2FIEDcGm0kVI1ZcTilDYG1d1GAQEAIfkEAQUAJwAsAAAAACAAIACHAAAAMDAwLi4uLCwsMjIyWlpaQEBAcnJyOjo6cHBwQkJCPj4%2BRkZGRERESEhISkpKTExMTk5OUFBQUlJSVFRUVlZWWFhYZGRkampqbGxsbm5uNjY2PDw8YGBgZmZmXFxcYmJiaGhoNDQ0KioqXl5eJiYmODg4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACP4ATwgcSPBEgIMIExZcyFBgwocPGzYMIACiRYQSCSZE0CGDgYQNDlxAoDDjwwcZMhRISOLAAQgRG1ZMaCIlBgIHCbg8QDJmwYsXUio4yMClh4s%2FAxB4sCBhhJQVDn5wKSHhBhMYB1Z84MEDzIMIbOJM4LJnAAQGDJAUMBChha4eCmw4GDTDAgUuMeRckNZA04MOD4qoAPfC0AcYLBDY8CHBgwAb%2BhrggBMwRAdwPTi4aELy3IsbO3TdbLFz2sqgExKQUBU0ArOpY8u2WKGD7dtRY%2FOV7Dfh7d8dZPPum7A2cAqyd0v%2BO7v57KWPQad1fpZCgQJDLSJgwP2zaoMgr5pfzw5xO3cHsAMEDiAigvgKTQ1McECAQAMITU1w524AtdYAEognwWcRUEABAiZEEAFpBCiw31BstRUAA9cxgNAGBlZFAAQKioAQB9z1lJQCsClgoIUBNKDgRxeKuJBFBVLAAVgKkubTi1YZOAFqHEbgYUkSJWSAgTamqCBz6mXkUEUbPDABbAhAwMBcFSn500wXVWklQ6ARoGRAACH5BAEFACUALAAAAAAgACAAhwAAADAwMC4uLiwsLDIyMlZWVkBAQHBwcDo6OmpqakJCQj4%2BPkREREZGRkhISEpKSkxMTE5OTlBQUFJSUlRUVGBgYG5ubmZmZmhoaGxsbDY2Njw8PFxcXGRkZFhYWGJiYjQ0NCoqKiYmJlpaWjg4OAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAj%2BAEsIHEiwRICDCBMWXMhQYMKHCAUEaNgwgESIGCVSJJgQAYcEBhIqOFABgcKNDx8kSFAgIYcDByA8pHgRIYmVFwgcJADzgMmZCzEGqLBSwUEGMDsILbjTwYKEEFa2DDACZoSEGkggJCjxQYcODxAiwEmAgAWYPwMgMGDApICBCAt87eBBw0GiCRYYgHlhp162Tw86PAiCwtwKRh9cKEBAw4gMYTWwZbtBp2CIDT7MbSCUxGQDdoV25PCVM0bPbC2LTkggwlXRCNKunk0bIwUOuHNToP33c%2BCDuYNzoP35c8IJwjlM4F3cwO%2Fa0GkTaOBg9YLK0UlMKFAgJEYEDBifKAABkYBBkdy5e4cIPjwD2RPPBwABIT2FpwYiNCir4MGGABoo4N4Cqg0kUQTpRUBeABBIIAECJDzwgGkEGOBeSG%2FBFYAC3DGAkAYOXkWAhA8sqFZ4PzG1oWwGOOjhhhI%2Bp0GKQUHU4IMHISChaUAx9BCIErx2EIkmCoYSQi1KwCOMD8i2EVwSaeAAjjY9wIBdGj3JUU0ZxadljRiZt1FAACH5BAEFACUALAAAAAAgACAAhwAAADAwMC4uLiwsLDIyMlpaWkBAQHJycjw8PHBwcEJCQj4%2BPkZGRkREREhISExMTEpKSk5OTlBQUFJSUlRUVFZWVlhYWGBgYGJiYmZmZmhoaGxsbDg4OF5eXmRkZGpqajQ0NCoqKiYmJjo6OjY2NgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAj%2BAEsIHEiwRICDCBMWXMhQYMKHCAUEaNgwgESIGCVSJJiQQ4EMBhIq2HBhhMKNDx1kyEAhYYENGyA8pHgRIYeVHggcJABzAweIDDEG6LAyZICRJIUWRMgAQcIHKycctADzQUIDERASlOjgwgWZB29mwBCAwAeYJg9SOHAgq4CBCCd4vVCBxMELKxEYgEk2wE22By5oNbhTrtcOIR1goEAAhAUNDgIwSAD4AgitEBnMvcBAaATAB6wK7VjAa2eMnw9ocDr6IYEHooUWqKCzte3bQicU2M1bqm29BoIHZ32Qt%2FECt4UrN3pQwvECEm4DV74At%2FXrBBicFoqAOG4OESieUGD%2BkEPwBZddE0ZoYIL48ULNC%2F95EiGIB%2B8nOF3wgAEBAgY05ZdyCNQ2kUAS4SfeA%2BlBEEEEHHCgXQM7TefUW3AdJZ4CCJHwoGjaMZDegAbQt1QAJV71IIcoaucdCCYuhJEDD9InIQMszlRRQiB8iFB22o140EbrBbDAgxSyp11aQxJpkEQgMPAAfWHheJlGTsJVU0YHZnkiRgQQGRAAIfkEAQUAJgAsAAAAACAAIACHAAAAMDAwLi4uLCwsMjIyVlZWQEBAcHBwPj4%2BampqQkJCRERERkZGSEhISkpKTExMTk5OUFBQUlJSVFRUXFxcbm5uXl5eZGRkZmZmaGhobGxsNjY2WFhYYGBgWlpaYmJiNDQ0KioqJiYmODg4Ojo6PDw8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACP4ATQgcSNBEgIMIExZcyFBgwocIBQRo2DCARIgYJVIkmHAEhw8IEhpIQGGEwo0PGVy4ICEhhwQJGjykeBHhiJUdCBwkkAGmyZkLMQagsNLAQQUwLQgtiJABiYQOVkY4WACmA5EPEBKUyIACBZkHb17ocBCDT4QSDhyAYHEgwgheKUjYcJDohRIjE5ANsOGC2gNKDzo8CAJuXKMMOkQgsKEABpkMKvylQFcwxAVxKSwQ%2BuBvhaxCOxbwuhlj5wMYSoSGSMDB1dAcCuhcTbu2UAgFcutmSxuBgd%2FAQyLUTbxAbeDIjSLEXZz3at%2FJhduebpvAgtJCSTylvuFBhAjKIZ2O%2BI0ABGuDIr9%2Fl%2F5wPPCfWtEHINBAPYSnJRwoIEAAgQKTGyCHwGwTCSRRfd81YF4ADLi2wQbXKbATdAaEJABHARjwXXgbuAaWAtctGIB7PzGVIXwBIOCahClet91BG5QYFEQNOvAThAuEdxJDD4Hg2msHXbcAgYKhhFB%2B%2BiWEwHUobuSWRBA6UBmMOZqnkZMc1ZRRgVjOiBEBTgYEADs%3D)";
    return (function() {
      var buildSpinner, buildWrapper;

      function _Class(frameName, initialUrl) {
        this.displayLoadingScreen = __bind(this.displayLoadingScreen, this);
        this.isActive = __bind(this.isActive, this);
        this.setup = __bind(this.setup, this);
        this.hide = __bind(this.hide, this);
        this.openUrl = __bind(this.openUrl, this);
        this.defaultFrame = new RpcFrame(frameName, initialUrl);
        this.backupFrame = new ManualFrame("" + frameName + "_backup");
      }

      buildSpinner = function() {
        var div;
        div = document.createElement('div');
        div.style.cssText = "left:0;right:0;margin:0;width:100%;height:100%;padding:0;border:0;background-repeat: no-repeat;background-position: 50% 35%";
        return div;
      };

      buildWrapper = function() {
        var div;
        div = document.createElement('div');
        div.style.cssText = "display: none; visibility: hidden; margin: 0; padding: 0; border: 0; z-index: 9999999999; position: fixed; top: 0; left: 0; right: 0; bottom: 0; " + (utils.css.transition("all", "0.2s")) + "; opacity: 0; background-color: rgba(0,0,0,.65); ";
        div.setAttribute("class", "memberful-overlay");
        return div;
      };

      _Class.prototype.openUrl = function(url) {
        var loadBackup, loadFrame, ultimateFallback, ultimateFallbackTimer;
        debug.info("#openUrl: " + url);
        this.displayLoadingScreen();
        this.activeFrame = null;
        loadBackup = (function(_this) {
          return function() {
            if (!_this.activeFrame) {
              _this.backupFrame.navigate(url, loadFrame);
              return loadBackup = function() {};
            }
          };
        })(this);
        ultimateFallback = function() {
          debug.error("openUrl#ultimateFallback: " + url);
          return utils.redirectToUrlInForeground(url);
        };
        loadFrame = (function(_this) {
          return function(frame) {
            clearTimeout(ultimateFallbackTimer);
            if (_this.activeFrame === null) {
              _this.spinner.style.backgroundImage = "";
              _this.activeFrame = frame;
              return frame.show();
            }
          };
        })(this);
        setTimeout((function() {
          return loadBackup();
        }), 4000);
        ultimateFallbackTimer = setTimeout(ultimateFallback, 10000);
        return this.defaultFrame.navigate(url, loadFrame, loadBackup);
      };

      _Class.prototype.hide = function() {
        var hideEverything;
        this.wrapper.style.cssText += "opacity: 0;";
        hideEverything = (function(_this) {
          return function() {
            _this.wrapper.style.cssText += "display: none;";
            _this.defaultFrame.hide();
            return _this.backupFrame.hide();
          };
        })(this);
        return setTimeout(hideEverything, 500);
      };

      _Class.prototype.setup = function(display) {
        if (this.hasBeenSetup) {
          return;
        }
        this.spinner = buildSpinner();
        this.wrapper = buildWrapper();
        this.wrapper.appendChild(this.spinner);
        utils.handle(this.wrapper, "click", display.hideFrame);
        utils.handle(this.spinner, "click", display.hideFrame);
        this.spinner.appendChild(this.defaultFrame.build());
        this.spinner.appendChild(this.backupFrame.build());
        document.body.appendChild(this.wrapper);
        return this.hasBeenSetup = true;
      };

      _Class.prototype.isActive = function() {
        return this.wrapper.style.display === "block";
      };

      _Class.prototype.displayLoadingScreen = function() {
        this.defaultFrame.hide();
        this.backupFrame.hide();
        this.wrapper.style.opacity = 0;
        this.wrapper.style.display = "block";
        this.wrapper.style.visibility = "visible";
        setTimeout(((function(_this) {
          return function() {
            return _this.wrapper.style.opacity = 1;
          };
        })(this)), 50);
        return setTimeout(((function(_this) {
          return function() {
            if (!_this.activeFrame) {
              return _this.spinner.style.backgroundImage = BackgroundImageCss;
            }
          };
        })(this)), 100);
      };

      return _Class;

    })();
  });

  define('memberful/embedded/display/frame/rpc', ['memberful/embedded/display/frame/base'], function(Frame) {
    var debug;
    debug = window.debug.context("memberful/embedded/frame/rpc");
    return (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        return _Class.__super__.constructor.apply(this, arguments);
      }

      _Class.prototype.navigate = function(url, onSuccess, onError) {
        debug.timeStamp("method=navigate at=start url=" + url);
        return this.call("page.load", [url], {
          onSuccess: (function(_this) {
            return function() {
              debug.info("method=navigate at=success url=" + url);
              return _this.onLoadCallback = function() {
                return onSuccess(_this);
              };
            };
          })(this),
          onError: (function(_this) {
            return function(e) {
              debug.error("method=navigate at=error url=" + url, e);
              return onError();
            };
          })(this)
        });
      };

      return _Class;

    })(Frame);
  });

  define('memberful/embedded/display/frame/src_change', ['memberful/embedded/display/frame/base', 'memberful/embedded/utils'], function(Frame, utils) {
    var debug;
    debug = window.debug.context("memberful/embedded/display/frame/src_change");
    return (function(_super) {
      __extends(_Class, _super);

      function _Class() {
        return _Class.__super__.constructor.apply(this, arguments);
      }

      _Class.prototype.navigate = function(url, onSuccess) {
        url = utils.bustUrl(url);
        debug.timeStamp("method=navigate url=" + url);
        this.onLoadCallback = (function(_this) {
          return function() {
            debug.info("method=navigate at=on_load url=" + url);
            return onSuccess(_this);
          };
        })(this);
        return this.frame.src = url;
      };

      return _Class;

    })(Frame);
  });

  define('memberful/embedded/display/frame/base', ['memberful/embedded/utils', 'memberful/rpc'], function(utils, rpc) {
    var buildFrame, debug;
    debug = window.debug.context("memberful/embedded/display/frame/base");
    buildFrame = function(name) {
      var frame;
      frame = document.createElement('iframe');
      frame.setAttribute("name", name);
      frame.setAttribute("frameBorder", "0");
      frame.setAttribute("allowTransparency", true);
      frame.style.cssText = "position: fixed;\nleft: 0;\ntop: 0;right:0;bottom:0;width:100%; height: 100%;\nz-index: 999999999999999;\ndisplay: none;\nbackground: transparent;\nborder: 0px none transparent;\noverflow: hidden;\nmargin: 0;\npadding: 0;\n-webkit-tap-highlight-color: transparent;\n-webkit-touch-callout: none; ";
      return frame;
    };
    return (function() {
      function _Class(frameName, initialUrl) {
        this.hide = __bind(this.hide, this);
        this.show = __bind(this.show, this);
        this.frameName = frameName;
        this.initialUrl = initialUrl;
      }

      _Class.prototype.call = function(procedure, params, options) {
        if (params == null) {
          params = [];
        }
        if (options == null) {
          options = {};
        }
        debug.debug("method=call frame=" + this.frameName + " rp=" + procedure);
        return rpc.call(this.frame, procedure, params, options);
      };

      _Class.prototype.show = function() {
        this.call("page.show.start");
        this.frame.style.display = "block";
        return setTimeout(((function(_this) {
          return function() {
            return _this.frame.style.opacity = 1;
          };
        })(this)), 20);
      };

      _Class.prototype.hide = function() {
        this.frame.style.display = "none";
        return this.frame.style.opacity = 0;
      };

      _Class.prototype.build = function() {
        var bustedUrl;
        this.frame = buildFrame(this.frameName);
        rpc.subscribe(this.frame, "page.loaded", (function(_this) {
          return function(event) {
            debug.debug("at=rpc heard=page.loaded");
            if (typeof _this.onLoadCallback === "function") {
              _this.onLoadCallback();
            }
            _this.onLoadCallback = null;
            return {
              current_page: document.URL
            };
          };
        })(this));
        if (this.initialUrl) {
          bustedUrl = utils.bustUrl(this.initialUrl);
          debug.debug("method=build at=preload url=" + bustedUrl);
          this.frame.src = bustedUrl;
        }
        return this.frame;
      };

      return _Class;

    })();
  });

}).call(this);
(function() {
  define('memberful/embedded/interceptor', ['memberful/embedded/config', 'memberful/embedded/utils'], function(config, utils) {
    var groupedLinks, intercept, interceptableLinks, linkHandler, typeOfUrl;
    linkHandler = function(callback) {
      return function(event) {
        utils.stop(event);
        return callback.openUrl(this.getAttribute('href'));
      };
    };
    typeOfUrl = function(url) {
      if (url.indexOf("account/downloads/get") >= 0) {
        return "get_download";
      }
      if (url.indexOf("/checkout") >= 0) {
        return "checkout";
      }
      if (url.indexOf("/orders/new") >= 0) {
        return "checkout";
      }
      if (url.indexOf("/auth/sign_out") >= 0) {
        return "sign_out";
      }
      if (url.indexOf("/auth") >= 0 || url.indexOf("/oauth") >= 0) {
        return "sign_in";
      }
      if (url.indexOf("/account") >= 0) {
        return "account";
      }
      return "custom";
    };
    groupedLinks = function(custom) {
      var anchor, anchors, groups, index, type, url, _i, _ref;
      if (custom == null) {
        custom = [];
      }
      anchors = document.links;
      groups = {};
      for (index = _i = 0, _ref = anchors.length; 0 <= _ref ? _i <= _ref : _i >= _ref; index = 0 <= _ref ? ++_i : --_i) {
        if (!(anchor = anchors.item(index))) {
          continue;
        }
        url = anchor.getAttribute('href');
        if (!(utils.isMemberfulUrl(url) || custom.indexOf(url) >= 0)) {
          continue;
        }
        type = typeOfUrl(url);
        if (groups[type] == null) {
          groups[type] = [];
        }
        groups[type].push(anchor);
      }
      return groups;
    };
    intercept = function(links, callback) {
      var link, _i, _len, _results;
      _results = [];
      for (_i = 0, _len = links.length; _i < _len; _i++) {
        link = links[_i];
        _results.push(utils.handle(link, "click", linkHandler(callback)));
      }
      return _results;
    };
    interceptableLinks = function() {
      var links;
      links = groupedLinks(config.intercept);
      delete links.sign_out;
      delete links.get_download;
      return links;
    };
    return {
      links: groupedLinks,
      interceptableLinks: interceptableLinks,
      intercept: intercept
    };
  });

}).call(this);
(function() {
  define('memberful/utils', function() {
    var domPrefixes, parseUrl, setAttributes, setCss;
    domPrefixes = ['Webkit', 'Moz', 'O', 'Khtml', ''];
    setAttributes = function(element, attributes) {
      var k, v, _results;
      if (attributes == null) {
        attributes = {};
      }
      _results = [];
      for (k in attributes) {
        v = attributes[k];
        _results.push(element.setAttribute(k, v));
      }
      return _results;
    };
    setCss = function(element, css) {
      var k, v;
      if (css == null) {
        css = {};
      }
      return element.setAttribute("style", "" + (element.getAttribute("style")) + "; " + (((function() {
        var _results;
        _results = [];
        for (k in css) {
          v = css[k];
          _results.push("" + k + ": " + v + ";");
        }
        return _results;
      })()).join(" ")));
    };
    parseUrl = function(url) {
      var a;
      a = document.createElement('a');
      a.href = url;
      return {
        hostname: a.hostname,
        query: a.search,
        path: a.pathname.replace(/^([^\/])/, '/$1'),
        queryParams: function() {
          var pair, pairs, param, params, value, _i, _len, _ref;
          if (!((a.search || "").length > 0)) {
            return;
          }
          params = {};
          pairs = a.search.substr(1).split("&");
          for (_i = 0, _len = pairs.length; _i < _len; _i++) {
            pair = pairs[_i];
            _ref = pair.split("="), param = _ref[0], value = _ref[1];
            if (param.substr(-1) === "]") {
              param = param.substr(0, param.indexOf("["));
              if (params[param] == null) {
                params[param] = [];
              }
              params[param].push(value);
            } else {
              params[param] = value;
            }
          }
          return params;
        }
      };
    };
    return {
      isMemberfulDomain: function(domain) {
        return domain.match(/memberful\.(com|dev|local)$/);
      },
      isMemberfulCheckoutUrl: function(url) {
        return (url.indexOf("/orders/new") >= 0 || url.indexOf("/checkout") >= 0) && url.indexOf("/sign_") < 0;
      },
      isWordPressSignInUrl: function(url) {
        return url.indexOf("memberful_endpoint=auth") > 0;
      },
      redirectToUrlInForeground: function(url) {
        var f, h, k, v, _ref;
        f = document.createElement("form");
        setAttributes(f, {
          action: url,
          method: "GET"
        });
        setCss(f, {
          height: 0,
          width: 0,
          margin: 0,
          padding: 0,
          border: 0
        });
        _ref = parseUrl(url).queryParams();
        for (k in _ref) {
          v = _ref[k];
          h = document.createElement("input");
          setAttributes(h, {
            type: "hidden",
            name: k,
            value: decodeURIComponent(v)
          });
          f.appendChild(h);
        }
        document.body.appendChild(f);
        return f.submit();
      },
      loadUrlInBackground: function(url) {
        var i;
        i = document.createElement("iframe");
        setAttributes(i, {
          src: url,
          frameborder: 0
        });
        setCss(i, {
          height: 0,
          width: 0,
          margin: 0,
          padding: 0,
          border: 0
        });
        return document.body.insertBefore(i, document.body.firstChild);
      },
      domPrefixes: domPrefixes,
      vendored_css: function(prop, value) {
        var css, prefix, properties, property, _i, _j, _len, _len1;
        css = {};
        properties = [prop];
        for (_i = 0, _len = domPrefixes.length; _i < _len; _i++) {
          prefix = domPrefixes[_i];
          if (prefix !== "") {
            properties.push("-" + (prefix.toLowerCase()) + "-" + prop);
          }
        }
        for (_j = 0, _len1 = properties.length; _j < _len1; _j++) {
          property = properties[_j];
          css[property] = value;
        }
        return css;
      },
      parseUrl: parseUrl,
      inFrame: function(w) {
        if (w == null) {
          w = window;
        }
        return w.top !== w.self;
      },
      appendQueryToUrl: function(url, queryStringFragment) {
        if (url.indexOf("?") > 0) {
          return "" + url + "&" + queryStringFragment;
        } else {
          return "" + url + "?" + queryStringFragment;
        }
      },
      isMobile: function(agent) {
        if (agent == null) {
          agent = navigator.userAgent || navigator.vendor || window.opera;
        }
        return /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(agent) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(agent.substr(0, 4));
      },
      isHistorySupported: function(w) {
        if (w == null) {
          w = window;
        }
        return !!(w.history && w.history.pushState);
      },
      supportsIframeCommunication: function(parent) {
        if (parent == null) {
          parent = window;
        }
        return parent.JSON && parent.postMessage;
      },
      isSafari: function(agent) {
        if (agent == null) {
          agent = navigator.userAgent || navigator.vendor || window.opera;
        }
        return /safari/i.test(agent) && !/chrome/i.test(agent) && !(!!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0);
      },
      supportsAnimations: function(documentStyle) {
        var prefix, _i, _len;
        if (documentStyle == null) {
          documentStyle = document.documentElement.style;
        }
        if (documentStyle.animationName) {
          return true;
        }
        for (_i = 0, _len = domPrefixes.length; _i < _len; _i++) {
          prefix = domPrefixes[_i];
          if (documentStyle["" + prefix + "AnimationName"] !== void 0) {
            return true;
          }
        }
        return false;
      }
    };
  });

}).call(this);
(function() {
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  define('memberful/embedded/log', function() {
    var Log, method, prefix, _i, _j, _len, _len1, _ref, _ref1;
    Log = (function() {
      function Log(context) {
        if (context == null) {
          context = "";
        }
        this._context = context;
      }

      Log.prototype.context = function(context) {
        return new Log(("" + this._context + " " + context).trim());
      };

      return Log;

    })();
    prefix = function(args, context) {
      var message, _i, _len, _results;
      if (("" + context).length === 0) {
        return args;
      }
      _results = [];
      for (_i = 0, _len = args.length; _i < _len; _i++) {
        message = args[_i];
        switch (typeof message) {
          case "string":
          case "boolean":
          case "number":
            _results.push("[" + context + "] " + message);
            break;
          default:
            _results.push(message);
        }
      }
      return _results;
    };
    _ref = ["debug", "timeStamp", "info", "error", "log"];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      method = _ref[_i];
      Log.prototype[method] = function() {
        return typeof console !== "undefined" && console !== null ? typeof console[method] === "function" ? console[method].apply(console, prefix(arguments, this._context)) : void 0 : void 0;
      };
    }
    _ref1 = ["dir", "table"];
    for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
      method = _ref1[_j];
      Log.prototype[method] = function() {
        return typeof console !== "undefined" && console !== null ? typeof console[method] === "function" ? console[method].apply(console, arguments) : void 0 : void 0;
      };
    }
    return Log;
  });

  define('memberful/embedded/fake_log', function() {
    return (function() {
      function _Class() {
        this.context = __bind(this.context, this);
      }

      _Class.prototype.context = function() {
        return this;
      };

      _Class.prototype.debug = function() {};

      _Class.prototype.info = function() {};

      _Class.prototype.timeStamp = function() {};

      _Class.prototype.log = function() {
        return typeof console !== "undefined" && console !== null ? console.log.apply(console, arguments) : void 0;
      };

      _Class.prototype.error = function() {
        return typeof console !== "undefined" && console !== null ? console.error.apply(console, arguments) : void 0;
      };

      _Class.prototype.dir = function() {};

      _Class.prototype.table = function() {};

      return _Class;

    })();
  });

  define('memberful/embedded/utils', ['memberful/utils', 'memberful/embedded/config'], function(utils, config) {
    var readyRE;
    utils.isMemberfulUrl = function(url) {
      return url.indexOf(config.site) === 0;
    };
    utils.isLocalUrl = function(url, l) {
      if (l == null) {
        l = window.location;
      }
      return url.indexOf("http://" + l.hostname) === 0 || url.indexOf("https://" + l.hostname) === 0;
    };
    utils.isSafeUrlToRedirectTo = function(url) {
      return utils.isMemberfulUrl(url) || utils.isLocalUrl(url);
    };
    utils.handle = function(element, event, handler) {
      if (element.addEventListener) {
        return element.addEventListener(event, handler, false);
      } else {
        return element.attachEvent("on" + event, handler);
      }
    };
    readyRE = /complete|loaded|interactive/;
    utils.memberfulUrl = function(path) {
      return "" + config.site + "/" + path;
    };
    utils.ready = function(funk) {
      if (readyRE.test(document.readyState) && document.body) {
        return funk();
      } else {
        return utils.handle(document, 'DOMContentLoaded', funk);
      }
    };
    utils.stop = function(event) {
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      if (event.returnValue !== void 0) {
        return event.returnValue = false;
      }
    };
    if (utils.css == null) {
      utils.css = {};
    }
    utils.css.transition = function(affecting, duration, easing) {
      var prefix;
      if (easing == null) {
        easing = "ease-in-out";
      }
      return ((function() {
        var _i, _len, _ref, _results;
        _ref = utils.domPrefixes;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          prefix = _ref[_i];
          _results.push("-" + prefix + "-transition: " + affecting + " " + duration + " " + easing);
        }
        return _results;
      })()).join(";").toLowerCase();
    };
    utils.bustUrl = function(url) {
      return utils.appendQueryToUrl(url, "now=" + ((new Date()).getTime()) + "&_source=embed");
    };
    utils.frameNeedsCookieFallbackWrapper = function(frameName) {
      return frameName !== "checkout" && utils.isSafari();
    };
    utils.browserSupportsOverlay = function() {
      return window.top === window.self && !utils.isMobile() && utils.supportsIframeCommunication() && utils.supportsAnimations();
    };
    return utils;
  });

}).call(this);
(function() {
  define('memberful/rpc', ['pmrpc'], function(pmrpc) {
    var announce, call, listen, subscribe, subscriberFanout, subscribers;
    listen = function(procedure, callback) {
      return pmrpc.register({
        publicProcedureName: procedure,
        procedure: callback
      });
    };
    call = function(frame, procedure, params, options) {
      var event, response;
      if (options == null) {
        options = {};
      }
      options.destination = frame.top != null ? frame : frame.contentWindow;
      options.publicProcedureName = procedure;
      options.params = params;
      options.timeout = 2000;
      event = "[memberful/rpc] Calling " + procedure + " on remote frame";
      if (typeof console !== "undefined" && console !== null) {
        if (typeof console.time === "function") {
          console.time(event);
        }
      }
      response = pmrpc.call(options);
      if (typeof console !== "undefined" && console !== null) {
        if (typeof console.timeEnd === "function") {
          console.timeEnd(event);
        }
      }
      return response;
    };
    subscribers = {};
    announce = function(frame, event, params, options) {
      if (params == null) {
        params = [];
      }
      if (options == null) {
        options = {};
      }
      return call(frame, "announce", [event, params], options);
    };
    subscribe = function(frame, event, callback) {
      if ((frame != null) && (frame.window == null)) {
        frame = frame.contentWindow;
      }
      if (subscribers[event] == null) {
        subscribers[event] = [];
      }
      return subscribers[event].push([callback, frame]);
    };
    subscriberFanout = function(event, params, e) {
      var callback, callbacks, frame, subscriber, _i, _len, _results;
      callbacks = subscribers[event] || [];
      if (callbacks.length === 0) {
        return;
      }
      params.push(e);
      _results = [];
      for (_i = 0, _len = callbacks.length; _i < _len; _i++) {
        subscriber = callbacks[_i];
        callback = subscriber[0], frame = subscriber[1];
        if ((frame != null) && frame !== e.source) {
          continue;
        }
        _results.push(callback.apply(null, params));
      }
      return _results;
    };
    listen("announce", subscriberFanout);
    return {
      listen: listen,
      call: call,
      announce: announce,
      subscribe: subscribe
    };
  });

}).call(this);
(function() {


}).call(this);

  var api = require('memberful/embedded/api');

  window.MemberfulEmbedded = new api();
}).call(this);






