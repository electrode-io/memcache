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
    super(client._logger);
    this.client = client;
    this._cmdQueue = [];
    this.ready = false;
    this._connectPromise = undefined;
    this._id = client.socketID++;
    this._checkCmdTimer = undefined;
    this._cmdTimeout = 1000;
    this._reset = false;
  }

  connect(server) {
    server = server.split(":");
    const host = server[0];
    const port = +server[1];

    assert(host, "Must provide server hostname");
    assert(typeof port === "number" && port > 0, "Must provide valid server port");

    console.log("connecting to", host, port);
    const socket = Net.createConnection({ host, port });
    this._connectPromise = new Promise((resolve, reject) => {
      socket.once("error", (err) => {
        this._reset = true;
        reject(err);
      });

      socket.once("connect", () => {
        this.socket = socket;
        this.ready = true;
        this._connectPromise = undefined;
        console.log("connected to", host, port);
        socket.removeAllListeners("error");
        this._setupConnection(socket);
        resolve(this);
      });
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
    context.queuedTime = Date.now();
    this._startCmdTimeout();
    this._cmdQueue.unshift(context);
  }

  dequeueCommand() {
    if (this._reset) {
      return { callback: () => undefined };
    }
    return this._cmdQueue.pop();
  }

  peekCommand() {
    return this._cmdQueue[this._cmdQueue.length - 1];
  }

  processCmd(cmdTokens) {
    const action = cmdActions[cmdTokens[0]];
    return this[`cmdAction_${action}`](cmdTokens);
  }

  receiveResult(pending) {
    if (!this._reset) {
      const retrieve = this.peekCommand();
      retrieve.results[pending.cmdTokens[1]] = {
        tokens: pending.cmdTokens,
        casUniq: pending.cmdTokens[4],
        value: this.client._unpackValue(pending)
      };
    }
    delete pending.data;
  }

  shutdown() {
    this._shutdown("Shutdown requested");
  }

  //
  // Internal methods
  //

  cmdAction_OK(cmdTokens) {
    this.dequeueCommand().callback(null, cmdTokens);
  }

  cmdAction_ERROR(cmdTokens) {
    const msg = (m) => (m ? ` ${m}` : "");
    const error = new Error(`${cmdTokens[0]}${msg(cmdTokens.slice(1).join(" "))}`);
    error.cmdTokens = cmdTokens;
    this.dequeueCommand().callback(error);
  }

  cmdAction_RESULT(cmdTokens) {
    if (!this._reset) {
      const retrieve = this.peekCommand();
      const cmd = cmdTokens[0];
      const results = retrieve.results;
      if (!results[cmd]) {
        results[cmd] = [];
      }
      results[cmd].push(cmdTokens.slice(1));
    }
  }

  cmdAction_SINGLE_RESULT(cmdTokens) {
    this.cmdAction_OK(cmdTokens);
  }

  cmdAction_SELF(cmdTokens) {
    this[`cmd_${cmdTokens[0]}`](cmdTokens);
  }

  cmdAction_undefined(cmdTokens) {
    // incr/decr response
    // - <value>\r\n , where <value> is the new value of the item's data,
    //   after the increment/decrement operation was carried out.
    if (cmdTokens.length === 1 && cmdTokens[0].match(/[+-]?[0-9]+/)) {
      this.dequeueCommand().callback(null, cmdTokens[0]);
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
    this.dequeueCommand().callback();
  }

  _shutdown(msg) {
    if (this._reset) {
      return;
    }
    let cmd;
    while ((cmd = this.dequeueCommand())) {
      cmd.callback(new Error(msg));
    }
    // reset connection
    this.client.endConnection(this);
    if (this.socket) {
      this.socket.end();
      this.socket.unref();
    }
    this._reset = true;
    delete this.socket;
    delete this.client;
  }

  _checkCmdTimeout() {
    this._checkCmdTimer = undefined;

    if (this._cmdQueue.length > 0) {
      const cmd = this.peekCommand();
      const now = Date.now();
      if (now - cmd.queuedTime > this._cmdTimeout) {
        this._shutdown("Command timeout");
      } else {
        this._startCmdTimeout();
      }
    }
  }

  _startCmdTimeout() {
    if (!this._checkCmdTimer) {
      this._checkCmdTimer = setTimeout(this._checkCmdTimeout.bind(this), 250);
    }
  }

  _setupConnection(socket) {
    socket.on("data", this.onData.bind(this));

    socket.on("end", () => {
      this._shutdown("socket end");
    });

    socket.on("error", (err) => {
      this._shutdown(`socket error ${err.message}`);
    });

    socket.on("close", () => {
      this._shutdown("socket close");
    });

    socket.on("timeout", () => {
      this._shutdown("socket timeout");
    });
  }
}

module.exports = MemcacheConnection;
