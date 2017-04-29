/* eslint-disable */
function generateRandomString(size) {
  var x = new Array(size - 2);
  var i;
  for (i = 0; i < size - 2; i++) {
    x[i] = String.fromCharCode(Math.ceil(65 + (Math.random() * 26)));
  }
  return "\r\n" + x.join("");
}

module.exports = generateRandomString;
