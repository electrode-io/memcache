"use strict";

const assert = require("assert");
const optionalRequire = require("optional-require")(require);
const Promise = require("bluebird");
const Zstd = optionalRequire("node-zstd", false);
const nodeify = require("./nodeify");
const ValuePacker = require("./value-packer");
const nullLogger = require("./null-logger");
const defaults = require("./defaults");
const RedundantServers = require("./redundant-servers");
const EventEmitter = require("events");

/* eslint-disable no-bitwise,no-magic-numbers,max-params,max-statements,no-var */
/* eslint max-len:[2,120] */

class MemcacheClient extends EventEmitter {
  constructor(options) {
    super();
    assert(options.server, "Must provide options.server");
    this.options = options;
    this.socketID = 1;
    this._packer = new ValuePacker(options.compressor || Zstd);
    this._logger = options.logger !== undefined ? options.logger : nullLogger;
    this.options.cmdTimeout = options.cmdTimeout || defaults.CMD_TIMEOUT_MS;
    this._servers = new RedundantServers(this, options.server);
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
  send(data, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if (options === undefined) {
      options = {};
    }

    return this._callbackSend(data, options, callback);
  }

  // the promise only version of send
  xsend(data, options) {
    return this._servers.doCmd(c => this._send(c, data, options || {}));
  }

  // a convenient method to send a single line as a command to the server
  // with \r\n appended for you automatically
  cmd(data, options, callback) {
    return this.send(
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

  // "cas" is a check and set operation which means "store this data but
  // only if no one else has updated since I last fetched it."
  //
  // cas unique must be passed in options.casUniq
  //
  cas(key, value, options, callback) {
    assert(options.casUniq, "Must provide options.casUniq for cas store command");
    return this.store("cas", key, value, options, callback);
  }

  // delete key, fire & forget with options.noreply
  delete(key, options, callback) {
    return this.cmd(`delete ${key}`, options, callback);
  }

  // incr key by value, fire & forget with options.noreply
  incr(key, value, options, callback) {
    return this.cmd(`incr ${key} ${value}`, options, callback);
  }

  // decrease key by value, fire & forget with options.noreply
  decr(key, value, options, callback) {
    return this.cmd(`decr ${key} ${value}`, options, callback);
  }

  // touch key with exp time, fire & forget with options.noreply
  touch(key, exptime, options, callback) {
    return this.cmd(`touch ${key} ${exptime}`, options, callback);
  }

  // get version of server
  version(callback) {
    return this.cmd(`version`, {}, callback);
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
    const casUniq = options.casUniq ? ` ${options.casUniq}` : "";
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

    return this._callbackSend(_data, options, callback);
  }

  get(key, options, callback) {
    return this.retrieve("get", key, options, callback);
  }

  gets(key, options, callback) {
    return this.retrieve("gets", key, options, callback);
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
    //
    // get <key>*\r\n
    // gets <key>*\r\n
    //
    // - <key>* means one or more key strings separated by whitespace.
    //
    return Array.isArray(key)
      ? this.xsend(`${cmd} ${key.join(" ")}\r\n`)
      : this.xsend(`${cmd} ${key}\r\n`).then(r => r[key]);
  }

  //
  // Internal methods
  //

  _send(conn, data, options) {
    return Promise.try(() => {
      // send data to connection
      if (typeof data === "function") {
        data(conn.socket);
      } else {
        conn.socket.write(data);
      }

      // if no reply wanted then just return
      if (options.noreply) return undefined;

      // queue up context to listen for reply
      return new Promise((resolve, reject) => {
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
    });
  }

  // internal send that expects all params passed (even if they are undefined)
  _callbackSend(data, options, callback) {
    return nodeify(this.xsend(data, options), callback);
  }

  _unpackValue(result) {
    //
    // VALUE <key> <flags> <bytes> [<cas unique>]\r\n
    //
    result.flag = +result.cmdTokens[2];
    return this._packer.unpack(result);
  }
}

module.exports = MemcacheClient;
