import { ConnectionOptions } from "tls";
import { MemcacheConnection } from "./lib/connection";

export type CommandCallback = (conn: MemcacheConnection) => void;

export interface CompressorLibrary {
  compressSync(payload?: { input: string | number | Buffer | Record<string, unknown> }): Buffer;
  decompressSync(payload: { input: string | number | Buffer }): string | Buffer;
}

export type SingleServerEntry = {
  server: string;
  maxConnections?: number;
};

export type MultipleServerEntry = { servers: Array<SingleServerEntry> };

type Serverconfig = {
  retryFailedServerInterval: number;
  failedServerOutTime: number;
  keepLastServer?: boolean;
};

export type ServerDefinition = {
  server: SingleServerEntry | MultipleServerEntry;
  config: Serverconfig;
};

export type ResolveCallback = <T extends any>(result: T) => void;

export type RejectCallback = (error: Error) => void;

export type ErrorFirstCallback = (error?: Error | null, data?: any) => void;

export type PackedData = {
  flag: number;
  data: string | Buffer;
  cmdTokens: number[];
  cmd?: string;
};

export type MemcacheClientOptions = {
  server: ServerDefinition | SingleServerEntry | MultipleServerEntry | string;
  ignoreNotStored?: boolean;
  lifetime?: number;
  noDelay?: boolean;
  cmdTimeout?: number;
  connectTimeout?: number;
  keepAlive?: number | false;
  keepDangleSocket?: boolean;
  dangleSocketWaitTimeout?: number;
  compressor?: CompressorLibrary;
  logger?: any;
  Promise?: PromiseConstructor;
  tls?: ConnectionOptions;
};

// connection
export type CommandContext = {
  error?: Error | null;
  results: Record<string, unknown>;
  callback: ErrorFirstCallback;
};

export type QueuedCommandContext = CommandContext & {
  queuedTime: number;
};

export type ConnectionError = Error & { connecting?: boolean };
