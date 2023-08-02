// eslint-disable-next-line filenames/match-regex
import {
  MemcacheClient
} from "../../";
import fs from "fs";
import Path from "path";
import { text1, text2 } from "../data/text";
import NullLoger from "../../lib/null-logger";
import memcached, { MemcachedServer } from "memcached-njs";
import { AddressInfo } from "net";

describe("memcache TLS client", function () {
  let memcachedServer: MemcachedServer | undefined;
  let server: string;
  let serverPort: number;
  const defaultTlsOptions = {
    key: fs.readFileSync(Path.join(__dirname, "server_key.pem")),
    cert: fs.readFileSync(Path.join(__dirname, "server_crt.pem")),
    requestCert: false
  };

  const tlsOptionsClientAuth = {
    key: fs.readFileSync(Path.join(__dirname, "server_key.pem")),
    cert: fs.readFileSync(Path.join(__dirname, "server_crt.pem")),
    ca: fs.readFileSync(Path.join(__dirname, "cacert.pem")),
    requestCert: true
  };

  const startMemcachedServer = (tlsOptions: any, port?: number) => {
    const options: Record<string, unknown> = { logger: NullLoger };
    options.tls = tlsOptions;
    if (port) {
      options.port = port;
    }
    return memcached.startServer(options).then((ms: MemcachedServer) => {
      serverPort = (ms._server?.address() as AddressInfo).port;
      server = `localhost:${serverPort}`;
      memcachedServer = ms;
    });
  };

  afterEach((done) => {
    if (memcachedServer !== undefined) {
      memcachedServer.shutdown();
      memcachedServer = undefined;
    }
    done();
  });

  it("TLS handles ECONNREFUSED", (done) => {
    startMemcachedServer(defaultTlsOptions).then(() => done()).catch(done);
    const x = new MemcacheClient({ server: "localhost:65000", tls: {} });
    let testError: Error;
    x.cmd("stats")
      .catch((err: Error) => (testError = err))
      .then(() => {
        expect(testError.message).toContain("ECONNREFUSED");
        done();
      });
  });

  it("TLS handles ENOTFOUND", (done) => {
    const x = new MemcacheClient({ server: "badhost.baddomain.com:65000", tls: {} });
    let testError: Error;
    x.cmd("stats")
      .catch((err: Error) => (testError = err))
      .then(() => {
        expect(testError.message).toContain("ENOTFOUND");
        done();
      });
  });

  it("TLS connection with basic commands", (done) => {
    startMemcachedServer(defaultTlsOptions).then(() => {
      const c = new MemcacheClient({server: server,
        tls: {
          ca: fs.readFileSync(Path.join(__dirname, "cacert.pem")),
          checkServerIdentity: () => {return undefined;}
        }});
      c.version()
        .then((v: string[]) => {
          expect(v[0]).toEqual("VERSION");
          expect(v[1]).not.toBe("");
        })
        .then(() => c.set("key", text1))
        .then(() => c.get<string>("key").then((r) => {
          expect(r.value).toEqual(text1);
          done();
        }));
    });
  });

  it("TLS connection with client authentication", (done) => {
    startMemcachedServer(tlsOptionsClientAuth).then(() => {
      const c = new MemcacheClient({server: server,
        tls: {
          key: fs.readFileSync(Path.join(__dirname, "client_key.pem")),
          cert: fs.readFileSync(Path.join(__dirname, "client_crt.pem")),
          ca: fs.readFileSync(Path.join(__dirname, "cacert.pem")),
          checkServerIdentity: () => {return undefined;}
        }});
      c.version()
        .then((v: string[]) => {
          expect(v[0]).toEqual("VERSION");
          expect(v[1]).not.toBe("");
        })
        .then(() => c.set("key", text2))
        .then(() => c.get<string>("key").then((r) => {
          expect(r.value).toEqual(text2);
          done();
        }));
    });
  });
});
