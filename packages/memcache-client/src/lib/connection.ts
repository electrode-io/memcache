import Net, { Socket } from "net";
import Tls from "tls";
import assert from "assert";
import { optionalRequire } from "optional-require";

const Promise = optionalRequire("bluebird", {
  default: global.Promise,
});
import { MemcacheNode } from "./memcache-node";
import { MemcacheParser, ParserPendingData } from "memcache-parser";
import { MemcacheClient } from "./client";
import cmdActions from "./cmd-actions";
import defaults from "./defaults";
import {
  CommandContext,
  ResolveCallback,
  RejectCallback,
  QueuedCommandContext,
  ConnectionError,
  PackedData,
} from "../types";

/* eslint-disable no-bitwise,no-magic-numbers,max-params,no-unused-vars */
/* eslint-disable no-console,camelcase,max-statements,no-var */

export const Status = {
  INIT: 1,
  CONNECTING: 2,
  READY: 3,
  SHUTDOWN: 4,
};

const StatusStr = {
  [Status.INIT]: "INIT",
  [Status.CONNECTING]: "CONNECTING",
  [Status.READY]: "READY",
  [Status.SHUTDOWN]: "SHUTDOWN",
};

type QueueError = Error & { cmdTokens?: string[] };

type ConnectingPromise = Promise<unknown | void>;

export type DangleWaitResponse = {
  type: string;
  socket?: Socket;
  err?: Error;
};
export class MemcacheConnection extends MemcacheParser {
  node;
  client?: MemcacheClient;
  socket: Socket | undefined;
  _cmdQueue: Array<QueuedCommandContext>;
  _id;
  _cmdTimeout;
  _connectPromise: ConnectingPromise | undefined | string;
  _status;
  _reset = false;
  private _checkCmdTimer: ReturnType<typeof setTimeout> | undefined;
  private _cmdCheckInterval;

