/* eslint-disable */

module.exports = function (count, tag, suite) {
  var i, start, end, total = [0, 0];
  for (i = 0; i < count; i++) {
    suite.pre();
    start = process.hrtime();
    suite.test();
    end = process.hrtime(start);
    suite.post();
    total[0] += end[0];
    total[1] += end[1] / 1000000000;
  }
  var secs = total[0] / count + total[1] / count;
  console.log(tag, secs + " secs");
};
