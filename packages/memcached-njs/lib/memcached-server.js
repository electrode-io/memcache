"use strict";

/* eslint-disable no-console,no-magic-numbers,no-var,camelcase,no-unused-vars,max-statements */

const Net = require("net");
const MemcacheParser = require("memcache-parser");
const Promise = require("bluebird");

// https://github.com/memcached/memcached/blob/master/doc/protocol.txt

const storeCommands = ["set", "add", "replace", "append", "prepend", "prepend", "cas"];

const replies = {
  STORED: "STORED",
  NOT_STORED: "NOT_STORED",
  END: "END",
  EXISTS: "EXISTS",
  NOT_FOUND: "NOT_FOUND",
  DELETED: "DELETED",
  TOUCHED: "TOUCHED",
  OK: "OK",
  CLIENT_ERROR: "CLIENT_ERROR"
};

const logger = {
  debug: (msg) => console.log(msg),
  info: (msg) => console.log(msg),
  warn: (msg) => console.log(msg),
  error: (msg) => console.log(msg)
};

class Connection extends MemcacheParser {
  constructor(server, socket) {
    super();
    this.server = server;
    this.logger = server.logger;
    this.socket = socket;
    this._id = server.getNewClientID();
    this._dataQueue = [];
    this._isPaused = false;

    socket.on("data", (data) => {
      if (this._isPaused) {
        this.logger.info("server paused, queueing data");
        this._dataQueue.unshift(data);
      } else {
        this.onData(data);
      }
    });

    socket.on("end", () => {
      this.logger.info("connection", this._id, "end");
      this.server.end(this);
    });
  }

  processCmd(cmdTokens) {
    const socket = this.socket;
    const cmd = cmdTokens[0];
    if (storeCommands.indexOf(cmd) >= 0) {
      const length = +cmdTokens[4];
      this.initiatePending(cmdTokens, length);
    } else {
      const x = this.server[`cmd_${cmd}`];
      if (x) {
        x.call(this.server, cmdTokens, this);
      } else {
        socket.end("CLIENT_ERROR malformed request\r\n");
        return false;
      }
    }
    return true;
  }

  pause() {
    this._isPaused = true;
  }

  unpause() {
    if (this._isPaused) {
      this._isPaused = false;
      let data;
      while ((data = this._dataQueue.pop())) {
        this.onData(data);
      }
    }
  }

  receiveResult(pending) {
    this.server[`cmd_${pending.cmd}`](pending, this);
  }

  send(data) {
    this.socket.write(data);
  }

  close() {
    this.socket.end();
  }
}

class MemcacheServer {
  constructor(options) {
    this.clientID = 1;
    this._casID = 1;
    this._cache = new Map();
    this._clients = new Map();
    this.options = options;
    this._isPaused = false;
    this.logger = options.logger || logger;
  }

  startup() {
    const server = Net.createServer();
    server.on("connection", this.newConnection.bind(this));
    this._server = server;
    return new Promise((resolve, reject) => {
      server.once("error", (err) => {
        server.close();
        reject(err);
      });

      server.listen(this.options.port, () => {
        this._port = server.address().port;
        this.logger.info(`server listening at port ${this._port}`);
        server.removeAllListeners("error");
        server.on("error", this._onError.bind(this));
        resolve(this);
      });
    });
  }

  // pause processing incoming data
  // instead queue them up for later
  pause() {
    this._isPaused = true;
    this._clients.forEach((x) => x.connection.pause());
  }

  unpause() {
    this._isPaused = false;
    this._clients.forEach((x) => x.connection.unpause());
  }

  asyncMode(flag) {
    this._asyncMode = flag;
  }

  _onError(err) {
    this.logger.info(`server error ${err}`);
  }

  getNewClientID() {
    return this.clientID++;
  }

  getNextCasID() {
    return this._casID++;
  }

  newConnection(socket) {
    const connection = new Connection(this, socket);
    this._clients.set(connection._id, { connection });
    if (this._isPaused) {
      connection.pause();
    }
  }

