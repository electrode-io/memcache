"use strict";

const MemcacheServer = require("./lib/memcached-server");

function startServer(options) {
  const x = new MemcacheServer(Object.assign({ port: 0 }, options));
  return x.startup();
}

/* istanbul ignore next */
if (require.main === module) {
  startServer({ port: 11211 });
} else {
  module.exports = {
    startServer,
    MemcacheServer
  };
}
