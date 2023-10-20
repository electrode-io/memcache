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
-   Support storing `Buffer`, `string`, `numeric`, and `JSON` values
-   APIs Support callback or Promise
-   Support fire and forget requests
-   Support multiple connections
-   Support TLS connections

## Install

```bash
$ npm i memcache-client --save
```

### Notes
- If you want to use compression features and a compression library is not provided, `zstd.ts` is used by default, for that implementation to work, `zstd` is **required** to be an executable program in the OS

## Usage

```js
import {
  MemcacheClient,
  MultiRetrievalResponse,
  MultiCasRetrievalResponse,
  StatsCommandResponse,
} from "memcache-client";
import assert from "node:assert";
const server = "localhost:11211";
// create a normal client

const client = new MemcacheClient({ server });

// Create a client that ignores NOT_STORED response (for McRouter AllAsync mode)

const mrClient = new MemcacheClient({ server, ignoreNotStored: true });

// You can specify maxConnections by using an object for server
// Default maxConnections is 1

const mClient = new MemcacheClient({ server: { server, maxConnections: 5 } });

// with callback

client.set("key", "data", (err, r) => {
  assert.deepEqual(r, ["STORED"]);
});
client.get("key", (err, data) => {
  assert.equal(data?.value, "data");
});

// with callback - use generic to provide type of data.value

client.get<string>("key", (err, data) => {
  assert.equal(data?.value, "data"); // data?.value is string instead of unknown
});

// with promise

client.set("key", "data").then((r) => assert.deepEqual(r, ["STORED"]));
client.get("key").then((data) => assert.equal(data?.value, "data"));

// with promise - use generic to provide type of data.value

client.get<string>("key").then((data) => assert.equal(data?.value, "data"));

// concurrency using promise

Promise.all([client.set("key1", "data1"), client.set("key2", "data2")]).then((r) =>
  assert.deepEqual(r, [["STORED"], ["STORED"]])
);
Promise.all([client.get("key1"), client.get("key2")]).then((r) => {
  assert.equal(r[0].value, "data1");
  assert.equal(r[1].value, "data2");
});

// get multiple keys
// NOTE: For being able to correctly type the result of getting multiple keys with a single call,
// use the helper type MultiRetrievalResponse or MultiCasRetrievalResponse
// depending of the executed function, and send the desire type

// use MultiRetrievalResponse for client.get
client.get<MultiRetrievalResponse<string>>(["key1", "key2"]).then((results) => {
  assert.equal(results["key1"].value, "data1");
  assert.equal(results["key2"].value, "data2");
});

// use MultiCasRetrievalResponse for client.gets
client.gets<MultiCasRetrievalResponse<string>>(["key1", "key2"]).then((results) => {
  assert.equal(results["key1"].value, "data1");
  assert.equal(results["key2"].value, "data2");
});

// gets and cas (check and set)

client.gets("key1").then((v) => client.cas("key1", "casData", { casUniq: v.casUniq }));

// enable compression (if data size >= 100 bytes)

const data = Buffer.alloc(500);
client.set("key", data, { compress: true }).then((r) => assert.deepEqual(r, ["STORED"]));

// fire and forget

client.set("key", data, { noreply: true });

// send any arbitrary command (\r\n will be appended automatically)
// NOTE: client.cmd can accept a generic same way as client.get and client.gets

// there is already a type for "stats" command
client.cmd<StatsCommandResponse>("stats").then((r) => {
  console.log(r.STAT);
});
client.set("foo", "10", { noreply: true });
client.cmd<string>("incr foo 5").then((v) => assert.equal(+v, 15));

// you can also send arbitary command with noreply option (noreply will be appended automatically)

client.cmd("incr foo 5", { noreply: true });

// send any arbitrary data (remember \r\n)

client.send("set foo 0 0 5\r\nhello\r\n").then((r) => assert.deepEqual(r, ["STORED"]));

// disconnect from the memcached server(s)
client.shutdown();
```

## Commands with a method

All take an optional `callback`.  If it's not provided then all return a `Promise`.

-   `client.get<ReturnValueType>(key, [callback])` or `client.get([key1, key2], [callback])`
-   `client.gets<ReturnValueType>(key, [callback])` or `client.gets([key1, key2], [callback])`
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

> For all store commands, `set`, `add`, `replace`, `append`, `prepend`, and `cas`, the data can be a `Buffer`, `string`, `number`, or a `JSON` object.

### Client Options

The client constructor takes the following values in `options`.

