"use strict";

const Net = require("net");
const assert = require("assert");
const optionalRequire = require("optional-require")(require);
const Promise = optionalRequire("bluebird", { message: false, default: global.Promise });
const MemcacheParser = require("memcache-parser");

/* eslint-disable no-bitwise,no-magic-numbers,max-params,no-unused-vars,max-statements,no-var */
/* eslint-disable no-console */

class MemcacheConnection extends MemcacheParser {
  constructor(client) {
    super();
    this.client = client;
    this._cmdQueue = [];
    this.ready = false;
    this._connectPromise = undefined;
    this._id = client.socketID++;
  }

  connect(server) {
    server = server.split(":");
    const host = server[0];
    const port = +server[1];

    assert(host, "Must provide server hostname");
    assert(typeof port === "number" && port > 0, "Must provide valid server port");

    this._connectPromise = new Promise((resolve) => {
      console.log("connecting to", host, port);
      const socket = Net.createConnection({ host, port }, () => {
        this.socket = socket;
        this.ready = true;
        this._connectPromise = undefined;
        console.log("connected to", host, port);
        resolve(this);
      });
      this._setupConnection(socket);
    });

    return this._connectPromise;
  }

  waitReady() {
    if (this.ready) {
      return Promise.resolve(this);
    } else {
      return this._connectPromise;
    }
  }

  queueCommand(context) {
    this._cmdQueue.unshift(context);
  }

  processCmd(cmdTokens) {
    const cmd = cmdTokens[0];

    if (cmd === "VALUE") {
      // const key = cmdTokens[1];
      // const flag = +cmdTokens[2];
      const length = +cmdTokens[3];
      this.initiatePending(cmdTokens, length);
    } else if (cmd === "STORED") {
      this._cmdQueue.pop().callback();
    } else if (cmd === "NOT_STORED") {
      this._cmdQueue.pop().callback(!this.client.options.ignoreNotStored && new Error(cmd));
    } else if (cmd === "END") {
      this._cmdQueue.pop().callback();
    } else {
      return false;
    }

    return true;
  }

  receiveResult(pending) {
    const retrieve = this._cmdQueue[this._cmdQueue.length - 1];
    retrieve.results[pending.cmdTokens[1]] = this.client._unpackValue(pending);
  }

  _setupConnection(socket) {
    socket.on("data", this.onData.bind(this));

    socket.on("end", () => {
      console.log("connection", this._id, "end");
    });

    socket.on("error", (err) => {
      console.log("connection", this._id, "socket error", err);
    });

    socket.on("close", () => {
      console.log("connection", this._id, "close");
    });
  }
}

module.exports = MemcacheConnection;
