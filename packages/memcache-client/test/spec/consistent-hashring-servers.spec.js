"use strict";

/* eslint-disable no-unused-vars,no-irregular-whitespace,no-nested-ternary */

const MemcacheClient = require("../../lib/consistent-hashring-client");
const chai = require("chai");
const expect = chai.expect;
const Promise = require("bluebird");
const Fs = require("fs");
const Path = require("path");
const memcached = require("memcached-njs");
const text = require("../data/text");
const _ = require("lodash");

describe("consistent hashring servers", function() {
  process.on("unhandledRejection", e => {
    console.log("unhandledRejection", e);
  });

  const serverOptions = {
    logger: require("../../lib/null-logger")
  };

  it("should use multiple servers", () => {
    let memcachedServers;
    return Promise.resolve(new Array(6))
      .map(() => memcached.startServer(serverOptions))
      .then(servers => {
        memcachedServers = servers;
        const ports = servers.map(s => s._server.address().port);
        servers = ports.map(p => `localhost:${p}`);

        const x = new MemcacheClient(servers, { maxConnections: 3 });
        return Promise.resolve(new Array(8))
          .map((i, v) => x.cmd(`${v}`, "stats"), { concurrency: 8 })
          .then(r => {
            const m = r.map(stat => {
              return stat.STAT.find(j => j[0] === "port")[1];
            });
            const ms = _.uniq(m);
            expect(ms).to.have.length.above(1);
          });
      })
      .finally(() => {
        memcachedServers.forEach(s => s.shutdown());
      });
  });

  it("should use exile connect fail server", () => {
    let memcachedServers;
    return Promise.resolve(new Array(4))
      .map(() => memcached.startServer(serverOptions))
      .then(servers => {
        memcachedServers = servers;
        const ports = servers.map(s => s._server.address().port);
        servers = ports.map(p => `localhost:${p}`);

        const x = new MemcacheClient(servers);
        for (let i = 0; i < ports.length - 1; i++) {
          memcachedServers[i].shutdown();
        }
        return Promise.resolve(new Array(8))
          .map((i, v) => x.cmd(v, "stats"), { concurrency: 8 })
          .then(r => {
            const m = r.map(stat => {
              return stat.STAT.find(j => j[0] === "port")[1];
            });
            const ms = _.uniq(m);
            expect(x._servers._exServers).to.be.not.empty;
            expect(ms).to.have.length.be(1);
            _.forOwn(x._servers._exServers, (exTime, server) => {
                expect(x._servers._hashRing.has(server)).to.not.be.ok;
            });
            x._servers._servers.forEach(server => {
                expect(x._servers._hashRing.has(server)).to.be.ok;
            });
          });
      })
      .finally(() => {
        memcachedServers.forEach(s => s.shutdown());
      });
  });

  it("should rethrow non-connect errors", () => {
    let memcachedServers;
    return Promise.resolve(new Array(4))
      .map(() => memcached.startServer(serverOptions))
      .then(servers => {
        memcachedServers = servers;
        const ports = servers.map(s => s._server.address().port);
        servers = ports.map(p => `localhost:${p}`);


        const x = new MemcacheClient(
          servers, {
            cmdTimeout: 100,
            maxConnections: 3
        });
        let testErr;
        memcachedServers.forEach(s => s.pause());
        return Promise.resolve(new Array(8))
          .map(() => x.get("blah"), { concurrency: 8 })
          .catch(err => (testErr = err))
          .then(() => expect(testErr.message).to.equal("Command timeout"));
      })
      .finally(() => {
        memcachedServers.forEach(s => s.shutdown());
      });
  });

  it("should retry exiled servers after time interval", () => {
    let memcachedServers;
    return Promise.resolve(new Array(4))
      .map(() => memcached.startServer(serverOptions))
      .then(servers => {
        memcachedServers = servers;
        const ports = servers.map(s => s._server.address().port);
        servers = ports.map(p => `localhost:${p}`);


        const x = new MemcacheClient(
          servers, {
              cmdTimeout: 100,
              maxConnections: 3,
              retryFailedServerInterval: 10,
              failedServerOutTime: 100
          });

        memcachedServers[1].shutdown();
        memcachedServers[2].shutdown();
        memcachedServers[3].shutdown();
        return Promise.resolve(new Array(8))
          .map((e, v) => x.cmd(v, "stats"), { concurrency: 8 })
          .then(() => expect(Object.keys(x._servers._exServers)).to.have.length(3))
          .delay(100)
          .then(() =>
            Promise.all(
              [1, 2, 3].map(i =>
                memcached.startServer({
                  port: ports[i],
                  logger: require("../../lib/null-logger")
                })
              )
            )
          )
          .then(() => new Array(8))
          .map((e, v) => x.cmd(v, "stats"), { concurrency: 8 })
          .then(r => {
            expect(Object.keys(x._servers._exServers)).to.have.length(0);
            const m = r.map(stat => {
              return stat.STAT.find(j => j[0] === "port")[1];
            });
            const ms = _.uniq(m);
            expect(ms).to.have.length.above(1);
          });
      })
      .finally(() => {
        memcachedServers.forEach(s => s.shutdown());
      });
  });

  it("should exile all servers if keepLastServer is false", () => {
    const ports = ["19000", "19001", "19002", "19003"];
    const x = new MemcacheClient(
      ports.map(p => `localhost:${p}`), {
        maxConnections: 3,
        retryFailedServerInterval: 10,
        failedServerOutTime: 100,
        keepLastServer: false,
        cmdTimeout: 100
      }
    );

    let testErr;
    return x
      .cmd("", "stats")
      .catch(err => (testErr = err))
      .then(() => expect(testErr.message).to.equal("No more valid servers left"));
  });
});
