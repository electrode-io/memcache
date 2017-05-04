"use strict";

/* eslint-disable no-unused-vars,no-irregular-whitespace,no-nested-ternary */

const MemcacheClient = require("../..");
const chai = require("chai");
const expect = chai.expect;
const Promise = require("bluebird");
const Fs = require("fs");
const Path = require("path");
const memcached = require("memcached-njs");
const text = require("../data/text");
const _ = require("lodash");

describe("redundant servers", function () {
  process.on("unhandledRejection", (e) => {
    console.log("unhandledRejection", e);
  });

  it("should use multiple servers", () => {
    let memcachedServers;
    return Promise.resolve(new Array(6))
      .map(() => memcached.startServer())
      .then((servers) => {
        memcachedServers = servers;
        const ports = servers.map((s) => s._server.address().port);
        servers = ports.map((p) => ({ server: `localhost:${p}`, maxConnections: 3 }));
        console.log(servers);

        const x = new MemcacheClient({
          server: {
            servers
          }
        });
        return Promise.resolve(new Array(8))
          .map(() => x.cmd("stats"), { concurrency: 8 })
          .then((r) => {
            const m = r.map((stat) => {
              return stat.STAT.find((j) => j[0] === "port")[1];
            });
            const ms = _.uniq(m);
            console.log(ms);
            expect(ms).to.have.length.above(1);
          });
      })
      .finally(() => {
        memcachedServers.forEach((s) => s.shutdown());
      });
  });
});
