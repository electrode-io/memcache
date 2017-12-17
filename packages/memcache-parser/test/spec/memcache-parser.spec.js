"use strict";

const MemcacheParser = require("../..");
const chai = require("chai");
const expect = chai.expect;
const assert = chai.assert;
const nullLogger = require("../null-logger");

/* eslint-disable no-return-assign */

describe("memcache-parser", function() {
  it("should have defaultLogger", () => {
    const x = new MemcacheParser();
    expect(x.logger).to.be.ok;
    x.logger.info("test log");
  });

  it("should accept customLogger", () => {
    const logger = "test";
    expect(new MemcacheParser(logger).logger).to.equal(logger);
  });

  it("should have default processCmd", () => {
    expect(new MemcacheParser(nullLogger).processCmd([1, 2, 3])).to.equal(3);
  });

  it("should have default receiveResult", () => {
    expect(new MemcacheParser(nullLogger).receiveResult("test")).to.equal("test");
  });

  it("should have default malformDataStream", () => {
    let errorMsg;
    const logger = {
      error: msg => (errorMsg = msg)
    };
    new MemcacheParser(logger).malformDataStream({ cmd: "test" }, "12345");
    expect(errorMsg).includes("malformed memcache data stream, cmd: test");
  });

  it("should have default malformDataStream", () => {
    let errorMsg;
    const logger = {
      error: msg => (errorMsg = msg)
    };
    new MemcacheParser(logger).malformDataStream({ cmd: "test" }, "12345");
    expect(errorMsg).includes("malformed memcache data stream, cmd: test");
  });

  it("should have default malformCommand", () => {
    let errorMsg;
    const logger = {
      error: msg => (errorMsg = msg)
    };
    new MemcacheParser(logger).malformCommand();
    expect(errorMsg).includes("malformed command");
  });

  it("should have default unknownCmd", () => {
    let errorMsg;
    const logger = {
      error: msg => (errorMsg = msg)
    };
    new MemcacheParser(logger).unknownCmd(["test"]);
    expect(errorMsg).includes("unknown command: test");
  });

  it("should initiatePending", () => {
    const parser = new MemcacheParser(nullLogger);
    const tokens = ["test", "0", "0", "100"];
    parser.initiatePending(tokens, 100);
    expect(parser._pending).to.be.ok;
    assert(Buffer.isBuffer(parser._pending.data), "pending data is not buffer");
    expect(parser._pending.data.length).to.equal(100);
    expect(parser._pending.filled).to.equal(0);
    expect(parser._pending.cmd).to.equal("test");
    expect(parser._pending.cmdTokens).to.deep.equal(tokens);
  });

  it("_copyPending should ignore undefined data", () => {
    const parser = new MemcacheParser(nullLogger);
    expect(parser._copyPending(undefined)).to.equal(undefined);
  });

  it("_copyPending should throw for null data", () => {
    const parser = new MemcacheParser(nullLogger);
    expect(() => parser._copyPending(null)).to.throw(Error);
  });

  it("should process command", () => {
    const parser = new MemcacheParser(nullLogger);
    let cmdTokens;
    parser.processCmd = tokens => {
      cmdTokens = tokens;
    };
    parser.onData(Buffer.from("test 0 0 100\r\n"));
    expect(cmdTokens).to.deep.equal(["test", "0", "0", "100"]);
  });

  it("should process command in chunks", () => {
    const parser = new MemcacheParser(nullLogger);
    let cmdTokens;
    parser.processCmd = tokens => {
      cmdTokens = tokens;
    };
    parser.onData(Buffer.from("t"));
    expect(parser._cmdBrkLookupOffset).to.equal(0);
    parser.onData(Buffer.from("est 0"));
    expect(parser._cmdBrkLookupOffset).to.equal(5);
    parser.onData(Buffer.from(" 0 100\r"));
    expect(parser._cmdBrkLookupOffset).to.equal(12);
    parser.onData(Buffer.from("\n"));
    expect(cmdTokens).to.deep.equal(["test", "0", "0", "100"]);
  });

  it("should preserve unicode in command line", () => {
    const parser = new MemcacheParser(nullLogger);
    let cmdTokens;
    parser.processCmd = tokens => {
      cmdTokens = tokens;
    };
    parser.onData(Buffer.from("test hello维基百科 0"));
    parser.onData(Buffer.from(" 0 100\r"));
    parser.onData(Buffer.from("\n"));
    expect(cmdTokens).to.deep.equal(["test", "hello维基百科", "0", "0", "100"]);
  });

  it("should error on empty command lines", () => {
    let cmdTokens;
    const parser = new MemcacheParser(nullLogger);
    parser.malformCommand = x => (cmdTokens = x);
    parser.onData(Buffer.from("\r\n"));
    expect(cmdTokens).to.deep.equal([""]);
  });

  it("should error on empty command", () => {
    let cmdTokens;
    const parser = new MemcacheParser(nullLogger);
    parser.malformCommand = x => (cmdTokens = x);
    parser.onData(Buffer.from(" \r\n"));
    expect(cmdTokens).to.deep.equal(["", ""]);
  });

  it("should error on unknown command", () => {
    let cmdTokens;
    const parser = new MemcacheParser(nullLogger);
    parser.processCmd = () => false;
    parser.unknownCmd = x => (cmdTokens = x);
    parser.onData(Buffer.from("test 0 0 30\r\n"));
    expect(cmdTokens).to.deep.equal(["test", "0", "0", "30"]);
  });

  it("should consume pending data in a single chunk", () => {
    let pending;
    const parser = new MemcacheParser(nullLogger);
    parser.processCmd = function(tokens) {
      this.initiatePending(tokens, +tokens[3]);
    };
    parser.receiveResult = x => (pending = x);
    const text = "hello维基百科";
    const byteLen = Buffer.byteLength(text);
    parser.onData(Buffer.from(`test 0 0 ${byteLen}\r\n${text}\r\n`));
    expect(pending.data.length).to.equal(byteLen);
    expect(pending.data.toString()).to.equal(text);
  });

  it("should error when data is not ended in \\r\\n", () => {
    let pending;
    let data;
    let copied;
    const parser = new MemcacheParser(nullLogger);
    parser.processCmd = function(tokens) {
      this.initiatePending(tokens, +tokens[3]);
    };
    parser.malformDataStream = (x, d, n) => {
      pending = x;
      data = d;
      copied = n;
    };
    const text = "hello维基百科";
    const byteLen = Buffer.byteLength(text);
    parser.onData(Buffer.from(`test 0 0 ${byteLen}\r\n${text}\n\r`));
    expect(copied).to.equal(byteLen);
    expect(pending.data.toString()).to.equal(text);
    expect(data.toString()).to.equal(`${text}\n\r`);
  });

  it("should consume pending data in splitted chunks", () => {
    let pending;
    const parser = new MemcacheParser(nullLogger);
    parser.processCmd = function(tokens) {
      this.initiatePending(tokens, +tokens[3]);
    };
    parser.receiveResult = x => (pending = x);
    const text = "hello维基百科";
    const byteLen = Buffer.byteLength(text);
    parser.onData(Buffer.from(`test 0 0 ${byteLen}`));
    parser.onData(Buffer.from(`\r\n${text.substr(0, 5)}`));
    parser.onData(Buffer.from(`${text.substr(5)}`));
    parser.onData(Buffer.from(`\r\n`));
    expect(pending.data.length).to.equal(byteLen);
    expect(pending.data.toString()).to.equal(text);
  });

  it("should handle multiple commands", () => {
    let pending;
    let cmdTokens2;
    const parser = new MemcacheParser(nullLogger);
    parser.processCmd = function(tokens) {
      if (tokens[0] === "set") {
        this.initiatePending(tokens, +tokens[3]);
      } else if (tokens[0] === "get") {
        cmdTokens2 = tokens;
      }
    };
    parser.receiveResult = x => (pending = x);
    const text = "hello维基百科";
    const byteLen = Buffer.byteLength(text);
    parser.onData(Buffer.from(`set 0 0 ${byteLen}`));
    parser.onData(Buffer.from(`\r\n${text.substr(0, 5)}`));
    parser.onData(Buffer.from(`${text.substr(5)}\r\nget `));
    parser.onData(Buffer.from(`foo\r\n`));
    expect(pending.data.length).to.equal(byteLen);
    expect(pending.data.toString()).to.equal(text);
    expect(cmdTokens2).to.deep.equal(["get", "foo"]);
  });

  it("should reset if partial data becomes too long", () => {
    let warnMsg;
    const logger = {
      debug: () => undefined,
      warn: msg => (warnMsg = msg)
    };
    const parser = new MemcacheParser(logger);
    parser.onData(Buffer.from(`set 0 0 50`));
    parser.onData(Buffer.alloc(512));
    parser.onData(Buffer.alloc(2000));
    expect(warnMsg).includes("partial data length 522 and new data length 2522 too big, resetting");
  });
});
