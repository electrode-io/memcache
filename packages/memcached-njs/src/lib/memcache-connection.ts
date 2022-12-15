import { Socket } from "net";
import { DefaultLogger } from "../types";
import { MemcachedServer } from "./memcached-server";
import { MemcacheParser, ParserPendingData } from "memcache-parser";

const storeCommands = ["set", "add", "replace", "append", "prepend", "cas"];

export default class MemcacheConnection extends MemcacheParser {
  private _id: number;
  private _dataQueue: Buffer[];
  private _isPaused: boolean;

  server: MemcachedServer;
  logger: DefaultLogger;
  socket: Socket;

  constructor(server: MemcachedServer, socket: Socket) {
    super();
    this.server = server;
    this.logger = server.logger;
    this.socket = socket;
    this._id = server.getNewClientID();
    this._dataQueue = [];
    this._isPaused = false;

    socket.on("data", (data) => {
      if (this._isPaused) {
        this.logger.info("server paused, queueing data");
        this._dataQueue.unshift(data);
      } else {
        this.onData(data);
      }
    });

    socket.on("end", () => {
      this.logger.info("connection", `${this._id} end`);
      this.server.end(this);
    });
  }

  getId(): number {
    return this._id;
  }

  processCmd(cmdTokens: string[]): number {
    const socket = this.socket;
    const cmd = cmdTokens[0];
    if (storeCommands.indexOf(cmd) >= 0) {
      const length = +cmdTokens[4];
      this.initiatePending(cmdTokens, length);
    } else {
      const x = (this.server as any)[`cmd_${cmd}`];
      if (x) {
        x.call(this.server, cmdTokens, this);
      } else {
        socket.end("CLIENT_ERROR malformed request\r\n");
        return 0;
      }
    }
    return 1;
  }

  pause(): void {
    this._isPaused = true;
  }

  unpause(): void {
    if (this._isPaused) {
      this._isPaused = false;
      let data;
      while ((data = this._dataQueue.pop())) {
        this.onData(data);
      }
    }
  }

  receiveResult(pending: ParserPendingData): void {
    (this.server as any)[`cmd_${(pending as any).cmd}`](pending, this);
  }

  send(data: string | Buffer): void {
    this.socket.write(data);
  }

  close(): void {
    this.socket.destroy();
  }
}
