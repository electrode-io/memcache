[![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url]
[![Dependency Status][daviddm-image]][daviddm-url] [![devDependency Status][daviddm-dev-image]][daviddm-dev-url] [![optionalDependency Status][daviddm-opt-image]][daviddm-opt-url]

# memcache-client

NodeJS memcached client with the most efficient ASCII protocol parser.

Primary developed to be used at [@WalmartLabs](http://www.walmartlabs.com/) to power the <http://www.walmart.com> eCommerce site.

## Features

-   Very efficient memcached ASCII protocol parser by using only [NodeJS Buffer APIs](https://nodejs.org/api/buffer.html).
-   Optional compression for the data before sending to memcached
-   Auto reconnects when there's network error or timeout
-   Support sending arbitrary commands.  Read up on the [protocol doc here](https://github.com/memcached/memcached/blob/master/doc/protocol.txt).
-   Support storing `string`, `numeric`, and `JSON` values
-   APIs Support callback or Promise
-   Support fire and forget requests
-   Support multiple connections

## Install

```bash
$ npm i memcache-client --save
```

## Usage

```js
const MemcacheClient = require("memcache-client");
const expect = require("chai").expect;
const server = "localhost:11211";
// create a normal client

const client = new MemcacheClient({ server });

// Create a client that ignores NOT_STORED response (for McRouter AllAsync mode)

const mrClient = new MemcacheClient({ server, ignoreNotStored: true });

// You can specify maxConnections by using an object for server
// Default maxConnections is 1

const mClient = new MemcacheClient({ server: { server, maxConnections: 5 } });

// with callback

client.set("key", "data", (err, r) => { expect(r).to.deep.equal(["STORED"]); });
client.get("key", (err, data) => { expect(data.value).to.equal("data"); });

// with promise

client.set("key", "data").then((r) => expect(r).to.deep.equal(["STORED"]));
client.get("key").then((data) => expect(data.value).to.equal("data"));

// concurrency using promise

Promise.all([client.set("key1", "data1"), client.set("key2", "data2")])
  .then((r) => expect(r).to.deep.equal([["STORED"], ["STORED"]]));
Promise.all([client.get("key1"), client.get("key2")])
  .then((r) => {
    expect(r[0].value).to.equal("data1");
    expect(r[1].value).to.equal("data2");
  });

// get multiple keys

client.get(["key1", "key2"]).then((results) => {
  expect(results["key1"].value).to.equal("data1");
  expect(results["key2"].value).to.equal("data2");
});

// gets and cas

client.gets("key1").then((v) => client.cas("key1", "casData", { casUniq: v.casUniq }));

// enable compression (if data size >= 100 bytes)

const data = Buffer.alloc(500);
client.set("key", data, { compress: true }).then((r) => expect(r).to.deep.equal(["STORED"]));

// fire and forget

client.set("key", data, { noreply: true });

// send any arbitrary command (\r\n will be appended automatically)

client.cmd("stats").then((r) => { console.log(r.STAT) });
client.set("foo", "10", { noreply: true });
client.cmd("incr foo 5").then((v) => expect(+v).to.equal(15));

// you can also send arbitary command with noreply option (noreply will be appended automatically)

client.cmd("incr foo 5", { noreply: true });

// send any arbitrary data (remember \r\n)

client.send("set foo 0 0 5\r\nhello\r\n").then((r) => expect(r).to.deep.equal(["STORED"]));
```

## Commands with a method

All take an optional `callback`.  If it's not provided then all return a `Promise`.

-   `client.get(key, [callback])` or `client.get([key1, key2], [callback])`
-   `client.gets(key, [callback])` or `client.gets([key1, key2], [callback])`
-   `client.set(key, data, [options], [callback])`
-   `client.add(key, data, [options], [callback])`
-   `client.replace(key, data, [options], [callback])`
-   `client.append(key, data, [options], [callback])`
-   `client.prepend(key, data, [options], [callback])`
-   `client.cas(key, data, options, [callback])`
-   `client.delete(key, [options], [callback])`
-   `client.incr(key, value, [options], [callback])`
-   `client.decr(key, value, [options], [callback])`
-   `client.touch(key, exptime, [options], [callback])`
-   `client.version([callback])`

> For all store commands, `set`, `add`, `replace`, `append`, `prepend`, and `cas`, the data can be a `string`, `number`, or a `JSON` object.

### Client Options

The client constructor takes the following values in `options`.

```js
const options = {
  server: { server: "host:port", maxConnections: 3 },
  ignoreNotStored: true, // ignore NOT_STORED response
  lifetime: 100, // TTL 100 seconds
  cmdTimeout: 3000, // command timeout in milliseconds
  connectTimeout: 8000, // connect to server timeout in ms
  compressor: require("custom-compressor"),
  logger: require("./custom-logger")
};

const client = new MemcacheClient(options);
```

-   `server` - **_required_** A string in `host:port` format, or an object:

```js
{ server: "host:port", maxConnections: 3 }
```

> Default `maxConnections` is `1`

-   `ignoreNotStored` - **_optional_** If set to true, then will not treat `NOT_STORED` reply from any store commands as error.  Use this for [Mcrouter AllAsyncRoute] mode.
-   `lifetime` - **_optional_** Your cache TTL in **_seconds_** to use for all entries.  DEFAULT: 60 seconds.
-   `cmdTimeout` - **_optional_** Command timeout in milliseconds.  DEFAULT: 5000 ms.
    -   If a command didn't receive response before this timeout value, then it will cause the connection to shutdown and returns Error.
-   `connectTimeout` - **_optional_** Custom self connect to server timeout in milliseconds.  It's disabled if set to 0.  DEFAULT: 0
    -   The error object from this will have `connecting` set to `true`
-   `keepDangleSocket` - **_optional_** After `connectTimeout` trigger, do not destroy the socket but keep listening for errors on it.  DEFAULT: false
-   `dangleSocketWaitTimeout` - **_optional_** How long to wait for errors on dangle socket before destroying it.  DEFAULT: 5 minutes (30000 milliseconds)
-   `compressor` - **_optional_** a custom compressor for compressing the data.  By default [node-zstd] is used.
    -   It should provide two methods that take `Buffer` value, and return result as `Buffer`.
        -   `compressSync(value)` 
        -   `decompressSync(value)`
-   `logger` - **_optional_** Custom logger like this:

```js
module.exports = {
  debug: (msg) => console.log(msg),
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg)
};
```

#### `connectTimeout`

Note that the `connectTimeout` option is a custom timeout this client adds.  It will preempt
the system's connect timeout, for which you typically get back a `connect ETIMEDOUT` error.

Since from NodeJS there's no way to change the system's connect timeout, which is usually
fairly long, this option allows you to set a shorter timeout.  When it triggers, the client
will shutdown the connection and destroys the socket, and rejects with an error.  The error's
message will be `"connect timeout"` and has the field `connecting` set to true.

If you want to let the system connect timeout to take place, then set this option to 0 to 
completely disable it, or set it to a high value like 10 minutes in milliseconds (60000).

#### Dangle Socket

If you set a small custom `connectTimeout` and do not want to destroy the socket after it 
triggers, then you will end up with a dangling socket.

To enable keeping the dangling socket, set the option `keepDangleSocket` to `true`.

The client will automatically add a new error handler for the socket in case the system's
`ETIMEDOUT` eventually comes back.  The client also sets a timeout to eventually destroy the
socket in case the system never comes back with anything.

To control the dangling wait timeout, use the option `dangleSocketWaitTimeout`.  It's default 
to 5 minutes.

The client will emit the event `dangle-wait` with the following data:

-   Start waiting: `{ type: "wait", socket }`
-   Wait timeout: `{ type: "timeout" }`
-   error received: `{ type: "error", err }`

> Generally it's better to just destroy the socket instead of leaving it dangling.

#### Multiple redundant servers support

If you have multiple redundant servers, you can pass them to the client with the `server` option:

```js
{
  server: {
    servers: [
      { 
        server: "name1.domain.com:11211",
        maxConnections: 3
      },
      {
        server: "name2.domain.com:11211",
        maxConnections: 3
      }
    ],
    config: {
      retryFailedServerInterval: 1000, // milliseconds - how often to check failed servers
      failedServerOutTime: 30000, // (ms) how long a failed server should be out before retrying it
      keepLastServer: false
    }
  }
}
```

You can also pass in `server.config` with the following options:

-   `retryFailedServerInterval` - (ms) how often to check failed servers.  Default 10000 ms (10 secs)
-   `failedServerOutTime` - (ms) how long a failed server should be out before retrying it.  Default 60000 ms (1 min).
-   `keepLastServer` - (boolean) Keep at least one server even if it failed connection.  Default `true`.

### Command Options

#### `noreply`

Almost all commands take a `noreply` field for `options`, which if set to true, then the command is fire & forget for the memcached server.

Obviously this doesn't apply to commands like `get` and `gets`, which exist to retrieve from the server.

#### `lifetime` and `compress`

For all store commands, `set`, `add`, `replace`, `append`, `prepend`, and `cas`, they take:

-   A `lifetime` field that specify the TTL time in **_seconds_** for the entry.  If this is not set, then will try to use client `options.lifetime` or 60 seconds.
-   A `compress` field, which if set to true, will cause any data with size >= 100 bytes to be compressed.
    -   A default compressor using [node-zstd] is provided, but you can set your own compressor when creating the client.

#### `casUniq`

For the `cas` command, `options` must contain a `casUniq` value that you received from an `gets` command you called earlier.

## Other methods

-   `client.send(data, [options], [callback])`
-   `client.xsend(data, [options])`
-   `client.cmd(data, [options], [callback])`
-   `client.store(cmd, key, value, [optons], [callback])`
-   `client.retrieve(cmd, key, [options], [callback])`
-   `client.xretrieve(cmd, key)`

## License

Apache-2.0 © [Joel Chen](https://github.com/jchip)

[travis-image]: https://travis-ci.org/electrode-io/memcache.svg?branch=master

[travis-url]: https://travis-ci.org/electrode-io/memcache

[npm-image]: https://badge.fury.io/js/memcache-client.svg

[npm-url]: https://npmjs.org/package/memcache-client

[daviddm-image]: https://david-dm.org/electrode-io/memcache/status.svg?path=packages/memcache-client

[daviddm-url]: https://david-dm.org/electrode-io/memcache?path=packages/memcache-client

[daviddm-dev-image]: https://david-dm.org/electrode-io/memcache/dev-status.svg?path=packages/memcache-client

[daviddm-dev-url]: https://david-dm.org/electrode-io/memcache?path=packages/memcache-client

[daviddm-opt-image]: https://david-dm.org/electrode-io/memcache/optional-status.svg?path=packages/memcache-client

[daviddm-opt-url]: https://david-dm.org/electrode-io/memcache?path=packages/memcache-client

[node-zstd]: https://github.com/zwb-ict/node-zstd

[mcrouter]: https://github.com/facebook/mcrouter

[mcrouter allasyncroute]: https://github.com/facebook/mcrouter/wiki/List-of-Route-Handles#allasyncroute
