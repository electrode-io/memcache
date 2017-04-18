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

  set(key, value, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if (options === undefined) {
      options = {};
    }

    const lifetime = options.lifetime !== undefined ? options.lifetime : (this.options.lifetime || 60);
    const packed = this._packer.pack(value, options.compress === true);

    //
    // store commands
    // <command name> <key> <flags> <exptime> <bytes> [noreply]\r\n
    //
    const _data = (socket) => {
      socket.write(`set ${key} ${packed.flag} ${lifetime} ${Buffer.byteLength(packed.data)}\r\n`);
      socket.write(packed.data);
      socket.write("\r\n");
    };

    return this.send(_data, callback);
  }

  get(key, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }

    const arrayKey = Array.isArray(key);
    //
    // get <key>*\r\n
    // gets <key>*\r\n
    //
    // - <key>* means one or more key strings separated by whitespace.
    //
    return nodeify(
      this.send(`get ${arrayKey ? key.join(" ") : key}\r\n`)
        .then((res) => arrayKey ? res : res[key]),
      callback);
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
