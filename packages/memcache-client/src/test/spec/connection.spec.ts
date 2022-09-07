import { MemcacheConnection, Status, MemcacheClient, MemcacheNode } from "../..";

describe.only("MemcacheConnection", function () {
  it("waitReady should resolve connect Promise status is CONNECTING", () => {
    const x = new MemcacheConnection({ socketID: 1 } as unknown as MemcacheClient);
    x._connectPromise = "test";
    x._status = Status.CONNECTING;
    expect(x.waitReady()).toBe("test");
  });

  it("waitReady should resolve self if status is READY", (done) => {
    const x = new MemcacheConnection({ socketID: 1 } as unknown as MemcacheClient);
    x._status = Status.READY;
    x.waitReady().then((data) => {
      expect(data).not.toBeUndefined();
      done();
    });
  });

  it("waitReady should fail if status is INIT", () => {
    const x = new MemcacheConnection({ socketID: 1 } as unknown as MemcacheClient);
    x._status = Status.INIT;
    expect(() => x.waitReady()).toThrowError(Error);
  });

  it("getStatuStr should return correct strings", () => {
    const x = new MemcacheConnection({ socketID: 1 } as unknown as MemcacheClient);
    // const Status = Status;
    x._status = Status.INIT;
    expect(x.getStatusStr()).toBe("INIT");
    x._status = Status.CONNECTING;
    expect(x.getStatusStr()).toBe("CONNECTING");
    x._status = Status.READY;
    expect(x.getStatusStr()).toBe("READY");
    x._status = Status.SHUTDOWN;
    expect(x.getStatusStr()).toBe("SHUTDOWN");
    x._status = 0;
    expect(x.getStatusStr()).toBe("UNKNOWN");
  });

  it("cmdAction_ERROR should append message after command", () => {
    const x = new MemcacheConnection({ socketID: 1 } as unknown as MemcacheClient);
    let testError: Error | null | undefined;
    x.queueCommand({
      results: {},
      callback: (error: Error | null | undefined) => (testError = error),
    });
    x.cmdAction_ERROR(["test", "hello", "world"]);
    expect(testError?.message).toBe("test hello world");
  });

  it("cmdAction_undefined should return false for unknown command", () => {
    const x = new MemcacheConnection({ socketID: 1 } as unknown as MemcacheClient);
    expect(x.cmdAction_undefined(["test"])).toBeFalsy();
  });

  it("should not process result if it's been reset", () => {
    const x = new MemcacheConnection({ socketID: 1 } as unknown as MemcacheClient);
    const context = { queuedTime: 0, results: {}, callback: () => null };
    x._reset = true;
    x._cmdQueue.push(context);
    x.receiveResult({
      cmdTokens: ["test", "foo"],
      key: "bar",
    });
  });

  it("dequeueCommand should return dummy cmd if it's shutdown", () => {
    const x = new MemcacheConnection(
      {} as unknown as MemcacheClient,
      {
        socketID: 1,
        endMemcacheConnection: () => undefined,
        endConnection: () => undefined,
      } as unknown as MemcacheNode
    );
    x._shutdown("test");
    expect(x.dequeueCommand()?.callback()).toBe(undefined);
  });

  it("waitDangleSocket should do nothing if socket is falsy", () => {
    const x = new MemcacheConnection(
      {} as unknown as MemcacheClient,
      {
        socketID: 1,
        endMemcacheConnection: () => undefined,
      } as unknown as MemcacheNode
    );
    (x.client as unknown) = {
      emit: () => {
        throw new Error("not expect call from waitDangleSocket");
      },
    };
    x.waitDangleSocket();
  });

  it("should not handle command action result if it's not ready", () => {
    const x = new MemcacheConnection(
      {} as unknown as MemcacheClient,
      {
        socketID: 1,
        endMemcacheConnection: () => undefined,
      } as unknown as MemcacheNode
    );
    x.peekCommand = () => {
      throw new Error("should not call peekCommand");
    };
    x.cmdAction_RESULT();
  });

  it("should only call socket.end in _shutdown if socket is valid", () => {
    const x = new MemcacheConnection(
      {} as unknown as MemcacheClient,
      {
        socketID: 1,
        endMemcacheConnection: () => undefined,
        endConnection: () => undefined,
      } as unknown as MemcacheNode
    );
    x._shutdown("test");
  });
});
