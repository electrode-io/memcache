import { Socket } from "net";

// TODO: temporal fix. this module should have its own types definitions
declare module "memcached-njs" {
  export class MemcachedServer {
    _server: { address: () => { port: number }; _port: number };
    shutdown(): void;
    pause(): void;
    unpause(): void;
    onData(): (connection: Socket) => void;
    _port: number;
    asyncMode(value: boolean): void;
  }

  function startServer(options: unknown): Promise<MemcachedServer>;
}
