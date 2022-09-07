/* eslint-disable no-unused-vars,no-irregular-whitespace */
import { MemcacheConnection, MemcacheNode, MemcacheClient } from "../..";

type TestMemcacheClient = MemcacheConnection & Readonly<{ test: string }>;

describe("memcache node", function () {
  it("should use established connection", () => {
    const node = new MemcacheNode({} as unknown as MemcacheClient, {
      server: "test",
      maxConnections: 1,
    });
    node.connections.push({
      test: "test",
      isReady: () => true,
      _cmdQueue: [],
    } as unknown as MemcacheConnection);
    node.doCmd((c) => expect((c as unknown as TestMemcacheClient).test).toEqual("test"));
  });

  it("should make a new connection when no idle ones", () => {
    const node = new MemcacheNode({} as unknown as MemcacheClient, {
      server: "test",
      maxConnections: 2,
    });
    node.connections.push({
      test: "test",
      isReady: () => true,
      _cmdQueue: [{}],
    } as unknown as MemcacheConnection);

    node._connect = () => {
      return Promise.resolve("dummy-connection" as unknown as MemcacheConnection);
    };
    node.doCmd((c) => expect(c).toEqual("dummy-connection"));
  });

  it("should make a new connection when no ready ones", () => {
    const node = new MemcacheNode({} as unknown as MemcacheClient, {
      server: "test",
      maxConnections: 2,
    });
    node.connections.push({
      test: "test",
      isReady: () => false,
      _cmdQueue: [],
    } as unknown as MemcacheConnection);

    node._connect = () => {
      return Promise.resolve("dummy-connection" as unknown as MemcacheConnection);
    };
    node.doCmd((c) => expect(c).toEqual("dummy-connection"));
  });

  it("should reuse the least busy connection", () => {
    const node = new MemcacheNode({} as unknown as MemcacheClient, {
      server: "test",
      maxConnections: 2,
    });
    node.connections.push({
      test: "test1",
      isReady: () => true,
      _cmdQueue: [{}, {}, {}],
    } as unknown as MemcacheConnection);
    node.connections.push({
      test: "test2",
      isReady: () => true,
      _cmdQueue: [{}],
    } as unknown as MemcacheConnection);
    node.connections.push({
      test: "test3",
      isReady: () => true,
      _cmdQueue: [{}, {}],
    } as unknown as MemcacheConnection);
    node.doCmd((c) => expect((c as unknown as TestMemcacheClient).test).toEqual("test2"));
  });

  it("should wait if the least busy connection is still pending", () => {
    const node = new MemcacheNode({} as unknown as MemcacheClient, {
      server: "test",
      maxConnections: 2,
    });
    node.connections.push({
      test: "test1",
      isReady: () => true,
      _cmdQueue: [{}, {}, {}],
    } as unknown as MemcacheConnection);
    node.connections.push({
      test: "test2",
      isReady: () => false,
      _cmdQueue: [{}],
      waitReady: () => Promise.resolve("dummy-connection"),
    } as unknown as MemcacheConnection);
    node.connections.push({
      test: "test3",
      isReady: () => true,
      _cmdQueue: [{}, {}],
    } as unknown as MemcacheConnection);
    node.doCmd((c) => expect(c as unknown as TestMemcacheClient).toEqual("dummy-connection"));
  });

  it("should remove connection that's ended", () => {
    const node = new MemcacheNode({} as unknown as MemcacheClient, {
      server: "test",
      maxConnections: 5,
    });
    node.connections = [
      { _id: 1 },
      { _id: 10 },
      { _id: 20 },
      { _id: 30 },
      { _id: 40 },
    ] as unknown as MemcacheConnection[];
    node.endConnection({ _id: 30 } as unknown as MemcacheConnection);
    expect(node.connections).toEqual([{ _id: 1 }, { _id: 10 }, { _id: 20 }, { _id: 40 }]);
  });
});
