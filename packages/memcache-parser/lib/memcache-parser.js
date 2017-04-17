"use strict";

const assert = require("assert");

/* eslint-disable no-magic-numbers, max-statements,no-var */
/* eslint max-len:[2,120] */

const log = (msg) => console.log(msg); // eslint-disable-line

const defaultLogger = {
  error: log,
  debug: log,
  info: log,
  warn: log
};

const crlfBuf = Buffer.from("\r\n", "ascii");

class MemcacheParser {
  constructor(logger) {
    this._pending = undefined;
    this._partialData = undefined;
    this.logger = logger || defaultLogger;
    this._cmdBrkLookupOffset = 0;
  }

  //
  // call this with data received from the socket
  //
  onData(data) {
    while (data !== undefined) {
      data = this._processData(data);
    }
  }

  //
  // a client or server should override this
  //
  processCmd(cmdTokens) {
    return cmdTokens.length;
  }

  //
  // a client or server should override this
  // see initiatePending below for info on result
  //
  receiveResult(result) {
    return result;
  }

  //
  // call this if a command expects data to follow
  //
  initiatePending(cmdTokens, length) {
    assert(this._pending === undefined, "MemcacheParser: already waiting for data");
    this._pending = { data: Buffer.allocUnsafe(length), filled: 0, cmd: cmdTokens[0], cmdTokens };
  }

  malformDataStream(pending, data) {
    this.logger.error(`MemcacheParser: malformed memcache data stream, cmd: ${pending.cmd}` +
      ` remaining data length: ${data.length}`);
  }

  malformCommand(cmdTokens) {
    this.logger.error(`MemcacheParser: malformed command: ${cmdTokens}`);
  }

  unknownCmd(cmdTokens) {
    this.logger.error(`MemcacheParser: unknown command: ${cmdTokens}`);
  }

  //
  // internal methods
  //

  _parseCmd(data) {
    assert(this._pending === undefined, "MemcacheParser: _parseCmd called with pending data");

    const brkIdx = data.indexOf(crlfBuf, this._cmdBrkLookupOffset);

    if (brkIdx >= 0) {
      this._cmdBrkLookupOffset = 0;

      const cmdTokens = data.slice(0, brkIdx).toString().split(" ");
      data = data.length === brkIdx + 2
        ? undefined
        : data.slice(brkIdx + 2); // advance buffer to skip comand line + \r\n

      this.logger.debug(`MemcacheParser: got cmd, tokens: ${cmdTokens}`);
      if (cmdTokens.length < 1 || cmdTokens[0].length < 1) {
        this.malformCommand(cmdTokens);
      } else if (this.processCmd(cmdTokens) === false) {
        this.unknownCmd(cmdTokens);
        data = undefined;
      } else if (data !== undefined && this._pending !== undefined) {
        data = this._copyPending(data);
      }
    } else {
      this.logger.debug(`MemcacheParser: _parseCmd no linebreak, storing data for later, length: ${data.length}`);
      this._partialData = data;
      this._cmdBrkLookupOffset = data.length - 1;
      data = undefined;
    }

    return data;
  }

  //
  // When a command expects data to follow, this copies the chunks
  // into a single buffer until the expected bytes are received.
  //
  _copyPending(data) {
    if (data === undefined) {
      return undefined;
    }

    var copied = 0;
    var remaining = data.length;
    const pending = this._pending;

    if (pending.filled < pending.data.length) {
      copied = data.copy(pending.data, pending.filled, 0);
      pending.filled += copied;
      remaining -= copied;
    }

    // look for \r\n after the data
    if (pending.filled === pending.data.length && remaining >= 2) {
      if (data[copied] !== 13 || data[copied + 1] !== 10) { // CR and LF?
        this.malformDataStream(pending, data, copied);
        remaining = 0;
      } else {
        remaining -= 2; // skip \r\n
        this._pending = undefined;
        this.receiveResult(pending);
      }
    }

    return remaining > 0 ? data.slice(data.length - remaining) : undefined;
  }

  _checkPartialData(data) {
    if (this._partialData !== undefined) {
      const partial = this._partialData;
      this._partialData = undefined;
      const newLength = partial.length + data.length;

      //
      // If no pending data and partial data is longer than 512, then reset because
      // we don't expect command line to be longer than that.
      //
      if (this._pending === undefined && partial.length > 512 && newLength > 2000) {
        this.logger.warn(`MemcacheParser: partial data length ${partial.length} ` +
          `and new data length ${newLength} too big, resetting`);
        return undefined;
      }

      this.logger.debug(`MemcacheParser: concat partial data, length: ` +
        `${partial.length}, new length ${newLength} pending ${this._pending}`);
      data = Buffer.concat([partial, data], newLength);
    }

    return data;
  }

  _processData(data) {
    data = this._checkPartialData(data);

    if (this._pending !== undefined) {
      data = this._copyPending(data);
    }

    if (data !== undefined) {
      data = this._parseCmd(data);
    }

    return data;
  }
}

module.exports = MemcacheParser;
