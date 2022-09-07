import { MemcacheParser, DefaultLogger, ParserPendingData } from "../..";
import nullLogger from "../null-logger";

/* eslint-disable no-return-assign */
describe("memcache-parser", function () {
  it("should have defaultLogger", () => {
    const x = new MemcacheParser();
    expect(x.logger).not.toBeNull();
    x.logger.info("test log");
  });

  it("should accept customLogger", () => {
    const logger = "test";
    expect(new MemcacheParser(logger as unknown as DefaultLogger).logger).toEqual(logger);
  });

  it("should have default processCmd", () => {
    expect(new MemcacheParser(nullLogger).processCmd([1, 2, 3])).toEqual(3);
  });

  it("should have default receiveResult", () => {
    expect(new MemcacheParser(nullLogger).receiveResult("test")).toEqual("test");
  });

  it("should have default malformDataStream", () => {
    let errorMsg;
    const logger = {
      ...nullLogger,
      error: (msg: string) => (errorMsg = msg),
    };
    new MemcacheParser(logger).malformDataStream({ cmd: "test" }, "12345");
    expect(errorMsg).toContain("malformed memcache data stream, cmd: test");
  });

  it("should have default malformDataStream", () => {
    let errorMsg;
    const logger = {
      ...nullLogger,
      error: (msg: string) => (errorMsg = msg),
    };
    new MemcacheParser(logger).malformDataStream({ cmd: "test" }, "12345");
    expect(errorMsg).toContain("malformed memcache data stream, cmd: test");
  });

  it("should have default malformCommand", () => {
    let errorMsg;
    const logger = {
      ...nullLogger,
      error: (msg: string) => (errorMsg = msg),
    };
    new MemcacheParser(logger).malformCommand();
    expect(errorMsg).toContain("malformed command");
  });

  it("should have default unknownCmd", () => {
    let errorMsg;
    const logger = {
      ...nullLogger,
      error: (msg: string) => (errorMsg = msg),
    };
    new MemcacheParser(logger).unknownCmd(["test"]);
    expect(errorMsg).toContain("unknown command: test");
  });

  it("should initiatePending", () => {
    const parser = new MemcacheParser(nullLogger);
    const tokens = ["test", "0", "0", "100"];
    parser.initiatePending(tokens, 100);
    expect(parser._pending).not.toBeNull();
    expect(Buffer.isBuffer(parser._pending?.data)).toBeTruthy();
    expect(parser._pending?.data.length).toEqual(100);
    expect(parser._pending?.filled).toEqual(0);
    expect(parser._pending?.cmd).toEqual("test");
    expect(parser._pending?.cmdTokens).toEqual(tokens);
  });

  it("_copyPending should ignore undefined data", () => {
    const parser = new MemcacheParser(nullLogger);
    expect(parser._copyPending(undefined)).toEqual(undefined);
  });

  it("_copyPending should throw for null data", () => {
    const parser = new MemcacheParser(nullLogger);
    expect(() => parser._copyPending(null as unknown as Buffer)).toThrowError(Error);
  });

  it("should process command", () => {
    const parser = new MemcacheParser(nullLogger);
    let cmdTokens;
    parser.processCmd = (tokens) => {
      cmdTokens = tokens;
      return tokens.length;
    };
    parser.onData(Buffer.from("test 0 0 100\r\n"));
    expect(cmdTokens).toEqual(["test", "0", "0", "100"]);
  });

  it("should process command in chunks", () => {
    const parser = new MemcacheParser(nullLogger);
    let cmdTokens;
    parser.processCmd = (tokens) => {
      cmdTokens = tokens;
      return tokens.length;
    };
    parser.onData(Buffer.from("t"));
    expect(parser._cmdBrkLookupOffset).toEqual(0);
    parser.onData(Buffer.from("est 0"));
    expect(parser._cmdBrkLookupOffset).toEqual(5);
    parser.onData(Buffer.from(" 0 100\r"));
    expect(parser._cmdBrkLookupOffset).toEqual(12);
    parser.onData(Buffer.from("\n"));
    expect(cmdTokens).toEqual(["test", "0", "0", "100"]);
  });

  it("should preserve unicode in command line", () => {
    const parser = new MemcacheParser(nullLogger);
    let cmdTokens;
    parser.processCmd = (tokens) => {
      cmdTokens = tokens;
      return tokens.length;
    };
    parser.onData(Buffer.from("test hello维基百科 0"));
    parser.onData(Buffer.from(" 0 100\r"));
    parser.onData(Buffer.from("\n"));
    expect(cmdTokens).toEqual(["test", "hello维基百科", "0", "0", "100"]);
  });

  it("should error on empty command lines", () => {
    let cmdTokens;
    const parser = new MemcacheParser(nullLogger);
    parser.malformCommand = (x) => (cmdTokens = x);
    parser.onData(Buffer.from("\r\n"));
    expect(cmdTokens).toEqual([""]);
  });

  it("should error on empty command", () => {
    let cmdTokens;
    const parser = new MemcacheParser(nullLogger);
    parser.malformCommand = (x) => (cmdTokens = x);
    parser.onData(Buffer.from(" \r\n"));
    expect(cmdTokens).toEqual(["", ""]);
  });

  it("should error on unknown command", () => {
    let cmdTokens;
    const parser = new MemcacheParser(nullLogger);
    parser.processCmd = () => 0;
    parser.unknownCmd = (x) => (cmdTokens = x);
    parser.onData(Buffer.from("test 0 0 30\r\n"));
    expect(cmdTokens).toEqual(["test", "0", "0", "30"]);
  });

  it("should consume pending data in a single chunk", () => {
    let pending: ParserPendingData = { key: "", cmdTokens: [] };
    const parser = new MemcacheParser(nullLogger);
    parser.processCmd = function (tokens: string[]) {
      this.initiatePending(tokens, +tokens[3]);
      return tokens.length;
    };
    parser.receiveResult = (x) => (pending = x as ParserPendingData);
    const text = "hello维基百科";
    const byteLen = Buffer.byteLength(text);
    parser.onData(Buffer.from(`test 0 0 ${byteLen}\r\n${text}\r\n`));
    expect(pending.data?.length).toEqual(byteLen);
    expect(pending.data?.toString()).toEqual(text);
  });

  it("should error when data is not ended in \\r\\n", () => {
    let pending: ParserPendingData = { key: "", cmdTokens: [] };
    let data: Buffer | string = "";
    let copied;
    const parser = new MemcacheParser(nullLogger);
    parser.processCmd = function (tokens: string[]) {
      this.initiatePending(tokens, +tokens[3]);
      return tokens.length;
    };
    parser.malformDataStream = (x: ParserPendingData, d, n) => {
      pending = x;
      data = d;
      copied = n;
    };
    const text = "hello维基百科";
    const byteLen = Buffer.byteLength(text);
    parser.onData(Buffer.from(`test 0 0 ${byteLen}\r\n${text}\n\r`));
    expect(copied).toEqual(byteLen);
    expect(pending?.data?.toString()).toEqual(text);
    expect(data?.toString()).toEqual(`${text}\n\r`);
  });

  it("should consume pending data in splitted chunks", () => {
    let pending: ParserPendingData = { key: "", cmdTokens: [] };
    const parser = new MemcacheParser(nullLogger);
    parser.processCmd = function (tokens: string[]) {
      this.initiatePending(tokens, +tokens[3]);
      return tokens.length;
    };
    parser.receiveResult = (x) => (pending = x as ParserPendingData);
    const text = "hello维基百科";
    const byteLen = Buffer.byteLength(text);
    parser.onData(Buffer.from(`test 0 0 ${byteLen}`));
    parser.onData(Buffer.from(`\r\n${text.substr(0, 5)}`));
    parser.onData(Buffer.from(`${text.substr(5)}`));
    parser.onData(Buffer.from(`\r\n`));
    expect(pending.data?.length).toEqual(byteLen);
    expect(pending.data?.toString()).toEqual(text);
  });

  it("should handle data with 1 byte left after filling up pending", () => {
    let pending: ParserPendingData = { key: "", cmdTokens: [] };
    const parser = new MemcacheParser(nullLogger);
    parser.processCmd = function (tokens: string[]) {
      this.initiatePending(tokens, +tokens[3]);
      return tokens.length;
    };
    parser.receiveResult = (x) => (pending = x as ParserPendingData);
    const text = "hello维基百科";
    const byteLen = Buffer.byteLength(text);
    parser.onData(Buffer.from(`test 0 0 ${byteLen}`));
    parser.onData(Buffer.from(`\r\n${text.substr(0, 5)}`));
    parser.onData(Buffer.from(`${text.substr(5)}\r`));
    parser.onData(Buffer.from(`\n`));
    expect(pending.data?.length).toEqual(byteLen);
    expect(pending.data?.toString()).toEqual(text);
  });

  it("should handle multiple commands", () => {
    let pending: ParserPendingData = { key: "", cmdTokens: [] };
    let cmdTokens2;
    const parser = new MemcacheParser(nullLogger);
    parser.processCmd = function (tokens: string[]) {
      if (tokens[0] === "set") {
        this.initiatePending(tokens, +tokens[3]);
      } else if (tokens[0] === "get") {
        cmdTokens2 = tokens;
      }

      return tokens.length;
    };
    parser.receiveResult = (x) => (pending = x as ParserPendingData);
    const text = "hello维基百科";
    const byteLen = Buffer.byteLength(text);
    parser.onData(Buffer.from(`set 0 0 ${byteLen}`));
    parser.onData(Buffer.from(`\r\n${text.substr(0, 5)}`));
    parser.onData(Buffer.from(`${text.substr(5)}\r\nget `));
    parser.onData(Buffer.from(`foo\r\n`));
    expect(pending.data?.length).toEqual(byteLen);
    expect(pending.data?.toString()).toEqual(text);
    expect(cmdTokens2).toEqual(["get", "foo"]);
  });

  it("should reset if partial data becomes too long", () => {
    let warnMsg;
    const logger = {
      ...nullLogger,
      debug: () => undefined,
      warn: (msg: string) => (warnMsg = msg),
    };
    const parser = new MemcacheParser(logger);
    parser.onData(Buffer.from(`set 0 0 50`));
    parser.onData(Buffer.alloc(512));
    parser.onData(Buffer.alloc(2000));
    expect(warnMsg).toContain(
      "partial data length 522 and new data length 2522 too big, resetting"
    );
  });
});
