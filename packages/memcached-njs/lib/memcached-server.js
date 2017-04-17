"use strict";

/* eslint-disable no-console,no-magic-numbers,no-var */

const Net = require("net");
const MemcacheParser = require("memcache-parser");
const Promise = require("bluebird");

// https://github.com/memcached/memcached/blob/master/doc/protocol.txt

/*
 * Storage commands (there are six: "set", "add", "replace", "append"
 * "prepend" and "cas")
 * Retrieval commands (there are two: "get" and "gets")
 *
 * The command "delete" allows for explicit deletion of items:
 *
 * delete <key> [noreply]\r\n
 *
 * Commands "incr" and "decr" are used to change data for some item
 * in-place, incrementing or decrementing it.
 *
 * incr <key> <value> [noreply]\r\n
 * decr <key> <value> [noreply]\r\n
 *
 * - <key> is the key of the item the client wishes to change
 *
 * - <value> is the amount by which the client wants to increase/decrease
 * the item. It is a decimal representation of a 64-bit unsigned integer.
 *
 * - "noreply" optional parameter instructs the server to not send the
 * reply.  See the note in Storage commands regarding malformed
 * requests.
 *
 * touch <key> <exptime> [noreply]\r\n
*/

// const commands = [
//   // storage
//   "set", "add", "replace", "append", "prepend", "prepend", "cas",
//   // retrieval
//   "get", "gets",
//   //
//   "delete",
//   "incr", "decr",
//   "touch",
//   "slabs",
//   "lru",
//   "lru_crawler",
//   "STAT",
//   "watch",
//   "flush_all",
//   "version",
//   "quit"
// ];

class Connection extends MemcacheParser {
  constructor(server, socket) {
    super();
    this.server = server;
    this.socket = socket;
    this._id = server.getNewClientID();

    socket.on("data", this.onData.bind(this));

    socket.on("end", () => {
      console.log("connection", this._id, "end");
      this.server.end(this);
    });
  }

  processCmd(cmdTokens) {
    const socket = this.socket;
    const cmd = cmdTokens[0];
    if (cmd === "set") {
      const length = +cmdTokens[4];
      this.initiatePending(cmdTokens, length);
      /* istanbul ignore next */
    } else if (cmd === "get" || cmd === "gets") {
      this.server.get(cmdTokens, this);
    } else {
      socket.end("CLIENT_ERROR malformed request\r\n");
      return false;
    }
    return true;
  }

  receiveResult(pending) {
    /* istanbul ignore next */
    if (pending.cmd === "set") {
      this.server.set(pending, this);
    }
  }
}

class MemcacheServer {
  constructor(options) {
    this.clientID = 1;
    this._cache = new Map();
    this._clients = new Map();
    this.options = options;
  }

  startup() {
    const server = Net.createServer();
    server.on("connection", this.newConnection.bind(this));
    this._server = server;
    return new Promise((resolve, reject) => {
      server.once("error", (err) => {
        server.close();
        reject(err);
      });

      server.listen(this.options.port, () => {
        console.log("server listening at port", server.address().port);
        server.removeAllListeners("error");
        server.on("error", this._onError.bind(this));
        resolve(this);
      });
    });
  }

  _onError(err) {
    console.log("server error", err);
  }

  getNewClientID() {
    return this.clientID++;
  }

  newConnection(socket) {
    const connection = new Connection(this, socket);
    this._clients.set(connection._id, { connection });
  }

  get(cmdTokens, connection) {
    const cache = this._cache;
    const socket = connection.socket;
    const _get = (key) => {
      if (cache.has(key)) {
        const e = cache.get(key);
        const msg = `VALUE ${key} ${e.flag} ${e.data.length}\r\n`;
        e.lastFetchId = connection._id;
        console.log("returning", msg);
        socket.write(msg);
        socket.write(e.data);
        socket.write("\r\n");
      } else {
        console.log("get", key, "not found");
      }
    };
    var i;
    for (i = 1; i < cmdTokens.length; i++) {
      _get(cmdTokens[i]);
    }
    socket.write("END\r\n");
  }

  set(pending, connection) {
    console.log("writing STORED response");
    this._cache.set(pending.cmdTokens[1], {
      flag: pending.cmdTokens[2],
      data: pending.data,
      lifetime: +pending.cmdTokens[3]
    });
    connection.socket.write("STORED\r\n");
  }

  end(connection) {
    this._clients.delete(connection._id);
  }

  shutdown() {
    this._server.close();
    console.log("server shutdown");
  }
}

module.exports = MemcacheServer;
