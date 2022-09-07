import nodeify, { CallbackablePromise } from "../../lib/nodeify";
const Bluebird = require("bluebird"); // eslint-disable-line

describe("nodeify", function () {
  const testResolveCallback = (Promise: PromiseConstructor, done: () => void) => {
    const promise = Promise.resolve(10);
    nodeify(promise as unknown as CallbackablePromise<number>, (err, v) => {
      expect(v).toEqual(10);
      done();
    });
  };

  const testRejectCallback = (Promise: PromiseConstructor, done: () => void) => {
    const promise = Promise.reject(new Error("test"));
    nodeify(promise as unknown as CallbackablePromise<string>, (err) => {
      expect(err?.message).toEqual("test");
      done();
    });
  };

  it("should use callback for resolve if available", (done) => {
    testResolveCallback(Promise, done);
  });

  it("should use callback for reject if available", (done) => {
    testRejectCallback(Promise, done);
  });

  it("should use Promise.nodeify for resolve if available", (done) => {
    testResolveCallback(Bluebird, done);
  });

  it("should use Promise.nodeify for reject if available", (done) => {
    testRejectCallback(Bluebird, done);
  });

  it("should not nodeify w/o callback", () => {
    const promise = Promise.resolve(10);
    return nodeify(promise as unknown as CallbackablePromise<number>).then((v) =>
      expect(v).toEqual(10)
    );
  });
});
