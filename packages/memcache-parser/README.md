[![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url]
[![Dependency Status][daviddm-image]][daviddm-url] [![devDependency Status][daviddm-dev-image]][daviddm-dev-url]

# memcache-parser

A very efficient memcached ASCII protocol parser by using only NodeJS [Buffer APIs](https://nodejs.org/api/buffer.html).

## Install

```bash
$ npm install memcache-parser --save
```

## Usage

A sample connection for a memcache client to show receiving the `VALUE` data from the response of a `get` command.

```js
const MemcacheParser = require("memcache-parser");

class MemcacheConnection extends MemcacheParser {
  constructor(socket) {
    super();
    socket.on("data", this.onData.bind(this));
  }

  processCmd(cmdTokens) {
    if (cmdTokens[0] === "VALUE") {
      this.initiatePending(cmdTokens, +cmdTokens[3]);
    } else {
      return false; // unknown command
    }
  }

  receiveResult(result) {
    // result: { data, cmd, cmdTokens }
    // cmd: the command that initiate the result data
    // cmdTokens: the tokens of the original command line
    // data: the data for the command cmd
  }
}
```

See memcache-client for more example usage

## License

Apache-2.0 © [Joel Chen](https://github.com/jchip)

[travis-image]: https://travis-ci.org/electrode-io/memcache.svg?branch=master

[travis-url]: https://travis-ci.org/electrode-io/memcache

[npm-image]: https://badge.fury.io/js/memcache-parser.svg

[npm-url]: https://npmjs.org/package/memcache-parser

[daviddm-image]: https://david-dm.org/electrode-io/memcache/status.svg?path=packages/memcache-parser

[daviddm-url]: https://david-dm.org/electrode-io/memcache?path=packages/memcache-parser

[daviddm-dev-image]: https://david-dm.org/electrode-io/memcache/dev-status.svg?path=packages/memcache-parser

[daviddm-dev-url]: https://david-dm.org/electrode-io/memcache?path=packages/memcache-parser
