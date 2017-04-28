"use strict";

/* eslint-disable no-unused-vars,no-irregular-whitespace */

const chai = require("chai");
const expect = chai.expect;
const Promise = require("bluebird");
const MemcacheNode = require("../../lib/memcache-node");

describe("memcache node", function () {
  it("should use established connection", () => {
    const node = new MemcacheNode({}, { server: "test", maxConnections: 1 });
    node.connections.push({
      test: "test",
      ready: true,
      _cmdQueue: []
    });
    node.doCmd((c) => expect(c.test).to.equal("test"));
  });

  it("should make a new connection when no idle ones", () => {
    const node = new MemcacheNode({}, { server: "test", maxConnections: 2 });
    node.connections.push({
      test: "test",
      ready: true,
      _cmdQueue: [{}]
    });
    let testServer;
    node._connect = (server) => {
      testServer = server;
      return Promise.resolve("dummy-connection");
    };
    node.doCmd((c) => expect(c).to.equal("dummy-connection"));
  });


  it("should make a new connection when no ready ones", () => {
    const node = new MemcacheNode({}, { server: "test", maxConnections: 2 });
    node.connections.push({
      test: "test",
      ready: false,
      _cmdQueue: []
    });
    let testServer;
    node._connect = (server) => {
      testServer = server;
      return Promise.resolve("dummy-connection");
    };
    node.doCmd((c) => expect(c).to.equal("dummy-connection"));
  });

  it("should reuse the least busy connection", () => {
    const node = new MemcacheNode({}, { server: "test", maxConnections: 2 });
    node.connections.push({
      test: "test1",
      ready: true,
      _cmdQueue: [{}, {}, {}]
    });
    node.connections.push({
      test: "test2",
      ready: true,
      _cmdQueue: [{}]
    });
    node.connections.push({
      test: "test3",
      ready: true,
      _cmdQueue: [{}, {}]
    });
    node.doCmd((c) => expect(c.test).to.equal("test2"));
  });

  it("should wait if the least busy connection is still pending", () => {
    const node = new MemcacheNode({}, { server: "test", maxConnections: 2 });
    node.connections.push({
      test: "test1",
      ready: true,
      _cmdQueue: [{}, {}, {}]
    });
    node.connections.push({
      test: "test2",
      ready: false,
      _cmdQueue: [{}],
      waitReady: () => Promise.resolve("dummy-connection")
    });
    node.connections.push({
      test: "test3",
      ready: true,
      _cmdQueue: [{}, {}]
    });
    node.doCmd((c) => expect(c).to.equal("dummy-connection"));
  });

  it("should remove connection that's ended", () => {
    const node = new MemcacheNode({}, { server: "test", maxConnections: 5 });
    node.connections = [
      { _id: 1 }, { _id: 10 }, { _id: 20 }, { _id: 30 }, { _id: 40 }
    ];
    node.endConnection({ _id: 30 });
    expect(node.connections).to.deep.equal([
      { _id: 1 }, { _id: 10 }, { _id: 20 }, { _id: 40 }
    ]);
  });
});
