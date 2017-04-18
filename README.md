# memcache

NodeJS memcached client with the most efficient ASCII protocol parser.

## Features

-   Very efficient memcached ASCII protocol parser by using only [NodeJS Buffer APIs](https://nodejs.org/api/buffer.html).
-   Optional compression for the data before sending to memcached

## Packages

This repo uses [lerna](https://lernajs.io/) to manage multiple packages.

-   [memcache-client](packages/memcache-client) - The primary package which is the memcached client.
-   [memcache-parser](packages/memcache-parser) - A very efficient memcached ASCII protocol parser.
-   [memcached-njs](packages/memcached-njs) - A working memcached server implemented in NodeJS for tests.

## Other Implementations

-   [memcached](https://github.com/3rd-Eden/memcached)
-   [node-memcache](https://github.com/elbart/node-memcache)
-   [mc](http://overclocked.com/mc/)
-   [memcachejs](https://github.com/jketterl/memcachejs)
