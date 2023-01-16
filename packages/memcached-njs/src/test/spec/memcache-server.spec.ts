/* eslint-disable @typescript-eslint/no-unused-vars */
import memcached, { MemcachedServer } from "../../";
import MemcachedClient from "memcached";
// const Promise = Promise;
import net, { AddressInfo } from "net";
import { promisify } from "util";
// import { setTimeout } from "timers/promises";

describe("memcache-server", function () {
  afterEach(() => jest.useRealTimers());

  const startClient = (server: MemcachedServer) => {
    const port = (server._server?.address() as AddressInfo).port;
    const client: any = new MemcachedClient(`localhost:${port}`);
    client.setP = promisify(client.set).bind(client);
    client.getP = promisify(client.get).bind(client);
    client.getMultiP = promisify(client.getMulti).bind(client);
    return client;
  };

  it("should startup, get, and set value with memcached client", async () => {
    const server = await memcached.startServer();
    const client = startClient(server);

    await Promise.all([
      client.setP("hello", "blahblah", 60),
      client.setP("foo", "foofoofoo", 60),
      client.setP("bar", "barbarbar", 60),
    ]);

    const results = await Promise.all([
      client.getP("hello"),
      client.getP("foo"),
      client.getP("bar"),
    ]);

    expect(results[0]).toEqual("blahblah");
    expect(results[1]).toEqual("foofoofoo");
    expect(results[2]).toEqual("barbarbar");

    const result = await client.getMultiP(["hello", "foo", "bar"]);
    // note: memcached client is broken
    // each result should have its own cas unique
    expect(result.hello).toEqual("blahblah");
    expect(result.foo).toEqual("foofoofoo");
    expect(result.bar).toEqual("barbarbar");

    server.shutdown();
  });

  it("should throw port in use error", async () => {
    const server = await memcached.startServer();
    const { port } = server._server?.address() as AddressInfo;

    expect(async () => await memcached.startServer({ port })).rejects.toThrow("listen EADDRINUSE");

    server.shutdown();
  });

  it("should return no entry for key not found", async () => {
    const server = await memcached.startServer();
    const client = startClient(server);

    const data = await client.get(`test_${Date.now()}`);

    server.shutdown();
    expect(data).toBeUndefined();
  });

  it("should close connection for unknown command", (done) => {
    memcached.startServer().then((server) => {
      const { port } = server._server?.address() as AddressInfo;

      const socket = net.createConnection({ host: "localhost", port }, () => {
        socket.on("close", () => {
          done();
        });

        socket.write("blah\r\n");

        setTimeout(() => {
          server.shutdown();
          socket.destroy();
        }, 1500);
      });
    });
  });

  // it.only("should close connection for unknown command", () => {
  //   return memcached.startServer().then((server) => {
  //     const { port } = server._server.address() as AddressInfo;
  //     return (
  //       new Promise((resolve: any) => {
  //         const socket = net.createConnection({ host: "localhost", port }, () => {
  //           socket.on("close", () => resolve());
  //           socket.write("blah\r\n");
  //         });
  //       })
  //         // .timeout(1500, "socket not closed for unknown command")
  //         .finally(() => server.shutdown())
  //     );
  //   });
  // });

  it("should log net error", async () => {
    const server = await memcached.startServer();
    server._onError(new Error("test error"));
    server.shutdown();
  });
});
