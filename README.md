[![Build Status][travis-image]][travis-url]

# memcache

NodeJS memcached client with the most efficient ASCII protocol parser.

## Features

-   Very efficient memcached ASCII protocol parser by using only [NodeJS Buffer APIs](https://nodejs.org/api/buffer.html).
-   Optional compression for the data before sending to memcached
-   Auto reconnects when there's network error or timeout
-   Support sending arbitrary commands.  Read up on the [protocol doc here](https://github.com/memcached/memcached/blob/master/doc/protocol.txt).
-   APIs Support callback or Promise
-   Support fire and forget requests
-   Support multiple connections

## Packages

This repo uses [lerna](https://lernajs.io/) to manage multiple packages.

-   [memcache-client](packages/memcache-client) - [![client NPM version][client-npm-image]][client-npm-url] The primary package which is the memcached client.
-   [memcache-parser](packages/memcache-parser) - [![parser NPM version][parser-npm-image]][parser-npm-url] A very efficient memcached ASCII protocol parser.
-   [memcached-njs](packages/memcached-njs) - [![server NPM version][server-npm-image]][server-npm-url] A working memcached server implemented in NodeJS for tests.

## Other Implementations

-   [memcached](https://github.com/3rd-Eden/memcached)
-   [node-memcache](https://github.com/elbart/node-memcache)
-   [mc](http://overclocked.com/mc/)
-   [memcachejs](https://github.com/jketterl/memcachejs)

[travis-image]: https://travis-ci.org/jchip/memcache.svg?branch=master

[travis-url]: https://travis-ci.org/jchip/memcache

[client-npm-image]: https://badge.fury.io/js/memcache-client.svg

[client-npm-url]: https://npmjs.org/package/memcache-client

[parser-npm-image]: https://badge.fury.io/js/memcache-parser.svg

[parser-npm-url]: https://npmjs.org/package/memcache-parser

[server-npm-image]: https://badge.fury.io/js/memcached-njs.svg

[server-npm-url]: https://npmjs.org/package/memcached-njs