  _reply(connection, cmdTokens, reply) {
    if (cmdTokens[cmdTokens.length - 1] !== "noreply") {
      connection.send(`${reply}\r\n`);
    }
  }

  // Error strings
  // -------------
  // Each command sent by a client may be answered with an error string
  // from the server. These error strings come in three types:

  // - "ERROR\r\n"

  //   means the client sent a nonexistent command name.

  // - "CLIENT_ERROR <error>\r\n"

  //   means some sort of client error in the input line, i.e. the input
  //   doesn't conform to the protocol in some way. <error> is a
  //   human-readable error string.

  // - "SERVER_ERROR <error>\r\n"

  //   means some sort of server error prevents the server from carrying
  //   out the command. <error> is a human-readable error string. In cases
  //   of severe server errors, which make it impossible to continue
  //   serving the client (this shouldn't normally happen), the server will
  //   close the connection after sending the error line. This is the only
  //   case in which the server closes a connection to a client.

  // Storage commands
  // ----------------

  // First, the client sends a command line which looks like this:

  // <command name> <key> <flags> <exptime> <bytes> [noreply]\r\n
  // cas <key> <flags> <exptime> <bytes> <cas unique> [noreply]\r\n

  // - <command name> is "set", "add", "replace", "append" or "prepend"

  //   "cas" is a check and set operation which means "store this data but
  //   only if no one else has updated since I last fetched it."

  // - <key> is the key under which the client asks to store the data

  // - <flags> is an arbitrary 16-bit unsigned integer (written out in
  //   decimal) that the server stores along with the data and sends back
  //   when the item is retrieved. Clients may use this as a bit field to
  //   store data-specific information; this field is opaque to the server.
  //   Note that in memcached 1.2.1 and higher, flags may be 32-bits, instead
  //   of 16, but you might want to restrict yourself to 16 bits for
  //   compatibility with older versions.

  // - <exptime> is expiration time. If it's 0, the item never expires
  //   (although it may be deleted from the cache to make place for other
  //   items). If it's non-zero (either Unix time or offset in seconds from
  //   current time), it is guaranteed that clients will not be able to
  //   retrieve this item after the expiration time arrives (measured by
  //   server time). If a negative value is given the item is immediately
  //   expired.

  // - <bytes> is the number of bytes in the data block to follow, *not*
  //   including the delimiting \r\n. <bytes> may be zero (in which case
  //   it's followed by an empty data block).

  // - <cas unique> is a unique 64-bit value of an existing entry.
  //   Clients should use the value returned from the "gets" command
  //   when issuing "cas" updates.

  // - "noreply" optional parameter instructs the server to not send the
  //   reply.  NOTE: if the request line is malformed, the server can't
  //   parse "noreply" option reliably.  In this case it may send the error
  //   to the client, and not reading it on the client side will break
  //   things.  Client should construct only valid requests.

  // After this line, the client sends the data block:

  // <data block>\r\n

  // - <data block> is a chunk of arbitrary 8-bit data of length <bytes>
  //   from the previous line.

  // After sending the command line and the data block the client awaits
  // the reply, which may be:

  // - "STORED\r\n", to indicate success.

  // - "NOT_STORED\r\n" to indicate the data was not stored, but not
  // because of an error. This normally means that the
  // condition for an "add" or a "replace" command wasn't met.

  // - "EXISTS\r\n" to indicate that the item you are trying to store with
  // a "cas" command has been modified since you last fetched it.

  // - "NOT_FOUND\r\n" to indicate that the item you are trying to store
  // with a "cas" command did not exist.
  _store(pending, connection) {
    const e = {
      flag: pending.cmdTokens[2],
      data: pending.data,
      lifetime: +pending.cmdTokens[3],
      casId: this.getNextCasID()
    };
    this._cache.set(pending.cmdTokens[1], e);
    if (pending.cmdTokens[0] === "set" && this._asyncMode) {
      return this._reply(connection, pending.cmdTokens, replies.NOT_STORED);
    }

    return this._reply(connection, pending.cmdTokens, replies.STORED);
  }

