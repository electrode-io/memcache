/* eslint-disable */
var generateRandomString = require("../generate-random-string");
var assert = require("assert");
var measure = require("../measure");
var params = require("./params");

var sizes = params.sizes;
var totalLength = params.totalLength;
var testItems = params.testItems;

var i, x, s, k;
var toJoins = new Array(testItems);

for (i = 0; i < testItems; i++) {
  toJoins[i] = new Array(sizes.length);
  for (s = 0; s < sizes.length; s++) {
    toJoins[i][s] = generateRandomString(sizes[s]);
  }
}

var concated;

measure(100, "buffer concat", {
  pre: () => {
    global.gc();
    concated = new Array(testItems);
  },
  test: () => {
    for (i = 0; i < testItems; i++) {
      concated[i] = toJoins[i].join("");
      assert(concated[i].length === totalLength);
    }
  },
  post: () => {
    concated = undefined;
  }
});