```js
const options = {
  server: { server: "host:port", maxConnections: 3 },
  ignoreNotStored: true, // ignore NOT_STORED response
  lifetime: 100, // TTL 100 seconds
  cmdTimeout: 3000, // command timeout in milliseconds
  connectTimeout: 8000, // connect to server timeout in ms
  keepAlive: 120000, // keepalive initial delay in ms, or `false` to disable
  noDelay: true, // whether to enable TCP_NODELAY on connections
  compressor: require("custom-compressor"),
  logger: require("./custom-logger"),
  Promise,
  tls: {}
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
-   `noDelay` - **_optional_** Whether to enable `TCP_NODELAY` on connections to decrease latency. DEFAULT: false
-   `cmdTimeout` - **_optional_** Command timeout in milliseconds.  DEFAULT: 5000 ms.
    -   If a command didn't receive response before this timeout value, then it will cause the connection to shutdown and returns Error.
-   `connectTimeout` - **_optional_** Custom self connect to server timeout in milliseconds.  It's disabled if set to 0.  DEFAULT: 0
    -   The error object from this will have `connecting` set to `true`
-   `keepAlive` - **_optional_** Initial delay (in milliseconds) between the last data packet received on a connection and when a keepalive probe should be sent, or `false` to disable the `SO_KEEPALIVE` socket option entirely.  DEFAULT: 1 minute (60000 milliseconds)
-   `keepDangleSocket` - **_optional_** After `connectTimeout` trigger, do not destroy the socket but keep listening for errors on it.  DEFAULT: false
-   `dangleSocketWaitTimeout` - **_optional_** How long to wait for errors on dangle socket before destroying it.  DEFAULT: 5 minutes (30000 milliseconds)
-   `compressor` - **_optional_** a custom compressor for compressing the data.  See [data compression](#data-compression) for more details.
-   `logger` - **_optional_** Custom logger like this:
    ```js
    module.exports = {
      debug: (msg) => console.log(msg),
      info: (msg) => console.log(msg),
      warn: (msg) => console.warn(msg),
      error: (msg) => console.error(msg)
    };
    ```
-   `Promise` - **_optional_** Internally this module will try to find `bluebird` in your `node_modules` and fallback to `global.Promise`.  You can set this option to force the Promise to use.
-   `tls` - **_optional_** If set, defines the TLS options to make the client connect to server in TLS mode


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

### TLS / SSL

If the memcached server is configured with TLS, you can make the client connect to it via specifying the `tls` ConnectionOptions.

For production environments, the server should be using a TLS certificate that is signed by a trusted public CA. In
this case you can simply do the following to create the client:

```js
const client = new MemcacheClient({server: "{server_hostname}:11211", tls: {}});
client.set("key", "value");
```

If the server requires client certificate authentication, you can do the following:

```js
import Fs from "fs";
const client = new MemcacheClient({server: "{server_hostname}:11211", tls: {
  key: Fs.readFileSync("client-key.pem"),
  cert: Fs.readFileSync("client-cert.pem"),
}});
client.set("key", "value");
```

If you are running the server with a self-signed certificate (i.e. for local developments), you can create the client
by specifying the CA certificate and disable hostname verification as follows:

```js
import Fs from "fs";
const client = new MemcacheClient({server: "localhost:11211", tls: {
  ca: Fs.readFileSync("ca-cert.pem"),
  checkServerIdentity: () => {return undefined;}
}});
client.set("key", "value");
```

### Data Compression

The client supports automatic compression/decompression of the data you set.  It's turned off by default.

To enable this, you need to:

-  Provide a compressor
-  Set the `compress` flag when calling the [store commands](#lifetime-and-compress)

#### Compressor

By default, the client is modeled to use [node-zstd] version 2's APIs, specifically, it requires a compressor with these two methods:

-   `compressSync(value)`
-   `decompressSync(value)`

Both must take and return `Buffer` data.

If you just add [node-zstd] version 2 to your dependencies, then you can start setting the `compress` flag when calling the [store commands](#lifetime-and-compress) to enable compression.

**If you want to use another major version of [node-zstd] or another compressor that doesn't offer the two APIs expected above, then you need to create a wrapper compressor and pass it to the client constructor.**

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

-   `client.send<ReturnValueType>(data, [options], [callback])`
-   `client.xsend(data, [options])`
-   `client.cmd<ReturnValueType>(data, [options], [callback])`
-   `client.store(cmd, key, value, [optons], [callback])`
-   `client.retrieve<ReturnValueType>(cmd, key, [options], [callback])`
-   `client.xretrieve(cmd, key)`
-   `client.shutdown()`

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
