"use strict";

const defaults = require("./defaults");
const MemcacheNode = require("./memcache-node");

/*
 * Manage a pool of redundant servers
 */

class RedundantServers {
  constructor(client, server) {
    this.client = client;
    let servers;
    let maxConnections = defaults.MAX_CONNECTIONS;
    if (typeof server === "object") {
      maxConnections = server.maxConnections || defaults.MAX_CONNECTIONS;
      servers = [{ server: server.server, maxConnections }];
    } else {
      servers = [{ server, maxConnections }];
    }
    this._servers = servers;
    this._nodes = {};
    this._config = server.config || {};
  }

  shutdown() {
    const keys = Object.keys(this._nodes);
    for (let i = 0; i < keys.length; i++) {
      this._nodes[keys[i]].shutdown();
    }
  }

  doCmd(action) {
    const node = this._getNode();
    return node.doCmd(action);
  }

  _getNode() {
    const server = this._servers[0];
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
