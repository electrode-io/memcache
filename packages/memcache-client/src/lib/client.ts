import assert from "assert";
import { optionalRequire } from "optional-require";
import { Socket } from "net";

const Promise = optionalRequire("bluebird", {
  default: global.Promise,
});
const Zstd = optionalRequire("zstd.ts");

import nodeify from "./nodeify";
import ValuePacker from "./value-packer";
import nullLogger from "./null-logger";
import defaults from "./defaults";
import RedundantServers from "./redundant-servers";
import EventEmitter from "events";
import {
  MemcacheClientOptions,
  ResolveCallback,
  RejectCallback,
  ErrorFirstCallback,
  CommandContext,
  SingleServerEntry,
  PackedData,
  CompressorLibrary,
} from "../types";
import { MemcacheConnection } from "./connection";
import { DefaultLogger } from "memcache-parser";

type StoreParams = string | number | Buffer | Record<string, unknown>;

type CommonCommandOption = Readonly<{ noreply?: boolean }>;

type StoreCommandOptions = CommonCommandOption & { ignoreNotStored?: boolean } & Readonly<{
    lifetime?: number;
    compress?: boolean;
  }>;

type CasCommandOptions = CommonCommandOption &
  StoreCommandOptions &
  Readonly<{ casUniq: number | string }>;

type SocketCallback = (socket?: Socket) => void;

/* eslint-disable no-bitwise,no-magic-numbers,max-params,max-statements,no-var */
/* eslint max-len:[2,120] */
type OperationCallback<Error, Data> = (error?: Error | null, data?: Data) => void;
export type RetrievalCommandResponse<ValueType> = {
  tokens: string[];
  casUniq?: number | string;
  value: ValueType;
};

export type CasRetrievalCommandResponse<Type> = RetrievalCommandResponse<Type> & {
  casUniq: string | number;
};
export type StatsCommandResponse = Record<"STAT", Array<Array<string>>>;

export type MultiRetrievalResponse<ValueType = unknown> = Record<
  string,
  RetrievalCommandResponse<ValueType>
>;

export type MultiCasRetrievalResponse<ValueType = unknown> = Record<
  string,
  CasRetrievalCommandResponse<ValueType>
>;

type MultiCasRetrieval<ValueType> = ValueType extends MultiCasRetrievalResponse
  ? ValueType
  : CasRetrievalCommandResponse<ValueType>;

type MultiRetrieval<ValueType> = ValueType extends MultiRetrievalResponse
  ? ValueType
  : RetrievalCommandResponse<ValueType>;

export class MemcacheClient extends EventEmitter {
  options: MemcacheClientOptions;
  socketID: number;
  _logger: DefaultLogger;
  _servers: RedundantServers;
  private _packer: ValuePacker;
  private Promise: PromiseConstructor; // Promise definition seems complicated

  constructor(options: MemcacheClientOptions) {
    super();
    assert(options.server, "Must provide options.server");
    this.options = options;
    this.socketID = 1;
    this._packer = new ValuePacker(options.compressor || (Zstd as CompressorLibrary));
    this._logger = options.logger !== undefined ? options.logger : nullLogger;
    this.options.cmdTimeout = options.cmdTimeout || defaults.CMD_TIMEOUT_MS;
    this._servers = new RedundantServers(this, options.server as unknown as SingleServerEntry);
    this.Promise = options.Promise || Promise;
  }

  shutdown(): void {
    this._servers.shutdown();
  }

  //
  // Allows you to send any arbitrary data you want to the server.
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
  // Set options.noreply if you want to fire and forget.  Note that this
  // doesn't apply if you send a command like get/gets/stats, which don't
  // have the noreply option.
  //
  send<ValueType>(
    data: StoreParams | SocketCallback,
    options?: CommonCommandOption | ErrorFirstCallback,
    callback?: ErrorFirstCallback
  ): Promise<ValueType> {
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if (options === undefined) {
      options = {};
    }

    return this._callbackSend(data, options, callback) as unknown as Promise<ValueType>;
  }

  // the promise only version of send
  xsend(data: StoreParams | SocketCallback, options?: StoreCommandOptions): Promise<unknown> {
    return this._servers.doCmd((c: MemcacheConnection) =>
      this._send(c, data, options || {})
    ) as Promise<unknown>;
  }

  // a convenient method to send a single line as a command to the server
  // with \r\n appended for you automatically
  cmd<Response>(
    data: string,
    options?: CommonCommandOption,
    callback?: ErrorFirstCallback
  ): Promise<Response> {
    return this.send(
      (socket) => {
        let line = data;
        if (options?.noreply) {
          line += " noreply";
        }
        socket?.write(`${line}\r\n`);
      },
      options,
      callback
    ) as unknown as Promise<Response>;
  }