  // TODO: still don't know which type client is
  constructor(client: MemcacheClient, node?: MemcacheNode) {
    super(client._logger);
    this.client = client;
    this.node = node;
    this.socket = undefined;
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

  waitDangleSocket(socket?: Socket): void {
    if (!socket) return;

    const client = this.client;
    client?.emit("dangle-wait", { type: "wait", socket });

    const dangleWaitTimeout = setTimeout(() => {
      socket.removeAllListeners("error");
      socket.removeAllListeners("connect");
      socket.destroy();
      client?.emit("dangle-wait", { type: "timeout" });
    }, client?.options.dangleSocketWaitTimeout || defaults.DANGLE_SOCKET_WAIT_TIMEOUT);

    socket.once("error", (err) => {
      clearTimeout(dangleWaitTimeout);
      socket.destroy();
      client?.emit("dangle-wait", { type: "error", err });
    });
  }

  connect(server: string): Promise<MemcacheConnection> {
    const serverStringArray = server.split(":");
    const host = serverStringArray[0];
    const port = +serverStringArray[1];

    assert(host, "Must provide server hostname");
    assert(typeof port === "number" && port > 0, "Must provide valid server port");

    let socket: Net.Socket | Tls.TLSSocket;
    if (this.client?.options?.tls !== undefined) {
      // Create a TLS connection
      socket = Tls.connect({
          host: host,
          port: port,
          ...this.client.options.tls
        });
    } else {
      // Create a regular TCP connection
      socket = Net.createConnection({ host, port });
    }
    this._connectPromise = new Promise((resolve: ResolveCallback, reject: RejectCallback) => {
      this._status = Status.CONNECTING;

      const selfTimeout = () => {
        if (!((this.client?.options?.connectTimeout ?? 0) > 0)) return undefined;

        return setTimeout(() => {
          socket.removeAllListeners("error");
          socket.removeAllListeners("connect");

          this.client?.emit("timeout", {
            socket,
            keepDangleSocket: this.client.options.keepDangleSocket,
          });

          if (this.client?.options.keepDangleSocket) {
            this.waitDangleSocket(socket);
            this._shutdown("connect timeout", true);
          } else {
            this._shutdown("connect timeout");
          }

          const err: ConnectionError = new Error("connect timeout");
          err.connecting = true;
          reject(err);
        }, this.client?.options.connectTimeout);
      };

      const connTimeout = selfTimeout();

      socket.once("error", (err: ConnectionError) => {
        this._shutdown("connect failed");
        if (connTimeout) {
          clearTimeout(connTimeout);
        }
        err.connecting = true;
        reject(err);
      });

      socket.once("connect", () => {
        this.socket = socket;
        this._status = Status.READY;
        this._connectPromise = undefined;
        socket.removeAllListeners("error");
        this._setupConnection(socket);
        if (connTimeout) {
          clearTimeout(connTimeout);
        }
        resolve(this);
      });

      this.socket = socket;
    });

    return this._connectPromise as Promise<MemcacheConnection>;
  }

  isReady(): boolean {
    return this._status === Status.READY;
  }

  isConnecting(): boolean {
    return this._status === Status.CONNECTING;
  }

  isShutdown(): boolean {
    return this._status === Status.SHUTDOWN;
  }

  getStatusStr(): string {
    return StatusStr[this._status] || "UNKNOWN";
  }

  waitReady(): ConnectingPromise {
    if (this.isConnecting()) {
      assert(this._connectPromise, "MemcacheConnection not pending connect");
      return this._connectPromise as ConnectingPromise;
    } else if (this.isReady()) {
      return Promise.resolve(this);
    } else {
      throw new Error(`MemcacheConnection can't waitReady for status ${this.getStatusStr()}`);
    }
  }

  queueCommand(context: CommandContext): void {
    (context as QueuedCommandContext).queuedTime = Date.now();
    this._startCmdTimeout();
    this._cmdQueue.unshift(context as QueuedCommandContext);
  }

  dequeueCommand(): QueuedCommandContext | undefined {
    if (this.isShutdown()) {
      return { callback: () => undefined } as unknown as QueuedCommandContext;
    }
    return this._cmdQueue.pop();
  }

  peekCommand(): QueuedCommandContext {
    return this._cmdQueue[this._cmdQueue.length - 1];
  }

  processCmd(cmdTokens: string[]): number {
    const action = cmdActions[cmdTokens[0]];
    return (this as any)[`cmdAction_${action}` as keyof MemcacheConnection](cmdTokens);
  }

  receiveResult(pending: ParserPendingData): void {
    if (this.isReady()) {
      const retrieve = this.peekCommand();
      try {
        retrieve.results[pending.cmdTokens[1]] = {
          tokens: pending.cmdTokens,
          casUniq: pending.cmdTokens[4],
          value: this.client?._unpackValue(pending as unknown as PackedData),
        };
      } catch (err) {
        retrieve.error = err as Error;
      }
    }
    delete pending.data;
  }

  shutdown(): void {
    this._shutdown("Shutdown requested");
  }

  //
  // Internal methods
  //

  cmdAction_OK(cmdTokens: string[]): void {
    this.dequeueCommand()?.callback(null, cmdTokens);
  }

  cmdAction_ERROR(cmdTokens: string[]): void {
    const msg = (m: string) => (m ? ` ${m}` : "");
    const error: QueueError = new Error(`${cmdTokens[0]}${msg(cmdTokens.slice(1).join(" "))}`);
    error.cmdTokens = cmdTokens;
    this.dequeueCommand()?.callback(error);
  }

  cmdAction_RESULT(cmdTokens?: string[]): void {
    if (this.isReady() && cmdTokens) {
      const retrieve = this.peekCommand();
      const cmd = cmdTokens[0];
      const results = retrieve.results;
      if (!results[cmd]) {
        (results[cmd] as string[][]) = [];
      }
      (results[cmd] as string[][]).push(cmdTokens.slice(1));
    }
  }

  cmdAction_SINGLE_RESULT(cmdTokens: string[]): void {
    this.cmdAction_OK(cmdTokens);
  }

  cmdAction_SELF(cmdTokens: string[]): number | void {
    (this as any)[`cmd_${cmdTokens[0]}` as keyof MemcacheConnection](cmdTokens);
  }

  cmdAction_undefined(cmdTokens: string[]): boolean {
    // incr/decr response
    // - <value>\r\n , where <value> is the new value of the item's data,
    //   after the increment/decrement operation was carried out.
    if (cmdTokens.length === 1 && cmdTokens[0].match(/[+-]?[0-9]+/)) {
      this.dequeueCommand()?.callback(null, cmdTokens[0]);
      return true;
    } else {
      console.log("No command action defined for", cmdTokens);
    }
    return false;
  }

  cmd_VALUE(cmdTokens: string[]): void {
    this.initiatePending(cmdTokens, +cmdTokens[3]);
  }

  // eslint-disable-next-line
  cmd_END(cmdTokens: string[]): void {
    this.dequeueCommand()?.callback();
  }

  _shutdown(msg: string, keepSocket?: boolean): void {
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
    this.node?.endConnection(this);
    if (this.socket) {
      this.socket.end();
      if (!keepSocket) this.socket.destroy();
      this.socket.unref();
    }
    delete this.socket;
    delete this.client;
    delete this.node;
  }

  _checkCmdTimeout(): void {
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

  _startCmdTimeout(): void {
    if (!this._checkCmdTimer) {
      this._checkCmdTimer = setTimeout(this._checkCmdTimeout.bind(this), this._cmdCheckInterval);
    }
  }

  _setupConnection(socket: Socket): void {
    if (this.client?.options?.noDelay) {
      socket.setNoDelay(true);
    }

    socket.on("data", this.onData.bind(this));

    socket.on("end", () => {
      this._shutdown("socket end");
    });

    socket.on("error", (err: Error) => {
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

(MemcacheConnection as unknown as Record<string, Record<string, number>>).Status = Status;
