"use strict";

const defaults = require("./defaults");
const MemcacheNode = require("./memcache-node");
const assert = require("assert");
const _defaults = require("lodash.defaults");

/* eslint-disable max-statements,no-magic-numbers */

/*
 * Manage a pool of redundant servers
 */

class RedundantServers {
  constructor(client, server) {
    this.client = client;
    let servers;
    let maxConnections = defaults.MAX_CONNECTIONS;
    if (typeof server === "object") {
      if (server.server) {
        maxConnections = server.maxConnections || defaults.MAX_CONNECTIONS;
        servers = [{ server: server.server, maxConnections }];
      } else {
        servers = server.servers;
        assert(servers, "no servers provided");
        assert(Array.isArray(servers), "servers is not an array");
      }
    } else {
      servers = [{ server, maxConnections }];
    }
    this._servers = servers;
    this._exServers = []; // servers that failed connection
    this._nodes = {};
    this._config = _defaults({}, server.config, {
      failedServerOutTime: defaults.FAILED_SERVER_OUT_TIME,
      retryFailedServerInterval: defaults.RETRY_FAILED_SERVER_INTERVAL,
      keepLastServer: defaults.KEEP_LAST_SERVER
    });
  }

  shutdown() {
    const keys = Object.keys(this._nodes);
    for (let i = 0; i < keys.length; i++) {
      this._nodes[keys[i]].shutdown();
    }
  }

  doCmd(action) {
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
    return node.doCmd(action).catch((err) => {
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

  _retryServers() {
    const now = Date.now();
    if (now - this._lastRetryTime < this._config.retryFailedServerInterval) {
      return;
    }
    this._lastRetryTime = now;
    let i;
    let n = 0;
    for (i = 0; i < this._exServers.length; i++) {
      const es = this._exServers[i];
      if (now - es.exiledTime >= this._config.failedServerOutTime) {
        delete es.exiledTime;
        this._servers.push(es);
        n++;
      }
    }
    if (n > 0) {
      this._exServers = this._exServers.filter((x) => x.exiledTime !== undefined);
    }
  }

  _getNode() {
    const n = this._servers.length > 1
      ? Math.floor(Math.random() * this._servers.length)
      : 0;
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

module.exports = RedundantServers;
