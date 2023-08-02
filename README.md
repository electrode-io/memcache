[![Build Status][travis-image]][travis-url]

# memcache

NodeJS memcached client with the most efficient ASCII protocol parser.

## Features

-   Very efficient memcached ASCII protocol parser by using only [NodeJS Buffer APIs](https://nodejs.org/api/buffer.html).
-   Optional compression for the data before sending to memcached
-   Auto reconnects when there's network error or timeout
-   Support sending arbitrary commands.  Read up on the [protocol doc here](https://github.com/memcached/memcached/blob/master/doc/protocol.txt).
-   Support storing `string`, `numeric`, and `JSON` values
-   APIs Support callback or Promise
-   Support fire and forget requests
-   Support multiple connections
-   Support TLS connections

## Packages

This repo uses [lerna](https://lernajs.io/) to manage multiple packages.

-   [memcache-client](packages/memcache-client) - [![client NPM version][client-npm-image]][client-npm-url] The primary package which is the memcached client.
-   [memcache-parser](packages/memcache-parser) - [![parser NPM version][parser-npm-image]][parser-npm-url] A very efficient memcached ASCII protocol parser.
-   [memcached-njs](packages/memcached-njs) - [![server NPM version][server-npm-image]][server-npm-url] A working memcached server implemented in NodeJS for tests.

## Development environment installation  

1. Clone this repo
2. run `nvm use`
3. run `npm ci`
4. run `npm run bootstrap`
5. optional: just to make sure everything is fine run `npm run build` and check if there's no error using that command
6. Testing: run `npm test`
## Publishing notes
- Recommended publish flow is to publish the modules individually using `npm publish`, can be improved to use lerna in the future

## Other Implementations

-   [memcached](https://github.com/3rd-Eden/memcached)
-   [node-memcache](https://github.com/elbart/node-memcache)
-   [mc](http://overclocked.com/mc/)
-   [memcachejs](https://github.com/jketterl/memcachejs)

## License

Apache-2.0 © [Joel Chen](https://github.com/jchip)

[travis-image]: https://travis-ci.org/electrode-io/memcache.svg?branch=master

[travis-url]: https://travis-ci.org/electrode-io/memcache

[client-npm-image]: https://badge.fury.io/js/memcache-client.svg

[client-npm-url]: https://npmjs.org/package/memcache-client

[parser-npm-image]: https://badge.fury.io/js/memcache-parser.svg

[parser-npm-url]: https://npmjs.org/package/memcache-parser

[server-npm-image]: https://badge.fury.io/js/memcached-njs.svg

[server-npm-url]: https://npmjs.org/package/memcached-njs
