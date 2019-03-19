"use strict";

const Net = require("net");
const assert = require("assert");
const optionalRequire = require("optional-require")(require);
const Promise = require("bluebird");
const MemcacheParser = require("memcache-parser");
const cmdActions = require("./cmd-actions");
const defaults = require("./defaults");

/* eslint-disable no-bitwise,no-magic-numbers,max-params,no-unused-vars */
/* eslint-disable no-console,camelcase,max-statements,no-var */

const Status = {
  INIT: 1,
  CONNECTING: 2,
  READY: 3,
  SHUTDOWN: 4
};

const StatusStr = {
  [Status.INIT]: "INIT",
  [Status.CONNECTING]: "CONNECTING",
  [Status.READY]: "READY",
  [Status.SHUTDOWN]: "SHUTDOWN"
};

class MemcacheConnection extends MemcacheParser {
  constructor(client, node) {
    super(client._logger);
    this.client = client;
    this.node = node;
    this._cmdQueue = [];
    this._connectPromise = undefined;
    this._id = client.socketID++;
    this._checkCmdTimer = undefined;
    this._cmdTimeout = (client.options && client.options.cmdTimeout) || defaults.CMD_TIMEOUT_MS;
    assert(this._cmdTimeout > 0, "cmdTimeout must be > 0");
    this._cmdCheckInterval = Math.min(250, Math.ceil(this._cmdTimeout / 4));
    this._cmdCheckInterval = Math.max(50, this._cmdCheckInterval);
    this._status = Status.INIT;
  }

  waitDangleSocket(socket) {
    if (!socket) return;

    const client = this.client;
    client.emit("dangle-wait", { type: "wait", socket });

    const dangleWaitTimeout = setTimeout(() => {
      socket.removeAllListeners("error");
      socket.removeAllListeners("connect");
      socket.destroy();
      client.emit("dangle-wait", { type: "timeout" });
    }, client.options.dangleSocketWaitTimeout || defaults.DANGLE_SOCKET_WAIT_TIMEOUT);

    socket.once("error", err => {
      clearTimeout(dangleWaitTimeout);
      socket.destroy();
      client.emit("dangle-wait", { type: "error", err });
    });
  }

  connect(server) {
    server = server.split(":");
    const host = server[0];
    const port = +server[1];

    assert(host, "Must provide server hostname");
    assert(typeof port === "number" && port > 0, "Must provide valid server port");

    const socket = Net.createConnection({ host, port });
    this._connectPromise = new Promise((resolve, reject) => {
      this._status = Status.CONNECTING;

      const selfTimeout = () => {
        if (!(this.client.options.connectTimeout > 0)) return undefined;

        return setTimeout(() => {
          socket.removeAllListeners("error");
          socket.removeAllListeners("connect");

          this.client.emit("timeout", {
            socket,
            keepDangleSocket: this.client.options.keepDangleSocket
          });

          if (this.client.options.keepDangleSocket) {
            this.waitDangleSocket(socket);
            this._shutdown("connect timeout", true);
          } else {
            this._shutdown("connect timeout");
          }

          const err = new Error("connect timeout");
          err.connecting = true;
          reject(err);
        }, this.client.options.connectTimeout);
      };

      const connTimeout = selfTimeout();

      socket.once("error", err => {
        this._shutdown("connect failed");
        clearTimeout(connTimeout);
        err.connecting = true;
        reject(err);
      });

      socket.once("connect", () => {
        this.socket = socket;
        this._status = Status.READY;
        this._connectPromise = undefined;
        socket.removeAllListeners("error");
        this._setupConnection(socket);
        clearTimeout(connTimeout);
        resolve(this);
      });

      this.socket = socket;
    });

    return this._connectPromise;
  }

  isReady() {
    return this._status === Status.READY;
  }

  isConnecting() {
    return this._status === Status.CONNECTING;
  }

  isShutdown() {
    return this._status === Status.SHUTDOWN;
  }

  getStatusStr() {
    return StatusStr[this._status] || "UNKNOWN";
  }

  waitReady() {
    if (this.isConnecting()) {
      assert(this._connectPromise, "MemcacheConnection not pending connect");
      return this._connectPromise;
    } else if (this.isReady()) {
      return Promise.resolve(this);
    } else {
      throw new Error(`MemcacheConnection can't waitReady for status ${this.getStatusStr()}`);
    }
  }

  queueCommand(context) {
    context.queuedTime = Date.now();
    this._startCmdTimeout();
    this._cmdQueue.unshift(context);
  }

  dequeueCommand() {
    if (this.isShutdown()) {
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
    if (this.isReady()) {
      const retrieve = this.peekCommand();
      try {
        retrieve.results[pending.cmdTokens[1]] = {
          tokens: pending.cmdTokens,
          casUniq: pending.cmdTokens[4],
          value: this.client._unpackValue(pending)
        };
      } catch (err) {
        retrieve.error = err;
      }
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
    const msg = m => (m ? ` ${m}` : "");
    const error = new Error(`${cmdTokens[0]}${msg(cmdTokens.slice(1).join(" "))}`);
    error.cmdTokens = cmdTokens;
    this.dequeueCommand().callback(error);
  }

  cmdAction_RESULT(cmdTokens) {
    if (this.isReady()) {
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

  _shutdown(msg, keepSocket) {
    if (this.isShutdown()) {
      return;
    }
    delete this._connectPromise;
    let cmd;
    while ((cmd = this.dequeueCommand())) {
      cmd.callback(new Error(msg));
    }
    this._status = Status.SHUTDOWN;
    // reset connection
    this.node.endConnection(this);
    if (this.socket) {
      this.socket.end();
      if (!keepSocket) this.socket.destroy();
      this.socket.unref();
    }
    delete this.socket;
    delete this.client;
    delete this.node;
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
      this._checkCmdTimer = setTimeout(this._checkCmdTimeout.bind(this), this._cmdCheckInterval);
    }
  }

  _setupConnection(socket) {
    socket.on("data", this.onData.bind(this));

    socket.on("end", () => {
      this._shutdown("socket end");
    });

    socket.on("error", err => {
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

MemcacheConnection.Status = Status;

module.exports = MemcacheConnection;
