"use strict";

const chai = require("chai");
const expect = chai.expect;
const nodeify = require("../../lib/nodeify");
const Bluebird = require("bluebird");

describe("nodeify", function() {
  const testResolveCallback = (Promise, done) => {
    const promise = Promise.resolve(10);
    nodeify(promise, (err, v) => {
      expect(v).to.equal(10);
      done();
    });
  };

  const testRejectCallback = (Promise, done) => {
    const promise = Promise.reject(new Error("test"));
    nodeify(promise, err => {
      expect(err.message).to.equal("test");
      done();
    });
  };

  it("should use callback for resolve if available", done => {
    testResolveCallback(Promise, done);
  });

  it("should use callback for reject if available", done => {
    testRejectCallback(Promise, done);
  });

  it("should use Promise.nodeify for resolve if available", done => {
    testResolveCallback(Bluebird, done);
  });

  it("should use Promise.nodeify for reject if available", done => {
    testRejectCallback(Bluebird, done);
  });

  it("should not nodeify w/o callback", () => {
    const promise = Promise.resolve(10);
    return nodeify(promise).then(v => expect(v).to.equal(10));
  });
});
