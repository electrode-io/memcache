# Change Log. 

## (2023-07-24)

### Features

* **memcache-client:**   
   * add TLS support which allows secure connection to a remote memcached server with TLS enabled
   * add new client test cases for TLS

## (2022-09-07)

### Features  

* **memcache-client:**   
   * converted javascript code base to typescript.   
   * changed testing framework from `mocha` to `jest`, assertions were changed accordingly too
   * changed compression library(is a dev dependency) from `node-zstd` to `zstd.ts` as `node-zstd` throws installation errors for latest nodejs versions
* **memcache-parser:** 
   * converted javascript code base to typescript   
   * changed testing framework from `mocha` to `jest`, assertions were changed accordingly too
* **general:** 
   * `lerna` version was updated from `^2.0.0-rc.1` to `3.22.1`
   * `electrode-archetype-njs-module-dev` was removed as archetype module, as that module is just for javascript based projects. `@xarc/module-dev` was introduced because it supports typescript.
   * all packages now uses exact versions for dependencies in their `package.json` files
* **breaking changes:**
   * required nodejs version for developing into this monorepo is now `16.15.1`(check `.nvmrc` file), that's because `@xarch/module-dev` requires at least version `10`, so better use latest LTS 

Updated versions in `package.json` for both **memcache-client** and **memcache-parser** to a major version, as these TS changes could produce breakings in old versions of nodejs 

**Things to improve**

There can be some `any`s in either code base or test files, those should be changed to real types. typescript should be as typed as possible
