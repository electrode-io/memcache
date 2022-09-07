/* eslint-disable no-var,no-magic-numbers */
import assert from "assert";
import { MemcacheConnection } from "./connection";
import { MemcacheClient } from "./client";
import { SingleServerEntry, CommandCallback } from "../types";

export class MemcacheNode {
  options: SingleServerEntry;
  connections: Array<MemcacheConnection>;
  client: MemcacheClient;

  constructor(client: MemcacheClient, options: SingleServerEntry) {
    assert(options.server, "Must provide options.server");
    assert(options.maxConnections, "Must set options.maxConnections");
    assert(options.maxConnections > 0, "options.maxConnections must > 0");
    this.options = options;
    this.connections = [];
    this.client = client;
  }

  doCmd(action: CommandCallback): void | Promise<unknown> {
    // look for idle and ready connection
    let conn: MemcacheConnection | undefined = this.connections.find((c) => {
      return c.isReady() && c._cmdQueue.length === 0;
    });

    if (conn) {
      return action(conn);
    }

    // make a new connection
    if (this.connections.length < (this.options.maxConnections ?? 0)) {
      return this._connect(this.options.server)?.then(action);
    }

    // look for least busy connection
    var n = Infinity;
    this.connections.forEach((c) => {
      if (c._cmdQueue.length < n) {
        conn = c;
        n = c._cmdQueue.length;
      }
    });

    if ((conn as unknown as MemcacheConnection).isReady()) {
      return action(conn as unknown as MemcacheConnection);
    }

    return (conn as unknown as MemcacheConnection).waitReady().then(action as any);
  }

  shutdown(): void {
    const connections = this.connections;
    this.connections = [];
    connections.forEach((x) => x.shutdown());
  }

  endConnection(conn: MemcacheConnection): void {
    this.connections = this.connections.filter((x) => x._id !== conn._id);
  }

  _connect(server: string): Promise<MemcacheConnection> {
    const conn = new MemcacheConnection(this.client, this);
    this.connections.push(conn);
    return conn.connect(server);
  }
}
