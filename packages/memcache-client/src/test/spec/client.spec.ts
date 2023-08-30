/* eslint-disable no-bitwise,no-unused-vars,no-irregular-whitespace,no-nested-ternary */
const Promise = require("bluebird"); // eslint-disable-line
import {
  MemcacheClient,
  SingleServerEntry,
  ValueFlags,
  RetrievalCommandResponse,
  MultiRetrievalResponse,
  DangleWaitResponse,
  StatsCommandResponse,
} from "../../";
import Fs from "fs";
import Path from "path";
import { text1, text2, poem1, poem2, poem3, poem4, poem5 } from "../data/text";
import NullLoger from "../../lib/null-logger";
import memcached, { MemcachedServer } from "memcached-njs";
import { AddressInfo, Socket } from "net";

describe("memcache client", function () {
  process.on("unhandledRejection", (e) => {
    console.log("unhandledRejection", e);
  });

  let memcachedServer: MemcachedServer;
  let server: string;
  let serverPort: number;
  let sysConnectTimeout = 0;

  const restartMemcachedServer = (port?: number) => {
    if (memcachedServer) {
      memcachedServer.shutdown();
    }
    const options: Record<string, unknown> = { logger: NullLoger };
    if (port) {
      options.port = port;
    }
    return memcached.startServer(options).then((ms: MemcachedServer) => {
      console.log("memcached server started");
      serverPort = (ms._server?.address() as AddressInfo).port;
      server = `localhost:${serverPort}`;
      memcachedServer = ms;
    });
  };

  const startSingleServer = async (
    port?: number
  ): Promise<{ serverUrl: string; server: MemcachedServer }> => {
    const serverInstance = await memcached.startServer({ logger: NullLoger, port });
    console.log("single memcached server started");
    return {
      serverUrl: `localhost:${(serverInstance._server?.address() as AddressInfo).port}`,
      server: serverInstance,
    };
  };

  beforeAll((done) => {
    if (process.env.MEMCACHED_SERVER) {
      server = process.env.MEMCACHED_SERVER;
      done();
    } else {
      restartMemcachedServer()
        .then(() => done())
        .catch(done);
    }
  });

  afterAll((done) => {
    if (memcachedServer) {
      memcachedServer.shutdown();
    }
    done();
  });

  it("should handle ECONNREFUSED", (done) => {
    const x = new MemcacheClient({ server: "localhost:65000" });
    let testError: Error;
    x.cmd("stats")
      .catch((err: Error) => (testError = err))
      .then(() => {
        expect(testError.message).toContain("ECONNREFUSED");
        done();
      });
  });

  it("should handle ENOTFOUND", (done) => {
    const x = new MemcacheClient({ server: "badhost.baddomain.com:65000" });
    let testError: Error;
    x.cmd("stats")
      .catch((err: Error) => (testError = err))
      .then(() => {
        expect(testError.message).toContain("ENOTFOUND");
        done();
      });
  });

  it("should handle connection timeout", (done) => {
    const x = new MemcacheClient({ server: "192.168.255.1:8181", connectTimeout: 50 });
    let testError: Error;
    x.cmd("stats")
      .catch((err: Error) => (testError = err))
      .then(() => {
        expect(testError.message).toContain("connect timeout");
        done();
      });
  });

  it(
    "should keep dangle socket and wait for system ETIMEDOUT error",
    (done) => {
      console.log("testing wait system connect ETIMEDOUT - will take a loooong time");
      const x = new MemcacheClient({
        server: "192.168.255.1:8181",
        connectTimeout: 50,
        keepDangleSocket: true,
      });

      let testError: Error;
      const start = Date.now();
      x.cmd("stats")
        .catch((err: Error) => (testError = err))
        .then(() => {
          expect(testError.message).toContain("connect timeout");
        })
        .then(() => {
          return new Promise((resolve: () => void) => {
            x.on("dangle-wait", (data: DangleWaitResponse) => {
              expect(data.err).not.toBeNull();
              expect(data.err?.message).toContain("connect ETIMEDOUT");
              sysConnectTimeout = Date.now() - start;
              resolve();
              done();
            });
          });
        });
    },
    10 * 60 * 1000
  );

  it(
    "should not get system ETIMEDOUT error after custom connect timeout",
    (done) => {
      console.log(
        "testing no system connect ETIMEDOUT after custom connect timeout - will take a loooong time"
      );
      // make sure system connect timeout has been detected
      expect(sysConnectTimeout).toBeGreaterThan(0);
      const x = new MemcacheClient({
        server: "192.168.255.1:8181",
        connectTimeout: 50,
      });

      let testError: Error;
      x.cmd("stats")
        .catch((err: Error) => (testError = err))
        .then(() => {
          expect(testError.message).toContain("connect timeout");
        })
        .then(() => {
          // wait detected system connect timeout plus 10 seconds
          return Promise.delay(sysConnectTimeout + 10000).then(done);
        });
    },
    10 * 60 * 1000
  );

  it("should timeout dangle wait", (done) => {
    const x = new MemcacheClient({
      server: "192.168.255.1:8181",
      connectTimeout: 50,
      keepDangleSocket: true,
      dangleSocketWaitTimeout: 100,
    });

    let testError: Error;
    x.cmd("stats")
      .catch((err: Error) => (testError = err))
      .then(() => {
        expect(testError.message).toContain("connect timeout");
      })
      .then(() => {
        return new Promise((resolve: () => void) =>
          x.on("dangle-wait", (data: DangleWaitResponse) => {
            expect(data.type).toEqual("timeout");
            resolve();
            done();
          })
        );
      });
  });

  it("should take a custom logger if it's not undefined", () => {
    const x = new MemcacheClient({ server, logger: null });
    expect(x._logger).toBeNull();
  });

  it("should use callback on get and set", (done) => {
    const x = new MemcacheClient({ server });
    const key = `foo_${Date.now()}`;
    x.set(key, "bar", (err?: Error | null) => {
      expect(err).toBeNull();
      x.get(key, (gerr, data) => {
        expect(gerr).toBeNull();
        expect(data?.value).toEqual("bar");
        x.shutdown();
        done();
      });
    });
  });

  it("should use callback for send", (done) => {
    const x = new MemcacheClient({ server });
    const key = `foo_${Date.now()}`;
    x.send(`set ${key} 0 0 5\r\nhello\r\n`, {}, (err, data) => {
      expect(err).toBeNull();
      expect(data).toEqual(["STORED"]);
      x.send(`get ${key}\r\n`, (gerr, v) => {
        expect(gerr).toBeNull();
        expect(v[key].value).toEqual("hello");
        x.shutdown();
        done();
      });
    });
  });

  it("should set value with custom lifetime", () => {
    const x = new MemcacheClient({ server });
    let testOptions: Record<string, string | number> = {};
    (x._callbackSend as unknown) = (data: unknown, options: Record<string, string | number>) =>
      (testOptions = options);
    const key = `foo_${Date.now()}`;
    x.set(key, "bar", { lifetime: 500 });
    expect(testOptions?.lifetime).toEqual(500);
  });

  it("should ignore NOT_STORED reply for set if client ignore option is true", (done) => {
    const x = new MemcacheClient({ server, ignoreNotStored: true });
    memcachedServer.asyncMode(true);
    x.set("key", "data").finally(() => {
      memcachedServer.asyncMode(false);
      done();
    });
  });

  it("should ignore NOT_STORED reply for set if command ignore option is true", (done) => {
    const x = new MemcacheClient({ server });
    memcachedServer.asyncMode(true);
    x.set("key", "data", { ignoreNotStored: true }).finally(() => {
      memcachedServer.asyncMode(false);
      done();
    });
  });

  it("should return set errors other than NOT_STORED even if ignore option is true", (done) => {
    startSingleServer().then(async (singleServer) => {
      const x = new MemcacheClient({
        server: singleServer.serverUrl,
        ignoreNotStored: true,
        cmdTimeout: 100,
      });

      let testErr: Error;
      // At least one command needs to be executed before calling a pause method as
      // any new connection can take 2ms to be added into server's array
      x.set("foo", "bar")
        .then(() => {
          // if this pause is called before the first set, it would break very bad
          singleServer.server.pause();

          return x.set("key", "data");
        })
        .catch((err: Error) => (testErr = err))
        .then(() => {
          expect(testErr?.message).toEqual("Command timeout");
        })
        .finally(() => {
          singleServer.server.shutdown();
          done();
        });
    });
  });

  it("should not enable TCP_NODELAY by default", async () => {
    const _setNoDelay = Socket.prototype.setNoDelay;
    const mockNoDelay = jest.fn();
    const x = new MemcacheClient({ server });

    try {
      Socket.prototype.setNoDelay = mockNoDelay;
      await x.set("foo", "bar");
    } finally {
      Socket.prototype.setNoDelay = _setNoDelay;
      x.shutdown();
    }

    expect(mockNoDelay).not.toHaveBeenCalled();
  });

  it("should enable TCP_NODELAY when options.noDelay is true", async () => {
    const _setNoDelay = Socket.prototype.setNoDelay;
    const mockNoDelay = jest.fn();
    const x = new MemcacheClient({ server, noDelay: true });

    try {
      Socket.prototype.setNoDelay = mockNoDelay;
      await x.set("foo", "bar");
    } finally {
      Socket.prototype.setNoDelay = _setNoDelay;
      x.shutdown();
    }

    expect(mockNoDelay).toHaveBeenCalled();
  });

  const testMulti = (maxConnections: number = 1, done: () => void) => {
    const key1 = "text1维基百科";
    const key2 = "blah";
    const key3 = "text2天津经济技术开发区";
    const key4 = "number4";
    const key5 = "binary5";
    const numValue = 12345;
    const binValue = Buffer.allocUnsafe(1500);
    const jsonData = { 天津经济技术开发区: text2 };

    const expectedConnections =
      maxConnections === undefined ? 1 : maxConnections < 5 ? maxConnections : 5;

    const verifyArrayResults = (results: RetrievalCommandResponse<string>[]) => {
      expect(results[0].value).toEqual(text1);
      expect(results[1].value).toEqual("dingle");
      expect(results[2].value).toEqual(jsonData);
      expect(results[3].value).toEqual(numValue);
      expect(results[4].value).toEqual(binValue);
    };

    const verifyResults = (results: MultiRetrievalResponse<string>) => {
      expect(results[key1].value).toEqual(text1);
      expect(results[key2].value).toEqual("dingle");
      expect(results[key3].value).toEqual(jsonData);
      expect(results[key4].value).toEqual(numValue);
      expect(results[key5].value).toEqual(binValue);
    };

    startSingleServer().then((singleServer) => {
      const x = new MemcacheClient({ server: { server: singleServer.serverUrl, maxConnections } });

      return (
        Promise.all([
          x.set(key1, text1, { compress: true }),
          x.set(key2, "dingle", { compress: false }),
          x.set(key3, jsonData, { compress: true }),
          x.set(key4, numValue),
          x.set(key5, binValue, { compress: true }),
        ])
          .then(() =>
            Promise.all([x.get(key1), x.get(key2), x.get(key3), x.get(key4), x.get(key5)]).then(
              verifyArrayResults
            )
          )
          // TODO: solve this any with a conditional type
          .then(() => x.get([key1, key2, key3, key4, key5]).then(verifyResults as any))
          .then(() =>
            x
              .send<MultiRetrievalResponse<string>>(
                `gets ${key1} ${key2} ${key3} ${key4} ${key5}\r\n`
              )
              .then(verifyResults)
          )
          .then(() =>
            x
              .send<MultiRetrievalResponse<string>>((socket) =>
                socket?.write(`gets ${key1} ${key2} ${key3} ${key4} ${key5}\r\n`)
              )
              .then(verifyResults)
          )
          .then(() => expect(x._servers._getNode().connections.length).toEqual(expectedConnections))
          .finally(() => {
            singleServer.server.shutdown();
            done();
          })
      );
    });
  };

  it("should set and get multiple keys concurrently with default maxConnections", (done) => {
    return testMulti(undefined, done);
  });

  it("should set and get multiple keys concurrently with 1 maxConnections", (done) => {
    return testMulti(1, done);
  });

  it("should set and get multiple keys concurrently with 2 maxConnections", (done) => {
    return testMulti(2, done);
  });

  it("should set and get multiple keys concurrently with 3 maxConnections", (done) => {
    return testMulti(3, done);
  });

  it("should set and get multiple keys concurrently with 4 maxConnections", (done) => {
    return testMulti(4, done);
  });

  it("should set and get multiple keys concurrently with 5 maxConnections", (done) => {
    return testMulti(5, done);
  });

  it("should set and get multiple keys concurrently with 10 maxConnections", (done) => {
    return testMulti(10, done);
  });

  it("should handle error if can't JSON.stringify value", () => {
    const a: Record<string, unknown> = {};
    const b = { a };
    a.b = b;
    const x = new MemcacheClient({ server });
    let testError: Error;
    return x
      .set("foo", a)
      .catch((err: Error) => (testError = err))
      .then(() => {
        expect(testError.message).toContain("circular structure");
      });
  });

  it("should handle error if can't JSON.parse value", (done) => {
    const a: Record<string, unknown> = {};
    const b = { a };
    a.b = b;
    const x = new MemcacheClient({ server });
    const objFlag = ValueFlags.TYPE_JSON;
    let testError: Error;

    x.send(`set foo ${objFlag} 60 5\r\nabcde\r\n`)
      .then(() => x.get("foo"))
      .catch((err: Error) => (testError = err))
      .then(() => {
        expect(testError?.message).toContain("Unexpected token a");
        done();
      });
  });

  it("should gracefully propagate decompress error", (done) => {
    const x = new MemcacheClient({ server });
    const objFlag = ValueFlags.TYPE_JSON | ValueFlags.COMPRESS;
    let testError: Error;

    x.send(`set foo ${objFlag} 60 5\r\nabcde\r\n`)
      .then(() => x.get("foo"))
      .catch((err) => (testError = err))
      .then(() => {
        expect(testError?.message).toContain("unsupported format");
        done();
      });
  });

  it("should gracefully propagate compress error", (done) => {
    const compressor: any = {
      compressSync: () => {
        throw new Error("compress test failure");
      },
      decompressSync: <T>(data: { input: T }) => data,
    };

    const x = new MemcacheClient({ server, compressor });
    const data = Buffer.allocUnsafe(200);
    let testError: Error;
    x.set("foo", data, { compress: true })
      .catch((err: Error) => (testError = err))
      .then(() => {
        expect(testError?.message).toEqual("compress test failure");
        done();
      });
  });

  it("should handle two thousand bad servers", (done) => {
    console.log("testing 2000 bad servers - will take a long time");
    const servers: Array<SingleServerEntry> = [];
    let port = 30000;
    while (servers.length < 2000) {
      port++;
      if (port !== serverPort) {
        servers.push({ server: `127.0.0.1:${port}`, maxConnections: 3 });
      }
    }
    let testErr: Error;
    const x = new MemcacheClient({ server: { servers }, cmdTimeout: 20000 });
    x.set("foo", "hello")
      .catch((err: Error) => (testErr = err))
      .then(() => expect(testErr.message).toContain("ECONNREFUSED"))
      .then(() => expect(x._servers._servers).toHaveLength(1))
      .finally(done);
  }, 30000);

  it("should set a binary file and get it back correctly", (done) => {
    const key1 = `image_${Date.now()}`;
    const key2 = `image_${Date.now()}`;
    const key3 = `image_${Date.now()}`;
    const thumbsUp = Fs.readFileSync(Path.join(__dirname, "../data/thumbs-up.jpg"));
    const x = new MemcacheClient({ server });

    Promise.all([x.set(key1, thumbsUp), x.set(key2, thumbsUp), x.set(key3, thumbsUp)])
      .then((v: string[]) => {
        expect(v).toEqual([["STORED"], ["STORED"], ["STORED"]]);
      })
      .then(() =>
        Promise.all([x.get(key1), x.get(key2), x.get(key3)]).then(
          (r: Array<Record<string, unknown>>) => {
            expect(r[0].value).toEqual(thumbsUp);
            expect(r[1].value).toEqual(thumbsUp);
            expect(r[2].value).toEqual(thumbsUp);
          }
        )
      )
      .finally(() => {
        x.shutdown();
        done();
      });
  });

  it("should add an entry and then get NOT_STORED when add it again", (done) => {
    let addErr: Error;
    const x = new MemcacheClient({ server });
    const key = `poem1-风柔日薄春犹早_${Date.now()}`;
    Promise.try(() => x.add(key, poem1))
      .then(() => x.get(key))
      .then((r: RetrievalCommandResponse<string>) => expect(r.value).toEqual(poem1))
      .then(() => x.add(key, poem1))
      .catch((err: Error) => (addErr = err))
      .then(() => expect(addErr.message).toEqual("NOT_STORED"))
      .finally(() => {
        x.shutdown();
        done();
      });
  });

  const testReplace = (done: () => void, setCompress?: boolean, replaceCompress?: boolean) => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;
    return Promise.try(() => x.set(key, poem2, { compress: setCompress }))
      .then(() => x.get(key))
      .then((r: RetrievalCommandResponse<string>) => expect(r.value).toEqual(poem2))
      .then(() => x.replace(key, poem3, { compress: replaceCompress }))
      .then(() => x.get(key))
      .then((r: RetrievalCommandResponse<string>) => expect(r.value).toEqual(poem3))
      .finally(() => {
        x.shutdown();
        done();
      });
  };

  it("should set an entry and then replace it", (done) => {
    testReplace(done);
  });

  it("should set an entry and then replace it (with compress)", (done) => {
    testReplace(done, undefined, true);
  });

  it("should fail replace non-existing item", (done) => {
    const x = new MemcacheClient({ server });
    const key = `foo_${Date.now()}`;
    let testError: Error;
    x.replace(key, "bar")
      .catch((err: Error) => (testError = err))
      .then(() => {
        expect(testError?.message).toEqual("NOT_STORED");
        done();
      });
  });

  it("should set an entry and then append to it", (done) => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;
    Promise.try(() => x.set(key, poem2))
      .then(() => x.get(key))
      .then((r: RetrievalCommandResponse<string>) => expect(r.value).toEqual(poem2))
      .then(() => x.append(key, poem3))
      .then(() => x.get(key))
      .then((r: RetrievalCommandResponse<string>) => expect(r.value).toEqual(`${poem2}${poem3}`))
      .finally(() => {
        x.shutdown();
        done();
      });
  });

  it("should set an entry and then prepend to it", (done) => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;
    Promise.try(() => x.set(key, poem4))
      .then(() => x.get(key))
      .then((r: RetrievalCommandResponse<string>) => expect(r.value).toEqual(poem4))
      .then(() => x.prepend(key, poem3))
      .then(() => x.get(key))
      .then((r: RetrievalCommandResponse<string>) => expect(r.value).toEqual(`${poem3}${poem4}`))
      .finally(() => {
        x.shutdown();
        done();
      });
  });

  it("should set an entry and then cas it", async () => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;

    try {
      await x.set(key, poem4);
      const getCasResult = await x.gets<string>(key);

      expect(getCasResult.value).toEqual(poem4);
      expect(getCasResult.casUniq).not.toBeNull();

      await x.cas(key, poem5, { casUniq: getCasResult.casUniq, compress: true });
      const getResult = await x.get<string>(key);

      expect(getResult.value).toEqual(poem5);
    } catch (ex) {
      console.error(ex);
    }

    x.shutdown();
  });

  it("should fail cas with an outdated id", async () => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;
    let casError: Error | undefined;

    await x.set(key, poem4);
    const getCasResult = await x.gets(key);
    expect(getCasResult.value).toEqual(poem4);
    expect(getCasResult.casUniq).not.toBeNull();

    try {
      await x.cas(key, poem3, { casUniq: (getCasResult.casUniq as number) + 500 });
    } catch (ex: unknown) {
      casError = ex as Error;
    }

    expect(casError?.message).toEqual("EXISTS");
    x.shutdown();
  });

  it("should incr and decr value", (done) => {
    const x = new MemcacheClient({ server });
    const key = `num_${Date.now()}`;
    Promise.try(() => x.set(key, "12345"))
      .then(() => x.incr(key, 5))
      .then((v: RetrievalCommandResponse<string>) => expect(v).toEqual("12350"))
      .then(() => x.decr(key, 12355))
      .then((v: string) => expect(v).toEqual("0"))
      .finally(() => {
        x.shutdown();
        done();
      });
  });

  it("should set and delete a key", (done) => {
    const x = new MemcacheClient({ server });
    const key = `num_${Date.now()}`;
    Promise.try(() => x.set(key, "12345"))
      .then((r: string[]) => expect(r).toEqual(["STORED"]))
      .then(() => x.get(key))
      .then((v: RetrievalCommandResponse<string>) => expect(v.value).toEqual("12345"))
      .then(() => x.delete(key))
      .then((r: string[]) => expect(r).toEqual(["DELETED"]))
      .then(() => x.get(key))
      .then((v: undefined) => expect(v).toBeUndefined())
      .finally(() => {
        x.shutdown();
        done();
      });
  });

  it("should receive stats", (done) => {
    const x = new MemcacheClient({ server });
    Promise.try(() => x.cmd(`stats`))
      .then((r: StatsCommandResponse) => {
        const stat = r.STAT;
        expect(stat).not.toBeNull();
        expect(Array.isArray(stat)).toBeTruthy();
        expect(stat.length).not.toBe(0);
      })
      .finally(() => {
        x.shutdown();
        done();
      });
  });

  it("should fire and forget if noreply is set", (done) => {
    const x = new MemcacheClient({ server });
    const key = `poem1_${Date.now()}`;
    Promise.try(() => x.set(key, poem1, { noreply: true }))
      .then((v?: string[]) => expect(v).toBeUndefined())
      .then(() => x.get(key))
      .then((v: RetrievalCommandResponse<string>) => expect(v.value).toEqual(poem1))
      .finally(() => {
        x.shutdown();
        done();
      });
  });

  it("should send cmd with fire and forget if noreply is set", (done) => {
    const x = new MemcacheClient({ server });
    const key = `foo_${Date.now()}`;
    Promise.try(() => x.set(key, "1", { noreply: true }))
      .then((v?: string[]) => expect(v).toBeUndefined())
      .then(() => x.get(key))
      .then((v: RetrievalCommandResponse<string>) => expect(v.value).toEqual("1"))
      .then(() => x.cmd(`incr ${key} 5`, { noreply: true }))
      .then((v?: string[]) => expect(v).toBeUndefined())
      .then(() => x.get(key))
      .then((v: RetrievalCommandResponse<string>) => expect(v.value).toEqual("6"))
      .finally(() => {
        x.shutdown();
        done();
      });
  });

  it("should update exptime with touch", (done) => {
    const x = new MemcacheClient({ server });
    const key = `poem1_${Date.now()}`;
    Promise.try(() => x.set(key, poem1, { noreply: true }))
      .then((v?: string[]) => expect(v).toBeUndefined())
      .then(() => x.touch(key, "500"))
      .then((r: string[]) => expect(r).toEqual(["TOUCHED"]))
      .finally(() => {
        x.shutdown();
        done();
      });
  });

  it("should retrieve version", (done) => {
    const x = new MemcacheClient({ server });
    x.version()
      .then((v: string[]) => {
        expect(v[0]).toEqual("VERSION");
        expect(v[1]).not.toBe("");
      })
      .finally(() => {
        x.shutdown();
        done();
      });
  });

  it("should handle ECONNRESET socket error", (done) => {
    if (!memcachedServer) {
      done();
      return;
    }
    let firstConnId = "0";
    const x = new MemcacheClient({ server });
    x.cmd<StatsCommandResponse>("stats")
      .then((v) => {
        firstConnId = v.STAT[2][1];
        x._servers._getNode().connections[0].socket?.emit("error", new Error("ECONNRESET"));
      })
      .then(() => x.cmd<StatsCommandResponse>("stats"))
      .then((v) => {
        expect(firstConnId).not.toBe(0);
        expect(firstConnId).not.toBe(v.STAT[2][1]);
      })
      .finally(() => {
        x.shutdown();
        done();
      });
  });

  it("should handle socket timeout", (done) => {
    if (!memcachedServer) {
      done();
      return;
    }
    let firstConnId = "0";
    const x = new MemcacheClient({ server });
    x.cmd<StatsCommandResponse>("stats")
      .then((v) => {
        firstConnId = v.STAT[2][1];
        x._servers._getNode().connections[0].socket?.emit("timeout");
      })
      .then(() => x.cmd<StatsCommandResponse>("stats"))
      .then((v) => {
        expect(firstConnId).not.toBe(0);
        expect(firstConnId).not.toBe(v.STAT[2][1]);
        done();
      });
  });

  it("should handle command timeout error", (done) => {
    startSingleServer(20000).then((singleServer) => {
      let firstConnId = "0";
      let timeoutError: Error;
      const x = new MemcacheClient({ server: singleServer.serverUrl, cmdTimeout: 100 });
      x.cmd<StatsCommandResponse>("stats")
        .then((v) => {
          firstConnId = v.STAT[2][1];
          singleServer.server.pause();
        })
        .then(() => Promise.all([x.cmd("stats"), x.get("foo"), x.set("test", "data")]))
        .catch((err: Error) => (timeoutError = err))
        .then(async () => {
          expect(timeoutError).not.toBeNull();
          expect(timeoutError?.message).toEqual("Command timeout");
          singleServer.server.unpause();

          return x.cmd<StatsCommandResponse>("stats");
        })
        .then((v) => {
          expect(x._servers._getNode().connections[0]._cmdTimeout).toEqual(100);
          expect(firstConnId).not.toBe(0);
          expect(firstConnId).not.toBe(v.STAT[2][1]);
        })
        .finally(() => {
          singleServer.server.shutdown();
          done();
        });
    });
  }, 10000);

  it("should shutdown without connection", () => {
    const x = new MemcacheClient({ server });
    x.shutdown();
  });

  it("should be able to connect after initial connection failure", (done) => {
    const { port } = memcachedServer._server?.address() as AddressInfo;
    expect(memcachedServer).not.toBeNull();
    memcachedServer.shutdown();
    const x = new MemcacheClient({ server });
    let testErr: Error;
    x.set("test", "hello")
      .catch((err: Error) => (testErr = err))
      .then(() => expect(testErr.message).toContain("ECONNREFUSED"))
      .then(() => restartMemcachedServer(port))
      .then(() => x.set("test", "hello"))
      .then(() =>
        x.get<string>("test").then((r) => {
          expect(r.value).toEqual("hello");
          done();
        })
      );
  });
});
