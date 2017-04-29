"use strict";

const Connection = require("../../lib/connection");

describe("connection", function () {
  it("waitReady should resolve connect Promise status is CONNECTING", () => {
    const x = new Connection({ socketID: 1 });
    x._connectPromise = "test";
    x._status = Connection.Status.CONNECTING;
    expect(x.waitReady()).to.equal("test");
  });

  it("waitReady should resolve self if status is READY", () => {
    const x = new Connection({ socketID: 1 });
    x._status = Connection.Status.READY;
    expect(x.waitReady().isFulfilled()).to.be.true;
  });

  it("waitReady should fail if status is INIT", () => {
    const x = new Connection({ socketID: 1 });
    x._status = Connection.Status.INIT;
    expect(() => x.waitReady()).to.throw(Error);
  });

  it("getStatuStr should return correct strings", () => {
    const x = new Connection({ socketID: 1 });
    const Status = Connection.Status;
    x._status = Status.INIT;
    expect(x.getStatusStr()).to.equal("INIT");
    x._status = Status.CONNECTING;
    expect(x.getStatusStr()).to.equal("CONNECTING");
    x._status = Status.READY;
    expect(x.getStatusStr()).to.equal("READY");
    x._status = Status.SHUTDOWN;
    expect(x.getStatusStr()).to.equal("SHUTDOWN");
    x._status = 0;
    expect(x.getStatusStr()).to.equal("UNKNOWN");
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
    const x = new Connection({}, { socketID: 1, endConnection: () => undefined });
    x._shutdown("test");
  });
});