  // "set" means "store this data".
  cmd_set(pending, connection) {
    this._store(pending, connection);
  }

  // "add" means "store this data, but only if the server *doesn't* already
  // hold data for this key".
  cmd_add(pending, connection) {
    if (this._cache.has(pending.cmdTokens[1])) {
      this._reply(connection, pending.cmdTokens, replies.NOT_STORED);
    } else {
      this._store(pending, connection);
    }
  }

  // "replace" means "store this data, but only if the server *does*
  // already hold data for this key".
  cmd_replace(pending, connection) {
    if (this._cache.has(pending.cmdTokens[1])) {
      this._store(pending, connection);
    } else {
      this._reply(connection, pending.cmdTokens, replies.NOT_STORED);
    }
  }

  // The append and prepend commands do not accept flags or exptime.
  // They update existing data portions, and ignore new flag and exptime
  // settings.

  // "append" means "add this data to an existing key after existing data".
  cmd_append(pending, connection) {
    const key = pending.cmdTokens[1];
    if (this._cache.has(key)) {
      const e = this._cache.get(key);
      e.data = Buffer.concat([e.data, pending.data]);
      e.casId = this.getNextCasID();
      this._reply(connection, pending.cmdTokens, replies.STORED);
    } else {
      this._reply(connection, pending.cmdTokens, replies.NOT_STORED);
    }
  }

  // "prepend" means "add this data to an existing key before existing data".
  cmd_prepend(pending, connection) {
    const key = pending.cmdTokens[1];
    if (this._cache.has(key)) {
      const e = this._cache.get(key);
      e.data = Buffer.concat([pending.data, e.data]);
      e.casId = this.getNextCasID();
      this._reply(connection, pending.cmdTokens, replies.STORED);
    } else {
      this._reply(connection, pending.cmdTokens, replies.NOT_STORED);
    }
  }

  // - "EXISTS\r\n" to indicate that the item you are trying to store with
  // a "cas" command has been modified since you last fetched it.

  // - "NOT_FOUND\r\n" to indicate that the item you are trying to store
  // with a "cas" command did not exist.

  // "cas" is a check and set operation which means "store this data but
  // only if no one else has updated since I last fetched it."

  // cas <key> <flags> <exptime> <bytes> <cas unique> [noreply]\r\n

  cmd_cas(pending, connection) {
    const key = pending.cmdTokens[1];

    if (!this._cache.has(key)) {
      this._reply(connection, pending.cmdTokens, replies.NOT_FOUND);
    } else {
      const e = this._cache.get(key);
      if (`${e.casId}` === pending.cmdTokens[5]) {
        this._store(pending, connection);
      } else {
        this._reply(connection, pending.cmdTokens, replies.EXISTS);
      }
    }
  }

  // Retrieval command:
  // ------------------

  // The retrieval commands "get" and "gets" operate like this:

  // get <key>*\r\n
  // gets <key>*\r\n

  // - <key>* means one or more key strings separated by whitespace.

  // After this command, the client expects zero or more items, each of
  // which is received as a text line followed by a data block. After all
  // the items have been transmitted, the server sends the string

  // "END\r\n"

  // Each item sent by the server looks like this:

  // VALUE <key> <flags> <bytes> [<cas unique>]\r\n
  // <data block>\r\n

  // - <key> is the key for the item being sent

  // - <flags> is the flags value set by the storage command

  // - <bytes> is the length of the data block to follow, *not* including
  //   its delimiting \r\n

  // - <cas unique> is a unique 64-bit integer that uniquely identifies
  //   this specific item.

  // - <data block> is the data for this item.

  // If some of the keys appearing in a retrieval request are not sent back
  // by the server in the item list this means that the server does not
  // hold items with such keys (because they were never stored, or stored
  // but deleted to make space for more items, or expired, or explicitly
  // deleted by a client).

