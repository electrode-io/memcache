"use strict";

const startServer = require("../..").startServer;
const Memcached = require("memcached");
const chai = require("chai");
const expect = chai.expect;
const Promise = require("bluebird");
const Net = require("net");

describe("memcache-server", function () {
  const startClient = (server) => {
    const port = server._server.address().port;
    const client = new Memcached(`localhost:${port}`);
    client.setP = Promise.promisify(client.set, { context: client });
    client.getP = Promise.promisify(client.get, { context: client });
    client.getMultiP = Promise.promisify(client.getMulti, { context: client });
    return client;
  };

  it("should startup, get, and set value with memcached client", () => {
    return startServer().then((server) => {
      const client = startClient(server);
      return Promise.all([
        client.setP("hello", "blahblah", 60),
        client.setP("foo", "foofoofoo", 60),
        client.setP("bar", "barbarbar", 60)
      ])
        .then(() =>
          Promise.all([
            client.getP("hello"), client.getP("foo"), client.getP("bar")
          ])
            .then((results) => {
              expect(results[0]).to.equal("blahblah");
              expect(results[1]).to.equal("foofoofoo");
              expect(results[2]).to.equal("barbarbar");
            })
        )
        .then(() =>
          client.getMultiP(["hello", "foo", "bar"])
            .then((result) => {
              // note: memcached client is broken
              // each result should have its own cas unique
              expect(result.hello).to.equal("blahblah");
              expect(result.foo).to.equal("foofoofoo");
              expect(result.bar).to.equal("barbarbar");
            })
        )
        .timeout(1500)
        .finally(() => server.shutdown());
    });
  });

  it("should throw port in use error", () => {
    return startServer().then((server) => {
      const port = server._server.address().port;
      return startServer({ port })
        .catch((err) => {
          expect(err.message).include("listen EADDRINUSE");
        })
        .finally(() => server.shutdown());
    });
  });

  it("should return no entry for key not found", () => {
    return startServer().then((server) => {
      const client = startClient(server);
      return new Promise((resolve, reject) => {
        client.get(`test_${Date.now()}`, (err, data) => {
          return data ? reject(new Error("expected no result")) : resolve();
        });
      })
        .finally(() => server.shutdown());
    });
  });

  it("should close connection for unknown command", () => {
    return startServer().then((server) => {
      const port = server._server.address().port;
      return new Promise((resolve) => {
        const socket = Net.createConnection({ host: "localhost", port }, () => {
          socket.on("close", () => resolve());
          socket.write("blah\r\n");
        });
      })
        .timeout(1500, "socket not closed for unknown command")
        .finally(() => server.shutdown());
    });
  });

  it("should log net error", () => {
    return startServer().then((server) => {
      server._onError(new Error("test"));
      return Promise.try(() => server.shutdown());
    });
  });
});
