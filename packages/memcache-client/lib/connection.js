"use strict";

const Net = require("net");
const assert = require("assert");
const optionalRequire = require("optional-require")(require);
const Promise = optionalRequire("bluebird", { message: false, default: global.Promise });
const MemcacheParser = require("memcache-parser");
const cmdActions = require("./cmd-actions");

/* eslint-disable no-bitwise,no-magic-numbers,max-params,no-unused-vars */
/* eslint-disable no-console,camelcase,max-statements,no-var */

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

  cmdAction_OK(cmdTokens) {
    this._cmdQueue.pop().callback(null, cmdTokens);
  }

  cmdAction_ERROR(cmdTokens) {
    const msg = (m) => (m ? ` ${m}` : "");
    const error = new Error(`${cmdTokens[0]}${msg(cmdTokens.slice(1).join(" "))}`);
    error.cmdTokens = cmdTokens;
    this._cmdQueue.pop().callback(error);
  }

  cmdAction_RESULT(cmdTokens) {
    const retrieve = this._cmdQueue[this._cmdQueue.length - 1];
    const cmd = cmdTokens[0];
    if (!retrieve[cmd]) {
      retrieve[cmd] = [];
    }
    retrieve[cmd].push(cmdTokens.slice(1));
  }

  cmdAction_SINGLE_RESULT(cmdTokens) {
    this.cmdAction_OK(cmdTokens);
  }

  cmdAction_SELF(cmdTokens) {
    this[`cmd_${cmdTokens[0]}`](cmdTokens);
  }

  cmdAction_UNKNOWN(cmdTokens) {
    // incr/decr response
    // - <value>\r\n , where <value> is the new value of the item's data,
    //   after the increment/decrement operation was carried out.
    if (cmdTokens.length === 1 && cmdTokens[0].match(/[+-]?[0-9]+/)) {
      this._cmdQueue.pop().callback(null, cmdTokens[0]);
      return true;
    } else {
      console.log("No command action defined for", cmdTokens);
    }
    return false;
  }

  cmd_VALUE(cmdTokens) {
    this.initiatePending(cmdTokens, +cmdTokens[3]);
  }

  cmd_END(cmdTokens) {
    this._cmdQueue.pop().callback();
  }

  processCmd(cmdTokens) {
    const action = cmdActions[cmdTokens[0]];

    if (action === undefined) {
      return this.cmdAction_UNKNOWN(cmdTokens);
    } else {
      this[`cmdAction_${action}`](cmdTokens);
    }

    return true;
  }

  receiveResult(pending) {
    const retrieve = this._cmdQueue[this._cmdQueue.length - 1];
    retrieve.results[pending.cmdTokens[1]] = {
      tokens: pending.cmdTokens,
      casUniq: pending.cmdTokens[4],
      value: this.client._unpackValue(pending)
    };
    delete pending.data;
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
