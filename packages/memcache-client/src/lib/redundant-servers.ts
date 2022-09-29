import defaults from "./defaults";
import { MemcacheNode } from "./memcache-node";
import { MemcacheClient } from "./client";
import assert from "assert";
import {
  SingleServerEntry,
  MultipleServerEntry,
  ServerDefinition,
  CommandCallback,
  ConnectionError,
} from "../types";
import _defaults from "lodash.defaults";

/* eslint-disable max-statements,no-magic-numbers */

/*
 * Manage a pool of redundant servers
 */

type RedundantServerEntry = SingleServerEntry & { exiledTime?: number };

export default class RedundantServers {
  client: MemcacheClient;
  _servers: Array<RedundantServerEntry>;
  _exServers: Array<RedundantServerEntry>;
  _nodes: Record<string, MemcacheNode>;
  _config: Record<string, string | boolean | number>;
  _lastRetryTime: number = 0;

  constructor(client: MemcacheClient, server: SingleServerEntry) {
    this.client = client;
    let servers;
    let maxConnections = defaults.MAX_CONNECTIONS;
    if (typeof server === "object") {
      if (server.server) {
        maxConnections = server.maxConnections || defaults.MAX_CONNECTIONS;
        servers = [{ server: server.server, maxConnections }];
      } else {
        servers = (server as unknown as MultipleServerEntry).servers;
        assert(servers, "no servers provided");
        assert(Array.isArray(servers), "servers is not an array");
      }
    } else {
      servers = [{ server, maxConnections }];
    }
    this._servers = servers;
    this._exServers = []; // servers that failed connection
    this._nodes = {};
    this._config = _defaults({}, (server as unknown as ServerDefinition).config, {
      failedServerOutTime: defaults.FAILED_SERVER_OUT_TIME,
      retryFailedServerInterval: defaults.RETRY_FAILED_SERVER_INTERVAL,
      keepLastServer: defaults.KEEP_LAST_SERVER,
    });
  }

  shutdown(): void {
    const keys = Object.keys(this._nodes);
    for (let i = 0; i < keys.length; i++) {
      this._nodes[keys[i]].shutdown();
    }
  }

  doCmd(action: CommandCallback): void | Promise<unknown> {
    if (this._exServers.length > 0) {
      this._retryServers();
    }
    if (this._servers.length === 0) {
      throw new Error("No more valid servers left");
    }
    if (this._servers.length === 1 && this._config.keepLastServer === true) {
      return this._getNode().doCmd(action);
    }
    const node = this._getNode();
    return (node.doCmd(action) as Promise<void>).catch((err: ConnectionError) => {
      if (!err.connecting) {
        throw err;
      }
      // failed to connect to server, exile it
      const s = node.options.server;
      const _servers = [];
      for (let i = 0; i < this._servers.length; i++) {
        if (s === this._servers[i].server) {
          this._servers[i].exiledTime = Date.now();
          this._exServers.push(this._servers[i]);
        } else {
          _servers.push(this._servers[i]);
        }
      }
      this._servers = _servers;
      return this.doCmd(action);
    });
  }

  _retryServers(): void {
    const now = Date.now();
    if (now - this._lastRetryTime < this._config.retryFailedServerInterval) {
      return;
    }
    this._lastRetryTime = now;
    let i;
    let n = 0;
    for (i = 0; i < this._exServers.length; i++) {
      const es = this._exServers[i];
      if (now - (es.exiledTime ?? 0) >= this._config.failedServerOutTime) {
        delete es.exiledTime;
        this._servers.push(es);
        n++;
      }
    }
    if (n > 0) {
      this._exServers = this._exServers.filter((x) => x.exiledTime !== undefined);
    }
  }

  _getNode(): MemcacheNode {
    const n = this._servers.length > 1 ? Math.floor(Math.random() * this._servers.length) : 0;
    const server = this._servers[n];
    let node = this._nodes[server.server];
    if (node) {
      return node;
    }
    node = new MemcacheNode(this.client, server);
    this._nodes[server.server] = node;
    return node;
  }
}
