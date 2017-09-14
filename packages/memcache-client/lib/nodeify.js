"use strict";

function nodeify(promise, callback) {
  if (callback) {
    if (promise.nodeify !== undefined) {
      promise.nodeify(callback);
    } else {
      promise.then(v => callback(null, v), err => callback(err));
    }
  }

  return promise;
}

module.exports = nodeify;