  // "set" means "store this data".
  set(
    key: string,
    value: StoreParams,
    options?: StoreCommandOptions | OperationCallback<Error, string[]>,
    callback?: OperationCallback<Error, string[]>
  ): Promise<string[]> {
    options = options || {};
    if ((options as StoreCommandOptions).ignoreNotStored === undefined) {
      (options as StoreCommandOptions).ignoreNotStored = this.options.ignoreNotStored;
    }
    // it's tricky to threat optional object as callback
    return this.store("set", key, value, options as StoreCommandOptions, callback);
  }

  // "add" means "store this data, but only if the server *doesn't* already
  // hold data for this key".
  add(
    key: string,
    value: StoreParams,
    options?: StoreCommandOptions | OperationCallback<Error, string[]>,
    callback?: OperationCallback<Error, string[]>
  ): Promise<string[]> {
    return this.store("add", key, value, options as StoreCommandOptions, callback);
  }

  // "replace" means "store this data, but only if the server *does*
  // already hold data for this key".
  replace(
    key: string,
    value: StoreParams,
    options?: StoreCommandOptions | OperationCallback<Error, string[]>,
    callback?: OperationCallback<Error, string[]>
  ): Promise<string[]> {
    return this.store("replace", key, value, options as StoreCommandOptions, callback);
  }

  // "append" means "add this data to an existing key after existing data".
  append(
    key: string,
    value: StoreParams,
    options?: StoreCommandOptions | OperationCallback<Error, string[]>,
    callback?: OperationCallback<Error, string[]>
  ): Promise<string[]> {
    return this.store("append", key, value, options as StoreCommandOptions, callback);
  }

  // "prepend" means "add this data to an existing key before existing data".
  prepend(
    key: string,
    value: StoreParams,
    options?: StoreCommandOptions | OperationCallback<Error, string[]>,
    callback?: OperationCallback<Error, string[]>
  ): Promise<string[]> {
    return this.store("prepend", key, value, options as StoreCommandOptions, callback);
  }

  // "cas" is a check and set operation which means "store this data but
  // only if no one else has updated since I last fetched it."
  //
  // cas unique must be passed in options.casUniq
  //
  cas(
    key: string,
    value: StoreParams,
    options: CasCommandOptions,
    callback?: OperationCallback<Error, string[]>
  ): Promise<string[]> {
    assert(options?.casUniq, "Must provide options.casUniq for cas store command");
    return this.store("cas", key, value, options, callback);
  }

  // delete key, fire & forget with options.noreply
  delete(
    key: string,
    options?: CommonCommandOption | OperationCallback<Error, string[]>,
    callback?: OperationCallback<Error, string[]>
  ): Promise<string[]> {
    return this.cmd(
      `delete ${key}`,
      options as CommonCommandOption,
      callback
    ) as unknown as Promise<string[]>;
  }

  // incr key by value, fire & forget with options.noreply
  incr(
    key: string,
    value: number,
    options?: StoreCommandOptions | OperationCallback<Error, string>,
    callback?: OperationCallback<Error, string>
  ): Promise<string> {
    return this.cmd(
      `incr ${key} ${value}`,
      options as StoreCommandOptions,
      callback
    ) as unknown as Promise<string>;
  }

  // decrease key by value, fire & forget with options.noreply
  decr(
    key: string,
    value: number,
    options?: StoreCommandOptions | OperationCallback<Error, string>,
    callback?: OperationCallback<Error, string>
  ): Promise<string> {
    return this.cmd(
      `decr ${key} ${value}`,
      options as StoreCommandOptions,
      callback
    ) as unknown as Promise<string>;
  }

  // touch key with exp time, fire & forget with options.noreply
  touch(
    key: string,
    exptime: string | number,
    options?: CommonCommandOption | OperationCallback<Error, string[]>,
    callback?: OperationCallback<Error, string[]>
  ): Promise<string[]> {
    return this.cmd(
      `touch ${key} ${exptime}`,
      options as CommonCommandOption,
      callback
    ) as unknown as Promise<string[]>;
  }

  // get version of server
  version(callback?: OperationCallback<Error, string[]>): Promise<string[]> {
    return this.cmd(`version`, {}, callback) as unknown as Promise<string[]>;
  }

