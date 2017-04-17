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
