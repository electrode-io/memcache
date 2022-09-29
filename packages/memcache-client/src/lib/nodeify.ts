import { ErrorFirstCallback } from "../types";

export type CallbackablePromise<T extends any> = Promise<T> & {
  nodeify?: (callback: ErrorFirstCallback) => void;
};

export default function nodeify(
  promise: CallbackablePromise<unknown>,
  callback?: ErrorFirstCallback
): Promise<unknown> {
  if (callback) {
    if (promise.nodeify !== undefined) {
      promise.nodeify(callback);
    } else {
      promise.then(
        (v) => callback(null, v),
        (err: Error) => callback(err)
      );
    }
  }

  return promise;
}
