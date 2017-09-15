"use strict";

/* eslint-disable no-bitwise,no-unused-vars,no-irregular-whitespace,no-nested-ternary */

const MemcacheClient = require("../..");
const chai = require("chai");
const expect = chai.expect;
const Promise = require("bluebird");
const Fs = require("fs");
const Path = require("path");
const memcached = require("memcached-njs");
const text = require("../data/text");
const ValueFlags = require("../../lib/value-flags");

describe("memcache client", function() {
  process.on("unhandledRejection", e => {
    console.log("unhandledRejection", e);
  });

  let memcachedServer;
  let server;
  let serverPort;

  const text1 = text.text1;
  const text2 = text.text2;
  const poem1 = text.poem1;
  const poem2 = text.poem2;
  const poem3 = text.poem3;
  const poem4 = text.poem4;
  const poem5 = text.poem5;

  const restartMemcachedServer = port => {
    if (memcachedServer) {
      memcachedServer.shutdown();
    }
    const options = { logger: require("../../lib/null-logger") };
    if (port) {
      options.port = port;
    }
    return memcached.startServer(options).then(ms => {
      console.log("memcached server started");
      serverPort = ms._server.address().port;
      server = `localhost:${serverPort}`;
      memcachedServer = ms;
    });
  };

  before(done => {
    if (process.env.MEMCACHED_SERVER) {
      server = process.env.MEMCACHED_SERVER;
      done();
    } else {
      restartMemcachedServer()
        .then(() => done())
        .catch(done);
    }
  });

  after(done => {
    if (memcachedServer) {
      memcachedServer.shutdown();
    }
    done();
  });

  it("should handle ECONNREFUSED", () => {
    const x = new MemcacheClient({ server: "localhost:65000" });
    let testError;
    return x
      .cmd("stats")
      .catch(err => (testError = err))
      .then(() => expect(testError.message).includes("ECONNREFUSED"));
  });

  it("should handle ENOTFOUND", () => {
    const x = new MemcacheClient({ server: "badhost.baddomain.com:65000" });
    let testError;
    return x
      .cmd("stats")
      .catch(err => (testError = err))
      .then(() => expect(testError.message).includes("ENOTFOUND"));
  });

  it("should handle connection timeout", () => {
    const x = new MemcacheClient({ server: "192.168.255.1:8181", connectTimeout: 50 });
    let testError;
    return x
      .cmd("stats")
      .catch(err => (testError = err))
      .then(() => expect(testError.message).includes("connect timeout"));
  });

  it("should take a custom logger if it's not undefined", () => {
    const x = new MemcacheClient({ server, logger: null });
    expect(x._logger).to.be.null;
  });

  it("should use callback on get and set", done => {
    const x = new MemcacheClient({ server });
    const key = `foo_${Date.now()}`;
    x.set(key, "bar", err => {
      expect(err).to.be.not.ok;
      x.get(key, (gerr, data) => {
        expect(gerr).to.be.not.ok;
        expect(data.value).to.equal("bar");
        x.shutdown();
        done();
      });
    });
  });

  it("should use callback for send", done => {
    const x = new MemcacheClient({ server });
    const key = `foo_${Date.now()}`;
    x.send(`set ${key} 0 0 5\r\nhello\r\n`, "bar", (err, data) => {
      expect(err).to.be.not.ok;
      expect(data).to.deep.equal(["STORED"]);
      x.send(`get ${key}\r\n`, (gerr, v) => {
        expect(gerr).to.be.not.ok;
        expect(v[key].value).to.equal("hello");
        x.shutdown();
        done();
      });
    });
  });

  it("should set value with custom lifetime", () => {
    const x = new MemcacheClient({ server });
    let testOptions;
    x._callbackSend = (data, options) => (testOptions = options);
    const key = `foo_${Date.now()}`;
    x.set(key, "bar", { lifetime: 500 });
    expect(testOptions.lifetime).to.equal(500);
  });

  it("should ignore NOT_STORED reply for set if client ignore option is true", () => {
    const x = new MemcacheClient({ server, ignoreNotStored: true });
    memcachedServer.asyncMode(true);
    return x.set("key", "data").finally(() => memcachedServer.asyncMode(false));
  });

  it("should ignore NOT_STORED reply for set if command ignore option is true", () => {
    const x = new MemcacheClient({ server });
    memcachedServer.asyncMode(true);
    return x
      .set("key", "data", { ignoreNotStored: true })
      .finally(() => memcachedServer.asyncMode(false));
  });

  it("should return set errors other than NOT_STORED even if ignore option is true", () => {
    const x = new MemcacheClient({ server, ignoreNotStored: true, cmdTimeout: 100 });
    memcachedServer.pause();
    let testErr;
    return x
      .set("key", "data")
      .catch(err => (testErr = err))
      .then(() => {
        expect(testErr.message).to.equal("Command timeout");
      })
      .finally(() => memcachedServer.unpause());
  });

  const testMulti = maxConnections => {
    const key1 = "text1维基百科";
    const key2 = "blah";
    const key3 = "text2天津经济技术开发区";
    const key4 = "number4";
    const key5 = "binary5";
    const numValue = 12345;
    const binValue = Buffer.allocUnsafe(1500);
    const jsonData = { 天津经济技术开发区: text2 };
    const x = new MemcacheClient({ server: { server, maxConnections } });

    const expectedConnections =
      maxConnections === undefined ? 1 : maxConnections < 5 ? maxConnections : 5;

    const verifyArrayResults = results => {
      expect(results[0].value).to.equal(text1);
      expect(results[1].value).to.equal("dingle");
      expect(results[2].value).to.deep.equal(jsonData);
      expect(results[3].value).to.equal(numValue);
      expect(results[4].value).to.deep.equal(binValue);
    };

    const verifyResults = results => {
      expect(results[key1].value).to.equal(text1);
      expect(results[key2].value).to.equal("dingle");
      expect(results[key3].value).to.deep.equal(jsonData);
      expect(results[key4].value).to.equal(numValue);
      expect(results[key5].value).to.deep.equal(binValue);
    };

    return Promise.all([
      x.set(key1, text1, { compress: true }),
      x.set(key2, "dingle", { compress: false }),
      x.set(key3, jsonData, { compress: true }),
      x.set(key4, numValue),
      x.set(key5, binValue, { compress: true })
    ])
      .then(() =>
        Promise.all([x.get(key1), x.get(key2), x.get(key3), x.get(key4), x.get(key5)]).then(
          verifyArrayResults
        )
      )
      .then(() => x.get([key1, key2, key3, key4, key5]).then(verifyResults))
      .then(() => x.send(`gets ${key1} ${key2} ${key3} ${key4} ${key5}\r\n`).then(verifyResults))
      .then(() =>
        x
          .send(socket => socket.write(`gets ${key1} ${key2} ${key3} ${key4} ${key5}\r\n`))
          .then(verifyResults)
      )
      .then(() => expect(x._servers._getNode().connections.length).to.equal(expectedConnections))
      .finally(() => x.shutdown());
  };

  it("should set and get multiple keys concurrently with default maxConnections", () => {
    return testMulti();
  });

  it("should set and get multiple keys concurrently with 1 maxConnections", () => {
    return testMulti(1);
  });

  it("should set and get multiple keys concurrently with 2 maxConnections", () => {
    return testMulti(2);
  });

  it("should set and get multiple keys concurrently with 3 maxConnections", () => {
    return testMulti(3);
  });

  it("should set and get multiple keys concurrently with 4 maxConnections", () => {
    return testMulti(4);
  });

  it("should set and get multiple keys concurrently with 5 maxConnections", () => {
    return testMulti(5);
  });

  it("should set and get multiple keys concurrently with 10 maxConnections", () => {
    return testMulti(10);
  });

  it("should handle error if can't JSON.stringify value", () => {
    const a = {};
    const b = { a };
    a.b = b;
    const x = new MemcacheClient({ server });
    let testError;
    return x
      .set("foo", a)
      .catch(err => (testError = err))
      .then(() => {
        expect(testError.message).include("circular structure");
      });
  });

  it("should handle error if can't JSON.parse value", () => {
    const a = {};
    const b = { a };
    a.b = b;
    const x = new MemcacheClient({ server });
    const objFlag = ValueFlags.TYPE_JSON;
    let testError;
    return x
      .send(`set foo ${objFlag} 60 5\r\nabcde\r\n`)
      .then(() => x.get("foo"))
      .catch(err => (testError = err))
      .then(r => {
        expect(testError.message).include("Unexpected token a");
      });
  });

  it("should gracefully propagate decompress error", () => {
    const x = new MemcacheClient({ server });
    const objFlag = ValueFlags.TYPE_JSON | ValueFlags.COMPRESS;
    let testError;
    return x
      .send(`set foo ${objFlag} 60 5\r\nabcde\r\n`)
      .then(() => x.get("foo"))
      .catch(err => (testError = err))
      .then(r => {
        expect(testError.message).include("Unknown frame descriptor");
      });
  });

  it("should gracefully propagate compress error", () => {
    const compressor = {
      compressSync: () => {
        throw new Error("compress test failure");
      }
    };

    const x = new MemcacheClient({ server, compressor });
    const data = Buffer.allocUnsafe(200);
    let testError;
    return x
      .set("foo", data, { compress: true })
      .catch(err => (testError = err))
      .then(r => {
        expect(testError.message).to.equal("compress test failure");
      });
  });

  it("should handle two thousand bad servers", () => {
    console.log("testing 2000 bad servers - will take a long time");
    const servers = [];
    let port = 30000;
    while (servers.length < 2000) {
      port++;
      if (port !== serverPort) {
        servers.push({ server: `127.0.0.1:${port}`, maxConnections: 3 });
      }
    }
    let testErr;
    const x = new MemcacheClient({ server: { servers }, cmdTimeout: 20000 });
    return x
      .set("foo", "hello")
      .catch(err => (testErr = err))
      .then(() => expect(testErr.message).include("ECONNREFUSED"))
      .then(() => expect(x._servers._servers).to.have.length(1));
  }).timeout(30000);

  it("should set a binary file and get it back correctly", () => {
    const key1 = `image_${Date.now()}`;
    const key2 = `image_${Date.now()}`;
    const key3 = `image_${Date.now()}`;
    const thumbsUp = Fs.readFileSync(Path.join(__dirname, "../data/thumbs-up.jpg"));
    const x = new MemcacheClient({ server });

    return Promise.all([x.set(key1, thumbsUp), x.set(key2, thumbsUp), x.set(key3, thumbsUp)])
      .then(v => {
        expect(v).to.deep.equal([["STORED"], ["STORED"], ["STORED"]]);
      })
      .then(() =>
        Promise.all([x.get(key1), x.get(key2), x.get(key3)]).then(r => {
          expect(r[0].value).to.deep.equal(thumbsUp);
          expect(r[1].value).to.deep.equal(thumbsUp);
          expect(r[2].value).to.deep.equal(thumbsUp);
        })
      )
      .finally(() => x.shutdown());
  });

  it("should add an entry and then get NOT_STORED when add it again", () => {
    let addErr;
    const x = new MemcacheClient({ server });
    const key = `poem1-风柔日薄春犹早_${Date.now()}`;
    return Promise.try(() => x.add(key, poem1))
      .then(() => x.get(key))
      .then(r => expect(r.value).to.equal(poem1))
      .then(() => x.add(key, poem1))
      .catch(err => (addErr = err))
      .then(() => expect(addErr.message).to.equal("NOT_STORED"))
      .finally(() => x.shutdown());
  });

  const testReplace = (setCompress, replaceCompress) => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;
    return Promise.try(() => x.set(key, poem2, { compress: setCompress }))
      .then(() => x.get(key))
      .then(r => expect(r.value).to.equal(poem2))
      .then(() => x.replace(key, poem3, { compress: replaceCompress }))
      .then(() => x.get(key))
      .then(r => expect(r.value).to.equal(poem3))
      .finally(() => x.shutdown());
  };

  it("should set an entry and then replace it", () => {
    return testReplace();
  });

  it("should set an entry and then replace it (with compress)", () => {
    return testReplace(undefined, true);
  });

  it("should fail replace non-existing item", () => {
    const x = new MemcacheClient({ server });
    const key = `foo_${Date.now()}`;
    let testError;
    return x
      .replace(key, "bar")
      .catch(err => (testError = err))
      .then(r => expect(testError.message).to.equal("NOT_STORED"));
  });

  it("should set an entry and then append to it", () => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;
    return Promise.try(() => x.set(key, poem2))
      .then(() => x.get(key))
      .then(r => expect(r.value).to.equal(poem2))
      .then(() => x.append(key, poem3))
      .then(() => x.get(key))
      .then(r => expect(r.value).to.equal(`${poem2}${poem3}`))
      .finally(() => x.shutdown());
  });

  it("should set an entry and then prepend to it", () => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;
    return Promise.try(() => x.set(key, poem4))
      .then(() => x.get(key))
      .then(r => expect(r.value).to.equal(poem4))
      .then(() => x.prepend(key, poem3))
      .then(() => x.get(key))
      .then(r => expect(r.value).to.equal(`${poem3}${poem4}`))
      .finally(() => x.shutdown());
  });

  it("should set an entry and then cas it", () => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;
    return Promise.try(() => x.set(key, poem4))
      .then(() => x.gets(key))
      .tap(r => expect(r.value).to.equal(poem4))
      .tap(r => expect(r.casUniq).to.be.ok)
      .then(r => x.cas(key, poem5, { casUniq: r.casUniq, compress: true }))
      .then(() => x.get(key))
      .then(r => expect(r.value).to.equal(poem5))
      .finally(() => x.shutdown());
  });

  it("should fail cas with an outdated id", () => {
    const x = new MemcacheClient({ server });
    const key = `poem_${Date.now()}`;
    let casError;
    return Promise.try(() => x.set(key, poem4))
      .then(() => x.gets(key))
      .tap(r => expect(r.value).to.equal(poem4))
      .tap(r => expect(r.casUniq).to.be.ok)
      .then(r => x.cas(key, poem3, { casUniq: r.casUniq + 500 }))
      .catch(err => (casError = err))
      .then(() => expect(casError.message).to.equal("EXISTS"))
      .finally(() => x.shutdown());
  });

  it("should incr and decr value", () => {
    const x = new MemcacheClient({ server });
    const key = `num_${Date.now()}`;
    return Promise.try(() => x.set(key, "12345"))
      .then(() => x.incr(key, 5))
      .then(v => expect(v).to.equal("12350"))
      .then(() => x.decr(key, 12355))
      .then(v => expect(v).to.equal("0"))
      .finally(() => x.shutdown());
  });

  it("should set and delete a key", () => {
    const x = new MemcacheClient({ server });
    const key = `num_${Date.now()}`;
    return Promise.try(() => x.set(key, "12345"))
      .then(r => expect(r).to.deep.equal(["STORED"]))
      .then(() => x.get(key))
      .then(v => expect(v.value).to.equal("12345"))
      .then(() => x.delete(key))
      .then(r => expect(r).to.deep.equal(["DELETED"]))
      .then(() => x.get(key))
      .then(v => expect(v).to.be.undefined)
      .finally(() => x.shutdown());
  });

  it("should receive stats", () => {
    const x = new MemcacheClient({ server });
    const key = `num_${Date.now()}`;
    return Promise.try(() => x.cmd(`stats`))
      .then(r => {
        const stat = r.STAT;
        expect(stat).to.be.ok;
        expect(stat).to.be.an("array");
        expect(stat).to.not.be.empty;
      })
      .finally(() => x.shutdown());
  });

  it("should fire and forget if noreply is set", () => {
    const x = new MemcacheClient({ server });
    const key = `poem1_${Date.now()}`;
    return Promise.try(() => x.set(key, poem1, { noreply: true }))
      .then(v => expect(v).to.be.undefined)
      .then(() => x.get(key))
      .then(v => expect(v.value).to.deep.equal(poem1))
      .finally(() => x.shutdown());
  });

  it("should send cmd with fire and forget if noreply is set", () => {
    const x = new MemcacheClient({ server });
    const key = `foo_${Date.now()}`;
    return Promise.try(() => x.set(key, "1", { noreply: true }))
      .then(v => expect(v).to.be.undefined)
      .then(() => x.get(key))
      .then(v => expect(v.value).to.deep.equal("1"))
      .then(() => x.cmd(`incr ${key} 5`, { noreply: true }))
      .then(v => expect(v).to.be.undefined)
      .then(() => x.get(key))
      .then(v => expect(v.value).to.deep.equal("6"))
      .finally(() => x.shutdown());
  });

  it("should update exptime with touch", () => {
    const x = new MemcacheClient({ server });
    const key = `poem1_${Date.now()}`;
    return Promise.try(() => x.set(key, poem1, { noreply: true }))
      .then(v => expect(v).to.be.undefined)
      .then(() => x.touch(key, "500"))
      .then(r => expect(r).to.deep.equal(["TOUCHED"]))
      .finally(() => x.shutdown());
  });

  it("should retrieve version", () => {
    const x = new MemcacheClient({ server });
    return x
      .version()
      .then(v => {
        expect(v[0]).to.equal("VERSION");
        expect(v[1]).to.be.not.empty;
      })
      .finally(() => x.shutdown());
  });

  it("should handle ECONNRESET socket error", () => {
    if (!memcachedServer) {
      return undefined;
    }
    let firstConnId = 0;
    const x = new MemcacheClient({ server });
    return x
      .cmd("stats")
      .then(v => {
        firstConnId = v.STAT[2][1];
        x._servers._getNode().connections[0].socket.emit("error", new Error("ECONNRESET"));
      })
      .then(() => x.cmd("stats"))
      .then(v => {
        expect(firstConnId).to.not.equal(0);
        expect(firstConnId).to.not.equal(v.STAT[2][1]);
      })
      .finally(() => x.shutdown());
  });

  it("should handle socket timeout", () => {
    if (!memcachedServer) {
      return undefined;
    }
    let firstConnId = 0;
    const x = new MemcacheClient({ server });
    return x
      .cmd("stats")
      .then(v => {
        firstConnId = v.STAT[2][1];
        x._servers._getNode().connections[0].socket.emit("timeout");
      })
      .then(() => x.cmd("stats"))
      .then(v => {
        expect(firstConnId).to.not.equal(0);
        expect(firstConnId).to.not.equal(v.STAT[2][1]);
      });
  });

  it("should handle command timeout error", () => {
    if (!memcachedServer) {
      return undefined;
    }
    let firstConnId = 0;
    let timeoutError;
    const x = new MemcacheClient({ server, cmdTimeout: 100 });
    return x
      .cmd("stats")
      .then(v => {
        firstConnId = v.STAT[2][1];
        memcachedServer.pause();
      })
      .then(() => Promise.all([x.cmd("stats"), x.get("foo"), x.set("test", "data")]))
      .catch(err => (timeoutError = err))
      .then(() => {
        expect(timeoutError).to.be.ok;
        expect(timeoutError.message).to.equal("Command timeout");
        memcachedServer.unpause();
        return x.cmd("stats");
      })
      .then(v => {
        expect(x._servers._getNode().connections[0]._cmdTimeout).to.equal(100);
        expect(firstConnId).to.not.equal(0);
        expect(firstConnId).to.not.equal(v.STAT[2][1]);
      })
      .finally(() => memcachedServer.unpause());
  });

  it("should shutdown without connection", () => {
    const x = new MemcacheClient({ server });
    x.shutdown();
  });

  it("should be able to connect after initial connection failure", () => {
    const port = memcachedServer._server.address().port;
    expect(memcachedServer).to.be.OK;
    memcachedServer.shutdown();
    const x = new MemcacheClient({ server });
    let testErr;
    return x
      .set("test", "hello")
      .catch(err => (testErr = err))
      .then(() => expect(testErr.message).include("ECONNREFUSED"))
      .then(() => restartMemcachedServer(port))
      .then(() => x.set("test", "hello"))
      .then(() =>
        x.get("test").then(r => {
          expect(r.value).to.equal("hello");
        })
      );
  });
});