  cmd_get(cmdTokens, connection) {
    const cache = this._cache;
    const _get = (key) => {
      if (cache.has(key)) {
        const e = cache.get(key);
        const casId = cmdTokens[0] === "gets" ? ` ${e.casId}` : "";
        const msg = `VALUE ${key} ${e.flag} ${e.data.length}${casId}\r\n`;
        this.logger.info(`returning ${msg}`);
        connection.send(msg);
        connection.send(e.data);
        connection.send("\r\n");
      } else {
        this.logger.info(`get ${key} not found`);
      }
    };
    var i;
    for (i = 1; i < cmdTokens.length; i++) {
      _get(cmdTokens[i]);
    }
    this._reply(connection, cmdTokens, replies.END);
  }

  cmd_gets(cmdTokens, connection) {
    return this.cmd_get(cmdTokens, connection);
  }

  // Deletion
  // --------

  // The command "delete" allows for explicit deletion of items:

  // delete <key> [noreply]\r\n

  // - "DELETED\r\n" to indicate success

  // - "NOT_FOUND\r\n" to indicate that the item with this key was not
  //   found.
  cmd_delete(cmdTokens, connection) {
    const key = cmdTokens[1];
    if (this._cache.has(key)) {
      this._cache.delete(key);
      this._reply(connection, cmdTokens, replies.DELETED);
    } else {
      this._reply(connection, cmdTokens, replies.NOT_FOUND);
    }
  }

  // Increment/Decrement
  // -------------------
  // Commands "incr" and "decr" are used to change data for some item
  // in-place, incrementing or decrementing it. The data for the item is
  // treated as decimal representation of a 64-bit unsigned integer.  If
  // the current data value does not conform to such a representation, the
  // incr/decr commands return an error (memcached <= 1.2.6 treated the
  // bogus value as if it were 0, leading to confusion). Also, the item
  // must already exist for incr/decr to work; these commands won't pretend
  // that a non-existent key exists with value 0; instead, they will fail.

  // incr <key> <value> [noreply]\r\n
  // decr <key> <value> [noreply]\r\n

  // - <key> is the key of the item the client wishes to change

  // - <value> is the amount by which the client wants to increase/decrease
  // the item. It is a decimal representation of a 64-bit unsigned integer.

  // The response will be one of:

  // - "NOT_FOUND\r\n" to indicate the item with this value was not found

  // - <value>\r\n , where <value> is the new value of the item's data,
  //   after the increment/decrement operation was carried out.

  _IncrDecr(cmdTokens, connection, sign) {
    const key = cmdTokens[1];
    if (!this._cache.has(key)) {
      this._reply(connection, cmdTokens, replies.NOT_FOUND);
    } else {
      const delta = cmdTokens[2];
      if (delta && delta.match(/[+-]?[0-9]/g)) {
        const e = this._cache.get(key);
        const value = e.data.toString();
        if (value && value.match(/[+-]?[0-9]/g)) {
          const a = +value;
          const b = +delta * sign;
          let x = a + b;
          if (x < 0) {
            x = 0;
          }
          e.data = Buffer.from(x.toString());
          this._reply(connection, cmdTokens, e.data);
        } else {
          this._reply(connection, cmdTokens,
            `${replies.CLIENT_ERROR} cannot increment or decrement non-numeric value`);
        }
      } else {
        this._reply(connection, cmdTokens,
          `${replies.CLIENT_ERROR} invalid numeric delta argument`);
      }
    }

  }

  cmd_incr(cmdTokens, connection) {
    return this._IncrDecr(cmdTokens, connection, 1);
  }

  cmd_decr(cmdTokens, connection) {
    return this._IncrDecr(cmdTokens, connection, -1);
  }

  // Touch
  // -----
  // touch <key> <exptime> [noreply]\r\n

  // - <key> is the key of the item the client wishes the server to touch

  // - <exptime> is expiration time. Works the same as with the update commands
  //   (set/add/etc). This replaces the existing expiration time. If an existing
  //   item were to expire in 10 seconds, but then was touched with an
  //   expiration time of "20", the item would then expire in 20 seconds.

