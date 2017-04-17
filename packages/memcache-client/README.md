# memcache-client

A NodeJS memcached client that implements the ASCII protocol.

## Features

-   Very efficient memcached ASCII protocol parser by using only NodeJS Buffer APIs
-   Optional compression for the data before sending to memcached

## Install

```bash
$ npm i memcache-client --save
```

## Usage

```js
const MemcacheClient = require("memcache-client");

const client = MemcacheClient({server: "localhost:11211"});

// with callback

client.set("key", "data", (err) => { console.log(err); });
client.get("key", (err, data) => { console.log(data); });

// with promise

client.set("key", "data").then(() => ...);
client.get("key").then(() => ...);

// concurrency using promise

Promise.all([client.set("key1", "data1"), client.set("key2", "data2")]);
Promise.all([client.get("key1"), client.get("key2")]);

// get multiple keys

client.get(["key1", "key2"]).then((results) => ...);

// enable compression (if data size > 100 bytes)

client.set("key", data, {compress: true})
```
