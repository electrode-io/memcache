"use strict";

/* eslint-disable no-var,no-magic-numbers */

const assert = require("assert");
const MemcacheConnection = require("./connection");

class MemcacheNode {
  constructor(client, options) {
    assert(options.server, "Must provide options.server");
    assert(options.maxConnections, "Must set options.maxConnections");
    assert(options.maxConnections > 0, "options.maxConnections must > 0");
    this.options = options;
    this.connections = [];
    this.client = client;
  }

  doCmd(action) {
    // look for idle and ready connection
    var conn = this.connections.find(c => {
      return c.isReady() && c._cmdQueue.length === 0;
    });

    if (conn) {
      return action(conn);
    }

    // make a new connection
    if (this.connections.length < this.options.maxConnections) {
      return this._connect(this.options.server).then(action);
    }

    // look for least busy connection
    var n = Infinity;
    this.connections.forEach(c => {
      if (c._cmdQueue.length < n) {
        conn = c;
        n = c._cmdQueue.length;
      }
    });

    if (conn.isReady()) {
      return action(conn);
    }

    return conn.waitReady().then(action);
  }

  shutdown() {
    const connections = this.connections;
    this.connections = [];
    connections.forEach(x => x.shutdown());
  }

  endConnection(conn) {
    this.connections = this.connections.filter(x => x._id !== conn._id);
  }

  _connect(server) {
    const conn = new MemcacheConnection(this.client, this);
    this.connections.push(conn);
    return conn.connect(server);
  }
}

module.exports = MemcacheNode;