  // The response line to this command can be one of:

  // - "TOUCHED\r\n" to indicate success

  // - "NOT_FOUND\r\n" to indicate that the item with this key was not
  //   found.

  cmd_touch(cmdTokens, connection) {
    const key = cmdTokens[1];
    if (!this._cache.has(key)) {
      this._reply(connection, cmdTokens, replies.NOT_FOUND);
    } else {
      const e = this._cache.get(key);
      e.lifetime = +cmdTokens[2];
      this._reply(connection, cmdTokens, replies.TOUCHED);
    }
  }

  // Slabs Reassign
  // --------------
  // slabs reassign <source class> <dest class>\r\n

  // - <source class> is an id number for the slab class to steal a page from

  // A source class id of -1 means "pick from any valid class"

  // - <dest class> is an id number for the slab class to move a page to

  // The response line could be one of:

  // - "OK" to indicate the page has been scheduled to move

  // - "BUSY [message]" to indicate a page is already being processed, try again
  //   later.

  // - "BADCLASS [message]" a bad class id was specified

  // - "NOSPARE [message]" source class has no spare pages

  // - "NOTFULL [message]" dest class must be full to move new pages to it

  // - "UNSAFE [message]" source class cannot move a page right now

  // - "SAME [message]" must specify different source/dest ids.

  _slabs_reassign(cmdTokens, connection) {

  }

  // Slabs Automove
  // --------------
  // slabs automove <0|1>

  // - 0|1|2 is the indicator on whether to enable the slabs automover or not.

  // The response should always be "OK\r\n"

  // - <0> means to set the thread on standby

  // - <1> means to return pages to a global pool when there are more than 2 pages
  //   worth of free chunks in a slab class. Pages are then re-assigned back into
  //   other classes as-needed.

  // - <2> is a highly aggressive mode which causes pages to be moved every time
  //   there is an eviction. It is not recommended to run for very long in this
  //   mode unless your access patterns are very well understood.

  _slabs_automove(cmdTokens, connection) {

  }

  cmd_slabs(cmdTokens, connection) {
    const x = this[`_slabs_${cmdTokens[1]}`];
    if (x) return x.call(this, cmdTokens, connection);
    return undefined;

  }


  // LRU Tuning
  // ----------
  // lru <tune|mode|temp_ttl> <option list>

  // - "tune" takes numeric arguments "percent hot", "percent warm",
  //   "max hot age", "max warm age factor". IE: "lru tune 10 25 3600 2.0".
  //   This would cap HOT_LRU at 10% of the cache, or tail is idle longer than
  //   3600s. WARM_LRU is up to 25% of cache, or tail is idle longer than 2x
  //   COLD_LRU.

  // - "mode" <flat|segmented>: "flat" is traditional mode. "segmented" uses
  //   HOT|WARM|COLD split. "segmented" mode requires `-o lru_maintainer` at start
  //   time. If switching from segmented to flat mode, the background thread will
  //   pull items from HOT|WARM into COLD queue.

  // - "temp_ttl" <ttl>: If TTL is less than zero, disable usage of TEMP_LRU. If
  //   zero or above, items set with a TTL lower than this will go into TEMP_LRU
  //   and be unevictable until they naturally expire or are otherwise deleted or
  //   replaced.

  // The response line could be one of:

  // - "OK" to indicate a successful update of the settings.

  // - "ERROR [message]" to indicate a failure or improper arguments.
  cmd_lru(cmdTokens, connection) {

  }

  // LRU_Crawler
  // -----------
  // lru_crawler <enable|disable>

  // - Enable or disable the LRU Crawler background thread.

  // The response line could be one of:

  // - "OK" to indicate the crawler has been started or stopped.

  // - "ERROR [message]" something went wrong while enabling or disabling.

  _lru_crawler_enable(cmdTokens, connection) {

  }

