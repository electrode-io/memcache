"use strict";

const optionalRequire = require("optional-require")(require);
const Promise = optionalRequire("bluebird", { message: false, default: global.Promise });
const Zstd = optionalRequire("node-zstd", false);
const nodeify = require("./nodeify");
const ValuePacker = require("./value-packer");
const nullLogger = require("./null-logger");
const defaults = require("./defaults");
const ConsistentHashRingServers = require("./consistent-hashring-servers.js");
const EventEmitter = require("events");

/* eslint-disable no-bitwise,no-magic-numbers,max-params,max-statements,no-var */
/* eslint max-len:[2,120] */

class ConsistentHashRingClient extends EventEmitter {
  constructor(server, options) {
    super();
    if (!options) {
      options = {};
    }
    this.options = options;
    this.socketID = 1;
    this._packer = new ValuePacker(options.compressor || Zstd);
    this._logger = options.logger !== undefined ? options.logger : nullLogger;
    this.options.cmdTimeout = options.cmdTimeout || defaults.CMD_TIMEOUT_MS;
    this._servers = new ConsistentHashRingServers(this, server, options);
    this.Promise = options.Promise || Promise;
  }

  shutdown() {
    this._servers.shutdown();
  }

  //
  // Allows you to send any arbitrary data you want to the server.
  // You are responsible for making sure the data contains properly
  // formed memcached ASCII protocol commands and data.
  // Any responses from the server will be parsed by the client
  // and returned as best as it could.
  //
  // If data is a function, then it will be called with socket which you can
  // use to write any data you want else it will be passed to socket.write.
  //
  // DO NOT send multiple commands in a single call.  Bad things will happen.
  //
  // Set options.noreply if you want to fire and forget.  Note that this
  // doesn't apply if you send a command like get/gets/stats, which don't
  // have the noreply option.
  //
  send(key, data, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if (options === undefined) {
      options = {};
    }

    return this._callbackSend(key, data, options, callback);
  }

  // the promise only version of send
  xsend(key, data, options) {
    return this._servers.doCmd(key, c => this._send(c, data, options || {}));
  }

  // a convenient method to send a single line as a command to the server
  // with \r\n appended for you automatically
  cmd(key, data, options, callback) {
    return this.send(
      key,
      socket => {
        socket.write(data);
        if (options && options.noreply) {
          socket.write(" noreply\r\n");
        } else {
          socket.write("\r\n");
        }
      },
      options,
      callback
    );
  }

  // "set" means "store this data".
  set(key, value, options, callback) {
    options = options || {};
    if (options.ignoreNotStored === undefined) {
      options.ignoreNotStored = this.options.ignoreNotStored;
    }
    return this.store("set", key, value, options, callback);
  }

  // "add" means "store this data, but only if the server *doesn't* already
  // hold data for this key".
  add(key, value, options, callback) {
    return this.store("add", key, value, options, callback);
  }

  // "replace" means "store this data, but only if the server *does*
  // already hold data for this key".
  replace(key, value, options, callback) {
    return this.store("replace", key, value, options, callback);
  }

  // "append" means "add this data to an existing key after existing data".
  append(key, value, options, callback) {
    return this.store("append", key, value, options, callback);
  }

  // "prepend" means "add this data to an existing key before existing data".
  prepend(key, value, options, callback) {
    return this.store("prepend", key, value, options, callback);
  }

  // delete key, fire & forget with options.noreply
  delete(key, options, callback) {
    return this.cmd(key, `delete ${key}`, options, callback);
  }

  // incr key by value, fire & forget with options.noreply
  incr(key, value, options, callback) {
    return this.cmd(key, `incr ${key} ${value}`, options, callback);
  }

  // decrease key by value, fire & forget with options.noreply
  decr(key, value, options, callback) {
    return this.cmd(key, `decr ${key} ${value}`, options, callback);
  }

  // touch key with exp time, fire & forget with options.noreply
  touch(key, exptime, options, callback) {
    return this.cmd(key, `touch ${key} ${exptime}`, options, callback);
  }

  // get version of server
  version(callback) {
    return this.cmd("", `version`, {}, callback);
  }

  // a generic API for issuing one of the store commands
  store(cmd, key, value, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if (options === undefined) {
      options = {};
    }

    const lifetime =
      options.lifetime !== undefined ? options.lifetime : this.options.lifetime || 60;
    const casUniq = "";
    const noreply = options.noreply ? ` noreply` : "";

    //
    // store commands
    // <command name> <key> <flags> <exptime> <bytes> [noreply]\r\n
    //
    const _data = socket => {
      const packed = this._packer.pack(value, options.compress === true);
      const bytes = Buffer.byteLength(packed.data);
      const msg = `${cmd} ${key} ${packed.flag} ${lifetime} ${bytes}${casUniq}${noreply}\r\n`;
      socket.write(msg);
      socket.write(packed.data);
      socket.write("\r\n");
    };

    return this._callbackSend(key, _data, options, callback);
  }

  get(key, options, callback) {
    return this.retrieve("get", key, options, callback);
  }

  // A generic API for issuing get or gets command
  retrieve(cmd, key, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    return nodeify(this.xretrieve(cmd, key, options), callback);
  }

  // the promise only version of retrieve
  xretrieve(cmd, key) {
    return this.xsend(key, `${cmd} ${key}\r\n`).then(r => r[key]);
  }

  //
  // Internal methods
  //

  _send(conn, data, options) {
    try {
      // send data to connection
      if (typeof data === "function") {
        data(conn.socket);
      } else {
        conn.socket.write(data);
      }

      // if no reply wanted then just return
      if (options.noreply) {
        return this.Promise.resolve();
      }

      // queue up context to listen for reply
      return new this.Promise((resolve, reject) => {
        const context = {
          error: null,
          results: {},
          callback: (err, result) => {
            if (err) {
              if (options.ignoreNotStored === true && err.message === "NOT_STORED") {
                return resolve("ignore NOT_STORED");
              }
              return reject(err);
            }
            if (result) {
              return resolve(result);
            } else if (context.error) {
              return reject(context.error);
            } else {
              return resolve(context.results);
            }
          }
        };

        conn.queueCommand(context);
      });
    } catch (err) {
      return this.Promise.reject(err);
    }
  }

  // internal send that expects all params passed (even if they are undefined)
  _callbackSend(key, data, options, callback) {
    return nodeify(this.xsend(key, data, options), callback);
  }

  _unpackValue(result) {
    //
    // VALUE <key> <flags> <bytes> [<cas unique>]\r\n
    //
    result.flag = +result.cmdTokens[2];
    return this._packer.unpack(result);
  }
}

module.exports = ConsistentHashRingClient;
