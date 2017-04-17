"use strict";

const assert = require("assert");
const optionalRequire = require("optional-require")(require);
const Promise = optionalRequire("bluebird", { message: false, default: global.Promise });
const Zstd = optionalRequire("node-zstd", false);
const MemcacheConnection = require("./connection");
const nodeify = require("./nodeify");
const ValuePacker = require("./value-packer");

/* eslint-disable no-bitwise,no-magic-numbers,max-params,max-statements,no-var */
/* eslint max-len:[2,120] */

class MemcacheClient {
  constructor(options) {
    assert(options.server, "Must provide options.server");
    this.options = options;
    this.socketID = 1;
    this._packer = new ValuePacker(options.compressor || Zstd);
  }

  _set(conn, key, value, options) {
    const promise = new Promise((resolve, reject) => {
      const store = {
        cmd: "set",
        key,
        callback: (err) => (err ? reject(err) : resolve())
      };

      conn._storeQueue.unshift(store);
    });

    //
    // store commands
    // <command name> <key> <flags> <exptime> <bytes> [noreply]\r\n
    //
    const lifetime = options.lifetime !== undefined ? options.lifetime : (this.options.lifetime || 60);
    const socket = conn.socket;
    const packed = this._packer.pack(value, options.compress === true);

    socket.write(`set ${key} ${packed.flag} ${lifetime} ${Buffer.byteLength(packed.data)}\r\n`);
    socket.write(packed.data);
    socket.write("\r\n");

    return promise;
  }

  set(key, value, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if (options === undefined) {
      options = {};
    }

    const _set = (c) => this._set(c, key, value, options);

    return nodeify(this._doCmd(_set), callback);
  }

  _get(conn, key) {
    const promise = new Promise((resolve, reject) => {
      const retrieve = {
        key,
        results: {},
        callback: (err) => {
          if (err) { return reject(err); }
          const res = retrieve.results;
          return resolve(Array.isArray(key) ? key.map((k) => res[k]) : res[key]);
        }
      };

      conn._retrieveQueue.unshift(retrieve);
    });

    //
    // get <key>*\r\n
    // gets <key>*\r\n
    //
    // - <key>* means one or more key strings separated by whitespace.
    //

    conn.socket.write(`get ${Array.isArray(key) ? key.join(" ") : key}\r\n`);

    return promise;
  }

  get(key, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }

    const _get = (c) => this._get(c, key);

    return nodeify(this._doCmd(_get), callback);
  }

  _doCmd(action) {
    if (this.connection === undefined) {
      return this._connect(this.options.server).then(action);
    } else if (this.connection.ready === false) {
      return this.connection.waitReady().then(action);
    } else {
      return action(this.connection);
    }
  }

  _connect(server) {
    if (this.connection === undefined) {
      this.connection = new MemcacheConnection(this);
      return this.connection.connect(server);
    } else {
      return Promise.resolve(this.connection);
    }
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
