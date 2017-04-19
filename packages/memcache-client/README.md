# memcache-client

NodeJS memcached client with the most efficient ASCII protocol parser.

Primary developed to be used at [@WalmartLabs](http://www.walmartlabs.com/) to power the <http://www.walmart.com> eCommerce site.

## Features

-   Very efficient memcached ASCII protocol parser by using only [NodeJS Buffer APIs](https://nodejs.org/api/buffer.html).
-   Optional compression for the data before sending to memcached
-   Auto reconnects when there's network error or timeout

## Install

```bash
$ npm i memcache-client --save
```

## Usage

```js
const MemcacheClient = require("memcache-client");
const server = "localhost:11211";

// create a normal client

const client = new MemcacheClient({ server });

// Create a client that ignores NOT_STORED response (for McRouter AllAsync mode)

const mrClient = new MemcacheClient({ server, ignoreNotStored: true });

// with callback

client.set("key", "data", (err, r) => { expect(r).to.equal(["STORED"]); });
client.get("key", (err, data) => { expect(data.value).to.equal("data"); });

// with promise

client.set("key", "data").then((r) => expect(r).to.equal(["STORED"]));
client.get("key").then((data) => expect(data.value).to.equal("data"));

// concurrency using promise

Promise.all([client.set("key1", "data1"), client.set("key2", "data2")])
  .then((r) => expect(r).to.deep.equal(["STORED", "STORED"]));
Promise.all([client.get("key1"), client.get("key2")])
  .then((r) => {
    expect(r[0].value).to.equal("data1");
    expect(r[0].value).to.equal("data2");
  });

// get multiple keys

client.get(["key1", "key2"]).then((results) => {
  expect(results["key1"].value).to.equal("data1");
  expect(results["key2"].value).to.equal("data2");
});

// gets and cas

client.gets("key1").then((v) => client.cas("key1", "casData", { casUniq: v.casUniq }));

// enable compression (if data size > 100 bytes)

client.set("key", data, { compress: true }).then((r) => expect(r).to.equal(["STORED"]));

// fire and forget

client.set("key", data, { noreply: true });

// send any arbitrary command (\r\n will be appended automatically)

client.cmd("stats").then((r) => { console.log(r.STAT) });
client.set("foo", "10", { noreply: true });
client.cmd("incr foo 5").then((v) => expect(v).to.equal(15));

// send any arbitrary data (remember \r\n)

client.send("set foo 0 0 5\r\nhello\r\n").then((r) => expect(r).to.equal(["STORED"]));
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

## Other methods

-   `client.send(data, [options], [callback])`
-   `client.xsend(data, [options])`
-   `client.cmd(data, [options], [callback])`
-   `client.store(cmd, key, value, [optons], [callback])`
-   `client.retrieve(cmd, key, [options], [callback])`
-   `client.xretrieve(cmd, key)`

## License

Apache-2.0 © [Joel Chen](https://github.com/jchip)
