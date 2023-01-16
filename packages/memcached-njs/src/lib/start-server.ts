import { MemcacheServerOptions, MemcachedServer } from "./memcached-server";

function startServer(options?: MemcacheServerOptions): Promise<MemcachedServer> {
  const x = new MemcachedServer(Object.assign({ port: 0 }, options));
  return x.startup();
}

export default {
  startServer,
};
