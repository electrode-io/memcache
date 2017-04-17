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
    return new Memcached(`localhost:${port}`);
  };

  it("should startup, get, and set value with memcached client", () => {
    return startServer().then((server) => {
      const client = startClient(server);
      return new Promise((resolve, reject) => {
        client.set("hello", "blahblah", 60, (err) => {
          if (err) {
            return reject(err);
          }
          return client.get("hello", (gerr, data) => {
            expect(data).to.equal("blahblah");
            resolve();
          });
        });
      })
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
});
