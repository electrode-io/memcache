/* eslint-disable */
var sizes = [
  296,
  822,
  993,
  838,
  585,
  936,
  498,
  529,
  783,
  492
].map((x) => x * 2);

var totalLength = sizes.reduce((a, x) => a + x, 0);
var testItems = 20000;

module.exports = {
  sizes, totalLength, testItems
};