  // a generic API for issuing one of the store commands
  store(
    cmd: string,
    key: string,
    value: StoreParams,
    options?: Partial<CasCommandOptions> | OperationCallback<Error, string[]>,
    callback?: OperationCallback<Error, string[]>
  ): Promise<string[]> {
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if (options === undefined) {
      options = {};
    }

    const lifetime =
      options.lifetime !== undefined ? options.lifetime : this.options.lifetime || 60;
    const casUniq = options.casUniq ? ` ${options.casUniq}` : "";
    const noreply = options.noreply ? ` noreply` : "";

    //
    // store commands
    // <command name> <key> <flags> <exptime> <bytes> [noreply]\r\n
    //
    const _data: SocketCallback = (socket?: Socket) => {
      const packed = this._packer.pack(
        value,
        (options as Partial<CasCommandOptions>)?.compress === true
      );
      const bytes = Buffer.byteLength(packed.data);
      socket?.write(Buffer.concat([
        Buffer.from(`${cmd} ${key} ${packed.flag} ${lifetime} ${bytes}${casUniq}${noreply}\r\n`),
        Buffer.isBuffer(packed.data) ? packed.data : Buffer.from(packed.data),
        Buffer.from("\r\n"),
      ]));
    };

    return this._callbackSend(_data, options, callback) as unknown as Promise<string[]>;
  }

  get<ValueType>(
    key: string | string[],
    options?: StoreCommandOptions | OperationCallback<Error, MultiRetrieval<ValueType>>,
    callback?: OperationCallback<Error, MultiRetrieval<ValueType>>
  ): Promise<MultiRetrieval<ValueType>> {
    return this.retrieve("get", key, options, callback);
  }

  gets<ValueType>(
    key: string | string[],
    options?: StoreCommandOptions | OperationCallback<Error, MultiCasRetrieval<ValueType>>,
    callback?: OperationCallback<Error, MultiCasRetrieval<ValueType>>
  ): Promise<MultiCasRetrieval<ValueType>> {
    return this.retrieve("gets", key, options, callback);
  }

  // A generic API for issuing get or gets command
  retrieve<T>(
    cmd: string,
    key: string[] | string,
    options?: StoreCommandOptions | OperationCallback<Error, T>,
    callback?: ErrorFirstCallback
  ): Promise<T> {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    return nodeify(this.xretrieve(cmd, key, options), callback) as unknown as Promise<T>;
  }

  // the promise only version of retrieve
  xretrieve(cmd: string, key: string | string[], options?: StoreCommandOptions): Promise<unknown> {
    //
    // get <key>*\r\n
    // gets <key>*\r\n
    //
    // - <key>* means one or more key strings separated by whitespace.
    //
    return Array.isArray(key)
      ? this.xsend(`${cmd} ${key.join(" ")}\r\n`, options)
      : this.xsend(`${cmd} ${key}\r\n`, options).then(
          (r: unknown) => (r as Record<string, unknown>)[key]
        );
  }

  //
  // Internal methods
  //
  _send(
    conn: MemcacheConnection,
    data: StoreParams | SocketCallback,
    options: Partial<CasCommandOptions>
  ): Promise<unknown> {
    try {
      // send data to connection
      if (typeof data === "function") {
        data(conn.socket);
      } else {
        conn.socket?.write(data as string);
      }

      // if no reply wanted then just return
      if (options.noreply) {
        return this.Promise.resolve();
      }

      // queue up context to listen for reply
      return new this.Promise((resolve: ResolveCallback, reject: RejectCallback) => {
        const context = {
          error: null,
          results: {},
          callback: (err: Error, result: unknown) => {
            if (err) {
              if (options.ignoreNotStored === true && err.message === "NOT_STORED") {
                return resolve("ignore NOT_STORED");
              }
              return reject(err);
            }
            if (result) {
              return resolve(result);
            } else if (context.error) {
              return reject(context.error as unknown as Error);
            } else {
              return resolve(context.results);
            }
          },
        };

        conn.queueCommand(context as CommandContext);
      });
    } catch (err) {
      return this.Promise.reject(err);
    }
  }

  // internal send that expects all params passed (even if they are undefined)
  _callbackSend(
    data: StoreParams | SocketCallback,
    options?: Partial<CasCommandOptions>,
    callback?: ErrorFirstCallback
  ): Promise<unknown> {
    return nodeify(this.xsend(data, options), callback);
  }

  _unpackValue(result: PackedData): number | string | Record<string, unknown> | Buffer {
    //
    // VALUE <key> <flags> <bytes> [<cas unique>]\r\n
    //
    result.flag = +result.cmdTokens[2];
    return this._packer.unpack(result);
  }
}
