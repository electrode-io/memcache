/* eslint-disable no-unused-vars,no-irregular-whitespace,no-nested-ternary */

import { MemcacheClient, StatsCommandResponse } from "../..";
import memcached, { MemcachedServer } from "memcached-njs";
import { uniq } from "lodash";
import { expect } from "@jest/globals";
import NullLogger from "../../lib/null-logger";
import { AddressInfo } from "net";

const getPortFromStats = (stat: StatsCommandResponse) => {
  const portStat = stat.STAT.find((j: string[]) => j[0] === "port");
  return portStat ? portStat[1] : undefined;
};

describe("redundant servers", function () {
  process.on("unhandledRejection", (e) => {
    console.log("unhandledRejection", e);
  });

  const serverOptions = {
    logger: NullLogger,
  };

  it("should use multiple servers", () => {
    let memcachedServers: MemcachedServer[];
    return Promise.resolve([...Array(6)])
      .then((baseArray) =>
        Promise.resolve(baseArray.map(() => memcached.startServer(serverOptions)))
      )
      .then(async (servers: Promise<MemcachedServer>[]) => {
        memcachedServers = await Promise.all(servers);

        const ports = memcachedServers.map((s) => (s._server?.address() as AddressInfo).port);
        const serversUrls = ports.map((p) => ({ server: `localhost:${p}`, maxConnections: 3 }));

        const x = new MemcacheClient({
          server: {
            servers: serversUrls,
          },
        });
        return Promise.resolve([...Array(8)])
          .then((baseArray) =>
            Promise.resolve(
              baseArray.map(() => x.cmd<StatsCommandResponse>("stats"), { concurrency: 8 })
            )
          )
          .then(async (r) => {
            const allStats = await Promise.all(r);

            const m = allStats.map(getPortFromStats);
            const ms = uniq(m);
            expect(ms.length).toBeGreaterThan(1);
          });
      })
      .finally(() => {
        memcachedServers.forEach((s) => {
          s.shutdown();
        });
      });
  });

  it("should use exile connect fail server", () => {
    let memcachedServers: MemcachedServer[];
    return Promise.resolve([...Array(4)])
      .then((baseArray) =>
        Promise.resolve(baseArray.map(() => memcached.startServer(serverOptions)))
      )
      .then(async (servers: Promise<MemcachedServer>[]) => {
        memcachedServers = await Promise.all(servers);

        const ports = memcachedServers.map((s) => (s._server?.address() as AddressInfo).port);
        const serversUrls = ports.map((p) => ({ server: `localhost:${p}`, maxConnections: 3 }));

        const x = new MemcacheClient({
          server: {
            servers: serversUrls,
          },
        });
        for (let i = 0; i < ports.length - 1; i++) {
          memcachedServers[i].shutdown();
        }
        return Promise.resolve([...Array(8)])
          .then((baseArray) =>
            Promise.resolve(
              baseArray.map(() => x.cmd<StatsCommandResponse>("stats"), { concurrency: 8 })
            )
          )
          .then(async (r) => {
            const allStats = await Promise.all(r);

            const m = allStats.map(getPortFromStats);
            const ms = uniq(m);
            expect(x._servers._exServers.length).not.toBe(0);
            expect(ms.length).toBe(1);
          });
      })
      .finally(() => {
        memcachedServers.forEach((s) => s.shutdown());
      });
  });

  it("should rethrow non-connect errors", () => {
    let memcachedServers: MemcachedServer[];
    return Promise.resolve([...Array(4)])
      .then((baseArray) =>
        Promise.resolve(baseArray.map(() => memcached.startServer(serverOptions)))
      )
      .then(async (servers: Promise<MemcachedServer>[]) => {
        memcachedServers = await Promise.all(servers);

        const ports = memcachedServers.map((s) => (s._server?.address() as AddressInfo).port);
        const serversUrls = ports.map((p) => ({ server: `localhost:${p}`, maxConnections: 3 }));

        const x = new MemcacheClient({
          server: {
            servers: serversUrls,
          },
          cmdTimeout: 100,
        });
        let testErr: Error;
        memcachedServers.forEach((s) => s.pause());
        return Promise.resolve([...Array(8)])
          .then((baseArray) => Promise.all(baseArray.map(() => x.get("blah"), { concurrency: 8 })))
          .catch((err: Error) => (testErr = err))
          .then(() => expect(testErr.message).toEqual("Command timeout"));
      })
      .finally(() => {
        memcachedServers.forEach((s) => s.shutdown());
      });
  });

  it("should retry exiled servers after time interval", async () => {
    const ports = ["9001", "9002", "9003", "9004"];
    const servers = await Promise.resolve(
      ports.map((port) => memcached.startServer({ port, ...serverOptions }))
    );

    const memcachedServers = await Promise.all(servers);
    const serversUrls = ports.map((p) => ({ server: `localhost:${p}`, maxConnections: 3 }));

    const x = new MemcacheClient({
      server: {
        servers: serversUrls,
        config: {
          retryFailedServerInterval: 10,
          failedServerOutTime: 100,
        },
      },
      cmdTimeout: 100,
    });

    memcachedServers[1].shutdown();
    memcachedServers[2].shutdown();
    memcachedServers[3].shutdown();

    const connectionsBaseArray = await Promise.resolve([...Array(8)]);
    await Promise.all(connectionsBaseArray.map(() => x.cmd("stats"), { concurrency: 8 }));

    expect(x._servers._exServers.length).toBe(3);
    await new Promise((r) => setTimeout(r, 1000));

    const newServers = await Promise.all(
      [1, 2, 3].map((i) =>
        memcached.startServer({
          port: ports[i],
          logger: NullLogger,
        })
      )
    );

    const connectionPromises = await Promise.resolve(
      connectionsBaseArray.map(() => x.cmd<StatsCommandResponse>("stats"), { concurrency: 8 })
    );

    expect(x._servers._exServers.length).toBe(0);
    const allStats = await Promise.all(connectionPromises);

    const m = allStats.map(getPortFromStats);
    const ms = uniq(m);
    expect(ms.length).toBeGreaterThan(1);

    memcachedServers.forEach((s) => s.shutdown());
    newServers.forEach((s) => s.shutdown());
  });

  it("should exile all servers if keepLastServer is false", () => {
    const ports = ["19000", "19001", "19002", "19003"];
    const x = new MemcacheClient({
      server: {
        servers: ports.map((p) => ({
          server: `localhost:${p}`,
          maxConnections: 3,
        })),
        config: {
          retryFailedServerInterval: 10,
          failedServerOutTime: 100,
          keepLastServer: false,
        },
      },
      cmdTimeout: 100,
    });

    let testErr: Error;
    return x
      .cmd("stats")
      .catch((err: Error) => (testErr = err))
      .then(() => expect(testErr.message).toEqual("No more valid servers left"));
  });
});