  _lru_crawler_disable(cmdTokens, connection) {

  }

  // lru_crawler sleep <microseconds>

  // - The number of microseconds to sleep in between each item checked for
  //   expiration. Smaller numbers will obviously impact the system more.
  //   A value of "0" disables the sleep, "1000000" (one second) is the max.

  // The response line could be one of:

  // - "OK"

  // - "CLIENT_ERROR [message]" indicating a format or bounds issue.

  _lru_crawler_sleep(cmdTokens, connection) {

  }

  // lru_crawler tocrawl <32u>

  // - The maximum number of items to inspect in a slab class per run request. This
  //   allows you to avoid scanning all of very large slabs when it is unlikely to
  //   find items to expire.

  // The response line could be one of:

  // - "OK"

  // - "CLIENT_ERROR [message]" indicating a format or bound issue.

  _lru_crawler_tocrawl(cmdTokens, connection) {

  }

  // lru_crawler crawl <classid,classid,classid|all>

  // - Takes a single, or a list of, numeric classids (ie: 1,3,10). This instructs
  //   the crawler to start at the tail of each of these classids and run to the
  //   head. The crawler cannot be stopped or restarted until it completes the
  //   previous request.

  //   The special keyword "all" instructs it to crawl all slabs with items in
  //   them.

  // The response line could be one of:

  // - "OK" to indicate successful launch.

  // - "BUSY [message]" to indicate the crawler is already processing a request.

  // - "BADCLASS [message]" to indicate an invalid class was specified.

  _lru_crawler_crawl(cmdTokens, connection) {

  }

  // lru_crawler metadump <classid,classid,classid|all>

  // - Similar in function to the above "lru_crawler crawl" command, this function
  //   outputs one line for every valid item found in the matching slab classes.
  //   Similar to "cachedump", but does not lock the cache and can return all
  //   items, not just 1MB worth.

  //   Lines are in "key=value key2=value2" format, with value being URI encoded
  //   (ie: %20 for a space).

  //   The exact keys available are subject to change, but will include at least:

  //   "key", "exp" (expiration time), "la", (last access time), "cas",
  //   "fetch" (if item has been fetched before).

  // The response line could be one of:

  // - "OK" to indicate successful launch.

  // - "BUSY [message]" to indicate the crawler is already processing a request.

  // - "BADCLASS [message]" to indicate an invalid class was specified.

  _lru_crawler_metadump(cmdTokens, connection) {

  }

  cmd_lru_crawler(cmdTokens, connection) {
    const x = this[`_lru_crawler_${cmdTokens[1]}`];
    if (x) return x.call(this, cmdTokens, connection);
    return undefined;
  }

  // Watchers
  // --------
  // watch <fetchers|mutations|evictions>

  // - Turn connection into a watcher. Options can be stacked and are
  //   space-separated. Logs will be sent to the watcher until it disconnects.

  // The response line could be one of:

  // - "OK" to indicate the watcher is ready to send logs.

  // - "ERROR [message]" something went wrong while enabling.

  // The response format is in "key=value key2=value2" format, for easy parsing.
  // Lines are prepending with "ts=" for a timestamp and "gid=" for a global ID
  // number of the log line. Given how logs are collected internally they may be
  // printed out of order. If this is important the GID may be used to put log
  // lines back in order.

  // The value of keys (and potentially other things) are "URI encoded". Since most
  // keys used conform to standard ASCII, this should have no effect. For keys with
  // less standard or binary characters, "%NN"'s are inserted to represent the
  // byte, ie: "n%2Cfoo" for "n,foo".

  // The arguments are:

  // - "fetchers": Currently emits logs every time an item is fetched internally.
  //   This means a "set" command would also emit an item_get log, as it checks for
  //   an item before replacing it. Multigets should also emit multiple lines.

  // - "mutations": Currently emits logs when an item is stored in most cases.
  //   Shows errors for most cases when items cannot be stored.

