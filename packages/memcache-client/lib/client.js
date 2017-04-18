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

  //
  // Allows you to send any abitrary data you want to the server.
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
  send(data, callback) {
    return nodeify(this._doCmd((c) => this._send(c, data)), callback);
  }

  // "set" means "store this data".
  set(key, value, options, callback) {
    return this._store("set", key, value, options, callback);
  }

  // "add" means "store this data, but only if the server *doesn't* already
  // hold data for this key".
  add(key, value, options, callback) {
    return this._store("add", key, value, options, callback);
  }

  // "replace" means "store this data, but only if the server *does*
  // already hold data for this key".
  replace(key, value, options, callback) {
    return this._store("replace", key, value, options, callback);
  }

  // "append" means "add this data to an existing key after existing data".
  append(key, value, options, callback) {
    return this._store("append", key, value, options, callback);
  }

  // "prepend" means "add this data to an existing key before existing data".
  prepend(key, value, options, callback) {
    return this._store("prepend", key, value, options, callback);
  }

  // "cas" is a check and set operation which means "store this data but
  // only if no one else has updated since I last fetched it."
  //
  // cas unique must be passed in options.casUniq
  //
  cas(key, value, options, callback) {
    return this._store("cas", key, value, options, callback);
  }

  get(key, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }

    //
    // get <key>*\r\n
    // gets <key>*\r\n
    //
    // - <key>* means one or more key strings separated by whitespace.
    //
    const promise = Array.isArray(key)
      ? this.send(`get ${key.join(" ")}\r\n`)
      : this.send(`get ${key}\r\n`).then(((r) => r[key]));

    return nodeify(promise, callback);
  }

  //
  // Internal methods
  //

  _send(conn, data) {
    const promise = new Promise((resolve, reject) => {
      const context = {
        results: {},
        callback: (err) => {
          if (err) return reject(err);
          return resolve(context.results);
        }
      };

      conn.queueCommand(context);
    });

    if (typeof data === "function") {
      data(conn.socket);
    } else {
      conn.socket.write(data);
    }

    return promise;
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

  _store(cmd, key, value, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if (options === undefined) {
      options = {};
    }

    const lifetime = options.lifetime !== undefined ? options.lifetime : (this.options.lifetime || 60);
    const packed = this._packer.pack(value, options.compress === true);
    const casUniq = options.casUniq ? ` ${options.casUniq}` : "";
    const noreply = options.noreply ? ` noreply` : "";
    const bytes = Buffer.byteLength(packed.data);

    //
    // store commands
    // <command name> <key> <flags> <exptime> <bytes> [noreply]\r\n
    //
    const _data = (socket) => {
      socket.write(`${cmd} ${key} ${packed.flag} ${lifetime} ${bytes}${casUniq}${noreply}\r\n`);
      socket.write(packed.data);
      socket.write("\r\n");
    };

    return this.send(_data, callback);
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
