"use strict";

const Connection = require("../../lib/connection");

describe("connection", function () {
  it("waitReady should self if ready flag is true", () => {
    const x = new Connection({ socketID: 1 });
    x.ready = true;
    expect(x.waitReady().isFulfilled()).to.be.true;
  });

  it("cmdAction_ERROR should append message after command", () => {
    const x = new Connection({ socketID: 1 });
    let testError;
    x.queueCommand({
      callback: (error) => (testError = error)
    });
    x.cmdAction_ERROR(["test", "hello", "world"]);
    expect(testError.message).to.equal("test hello world");
  });

  it("cmdAction_undefined should return false for unknown command", () => {
    const x = new Connection({ socketID: 1 });
    expect(x.cmdAction_undefined(["test"])).to.be.false;
  });

  it("should not process result if it's been reset", () => {
    const x = new Connection({ socketID: 1 });
    const context = {};
    x._reset = true;
    x._cmdQueue.push(context);
    x.receiveResult({
      cmdTokens: ["test", "foo"]
    });
  });

  it("should only call socket.end in _shutdown if socket is valid", () => {
    const x = new Connection({ socketID: 1, endConnection: () => undefined });
    x._shutdown("test");
  });
});