  // - "evictions": Shows some information about items as they are evicted from the
  //   cache. Useful in seeing if items being evicted were actually used, and which
  //   keys are getting removed.

  cmd_watch(cmdTokens, connection) {
  }

  // Statistics
  // ----------
  // The command "stats" is used to query the server about statistics it
  // maintains and other internal data. It has two forms. Without
  // arguments:

  // stats\r\n

  // it causes the server to output general-purpose statistics and
  // settings, documented below.  In the other form it has some arguments:

  // stats <args>\r\n

  // Depending on <args>, various internal data is sent by the server. The
  // kinds of arguments and the data sent are not documented in this version
  // of the protocol, and are subject to change for the convenience of
  // memcache developers.

  // Upon receiving the "stats" command without arguments, the server sents
  // a number of lines which look like this:

  // STAT <name> <value>\r\n

  // The server terminates this list with the line

  // END\r\n

  cmd_stats(cmdTokens, connection) {
    connection.send([
      "STAT foo bar",
      "STAT hello world",
      `STAT connection ${connection._id}`,
      `STAT port ${this._port}`,
      "END"].join("\r\n"));
    connection.send("\r\n");
  }

  // Other commands
  // --------------
  // "flush_all" is a command with an optional numeric argument. It always
  // succeeds, and the server sends "OK\r\n" in response (unless "noreply"
  // is given as the last parameter). Its effect is to invalidate all
  // existing items immediately (by default) or after the expiration
  // specified.  After invalidation none of the items will be returned in
  // response to a retrieval command (unless it's stored again under the
  // same key *after* flush_all has invalidated the items). flush_all
  // doesn't actually free all the memory taken up by existing items; that
  // will happen gradually as new items are stored. The most precise
  // definition of what flush_all does is the following: it causes all
  // items whose update time is earlier than the time at which flush_all
  // was set to be executed to be ignored for retrieval purposes.

  // The intent of flush_all with a delay, was that in a setting where you
  // have a pool of memcached servers, and you need to flush all content,
  // you have the option of not resetting all memcached servers at the
  // same time (which could e.g. cause a spike in database load with all
  // clients suddenly needing to recreate content that would otherwise
  // have been found in the memcached daemon).

  // The delay option allows you to have them reset in e.g. 10 second
  // intervals (by passing 0 to the first, 10 to the second, 20 to the
  // third, etc. etc.).

  // "cache_memlimit" is a command with a numeric argument. This allows runtime
  // adjustments of the cache memory limit. It returns "OK\r\n" or an error (unless
  // "noreply" is given as the last parameter). If the new memory limit is higher
  // than the old one, the server may start requesting more memory from the OS. If
  // the limit is lower, and slabs_reassign+automove are enabled, free memory may
  // be released back to the OS asynchronously.

  cmd_flush_all(cmdTokens, connection) {

  }

  // "version" is a command with no arguments:

  // version\r\n

  // In response, the server sends

  // "VERSION <version>\r\n", where <version> is the version string for the
  // server.

  cmd_version(cmdTokens, connection) {
    this._reply(connection, cmdTokens, "VERSION 0.0.1");
  }

  // "verbosity" is a command with a numeric argument. It always succeeds,
  // and the server sends "OK\r\n" in response (unless "noreply" is given
  // as the last parameter). Its effect is to set the verbosity level of
  // the logging output.

  cmd_verbosity(cmdTokens, connection) {
    this._reply(connection, cmdTokens, replies.OK);
  }

  // "quit" is a command with no arguments:

  // quit\r\n

  // Upon receiving this command, the server closes the
  // connection. However, the client may also simply close the connection
  // when it no longer needs it, without issuing this command.
  cmd_quit(cmdTokens, connection) {
    this.end(connection);
  }

  end(connection) {
    connection.close();
    this._clients.delete(connection._id);
  }

  shutdown() {
    this._clients.forEach((x) => {
      x.connection.close();
    });
    this._clients.clear();
    this._server.close();
    this.logger.info("server shutdown");
  }
}

module.exports = MemcacheServer;
