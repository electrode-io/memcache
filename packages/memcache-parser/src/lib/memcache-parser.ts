import assert from "assert";
import { ParserPendingData, DefaultLogger } from "../types";

/* eslint-disable no-magic-numbers, max-statements,no-var */
/* eslint max-len:[2,120] */

const log = (msg: string) => console.log(msg); // eslint-disable-line

export type PendingDataInternal = {
  data: Buffer;
  filled: number;
  cmd: string;
  cmdTokens: string[];
};

const defaultLogger: DefaultLogger = {
  error: log,
  debug: log,
  info: log,
  warn: log,
};

const crlfBuf = Buffer.from("\r\n", "ascii");

export class MemcacheParser {
  logger: DefaultLogger;
  _pending?: PendingDataInternal;
  _partialData?: Buffer;
  _cmdBrkLookupOffset?: number;

  constructor(logger?: DefaultLogger) {
    this._pending = undefined;
    this._partialData = undefined;
    this.logger = logger || defaultLogger;
    this._cmdBrkLookupOffset = 0;
  }

  //
  // call this with data received from the socket
  //
  onData(data: Buffer | undefined): void {
    while (data !== undefined) {
      data = this._processData(data);
    }
  }

  //
  // a client or server should override this
  //
  processCmd(cmdTokens: string[] | number[]): number {
    return cmdTokens.length;
  }

  //
  // a client or server should override this
  // see initiatePending below for info on result
  //
  receiveResult(result: ParserPendingData | string): void | ParserPendingData | string {
    return result;
  }

  //
  // call this if a command expects data to follow
  //
  initiatePending(cmdTokens: string[], length: number): void {
    assert(this._pending === undefined, "MemcacheParser: already waiting for data");
    this._pending = {
      data: Buffer.allocUnsafe(length),
      filled: 0,
      cmd: cmdTokens[0],
      cmdTokens,
    };
  }

  malformDataStream(
    pending: Partial<PendingDataInternal>,
    data: Buffer | string,
    consumer?: string | number // eslint-disable-line
  ): void {
    this.logger.error(
      `MemcacheParser: malformed memcache data stream, cmd: ${pending.cmd}` +
        ` remaining data length: ${data.length}`
    );
  }

  malformCommand(cmdTokens?: string[]): void {
    this.logger.error(`MemcacheParser: malformed command: ${cmdTokens}`);
  }

  unknownCmd(cmdTokens: string[]): void {
    this.logger.error(`MemcacheParser: unknown command: ${cmdTokens}`);
  }

  //
  // internal methods
  //
  _parseCmd(data: Buffer | undefined): Buffer | undefined {
    assert(this._pending === undefined, "MemcacheParser: _parseCmd called with pending data");

    const brkIdx = data?.indexOf(crlfBuf, this._cmdBrkLookupOffset) ?? -1;

    //
    // Was a \r\n marker found
    //
    if (brkIdx >= 0) {
      this._cmdBrkLookupOffset = 0;

      //
      // Slice just the command part up to the \r\n marker and split it into
      // tokens separated by space
      //
      const cmdTokens = data?.slice(0, brkIdx).toString().split(" ") ?? [];

      //
      // advance buffer to skip comand line + \r\n
      // 1. If data contains enough to exactly hold the command and the \r\n marker,
      //    then just set it to undefined.
      // 2. Otherwise slice it to right after the \r\n marker.
      //
      data = data?.length === brkIdx + 2 ? undefined : data?.slice(brkIdx + 2);

      this.logger.debug(`MemcacheParser: got cmd, tokens: ${cmdTokens}`);
      if (cmdTokens.length < 1 || cmdTokens[0].length < 1) {
        this.malformCommand(cmdTokens);
      } else if (this.processCmd(cmdTokens) === 0) {
        // This was false and not 0
        this.unknownCmd(cmdTokens);
        data = undefined;
      } else if (data !== undefined && this._pending !== undefined) {
        data = this._copyPending(data);
      }
    } else {
      // \r\n marker not found.
      this.logger.debug(
        `MemcacheParser: _parseCmd no linebreak, storing data for later, length: ${data?.length}`
      );
      // 1. We need more data until we see \r\n so save what we have now as partial
      this._partialData = data;
      // 2. In case the data ends at just \r, when we get more data, we should
      //    start looking for \r\n one byte back.
      this._cmdBrkLookupOffset = (data?.length ?? 0) - 1;
      data = undefined;
    }

    return data;
  }

  //
  // When a command expects data to follow, this copies the chunks
  // into a single buffer until the expected bytes are received.
  //
  _copyPending(data: Buffer | undefined): Buffer | undefined {
    if (data === undefined) {
      return undefined;
    }

    var consumed = 0;
    const pending: PendingDataInternal = this._pending as PendingDataInternal;

    //
    // pending still needs more data to fill up.
    //
    if (pending.filled < pending.data.length) {
      //
      // - Copy from data starting at index 0, into pending data, start at where
      //   it's currently filled up to.
      // - If data has more than enough to fill up pending, then the copy will
      //   stop when pending is filled up and return the size consumed from data.
      //
      consumed = data.copy(pending.data, pending.filled, 0);
      pending.filled += consumed;
    }

    //
    // Was there enough data to fill up pending?
    //
    if (pending.filled === pending.data.length) {
      const remaining = data.length - consumed;

      // Are there still enough leftover in data to hold the \r\n end mark?
      if (remaining >= 2) {
        // Look for \r\n after the data
        if (data[consumed] !== 13 || data[consumed + 1] !== 10) {
          //
          // We got all the data but it's not followed by CR and LF?
          //
          this.malformDataStream(pending, data, consumed);
          consumed = data.length;
        } else {
          consumed += 2; // skip \r\n
          this._pending = undefined;
          this.receiveResult(pending as unknown as ParserPendingData);
        }
        return data.length > consumed ? data.slice(consumed) : undefined;
      } else if (remaining > 0) {
        // Woo, exactly 1 byte left!
        // Need to save what's left into partial data for next round
        this._partialData = data.slice(consumed);
      }
    }

    return undefined;
  }

  _checkPartialData(data: Buffer): Buffer | undefined {
    // was there data that didn't have the \r\n marker?
    if (this._partialData !== undefined) {
      const partial = this._partialData;
      this._partialData = undefined;
      const newLength = partial.length + data.length;

      //
      // If no pending data and partial data is longer than 512, then reset because
      // we don't expect command line to be longer than that.
      //
      if (this._pending === undefined && partial.length > 512 && newLength > 2000) {
        this.logger.warn(
          `MemcacheParser: partial data length ${partial.length} ` +
            `and new data length ${newLength} too big, resetting`
        );
        return undefined;
      }

      this.logger.debug(
        `MemcacheParser: concat partial data, length: ` +
          `${partial.length}, new length ${newLength} pending ${this._pending}`
      );
      // Join previous partial and new data into a single bigger data
      data = Buffer.concat([partial, data], newLength);
    }

    return data;
  }

  _processData(data: Buffer | undefined): Buffer | undefined {
    data = this._checkPartialData(data as Buffer);

    if (this._pending !== undefined) {
      data = this._copyPending(data);
    }

    if (data !== undefined) {
      data = this._parseCmd(data);
    }

    return data;
  }
}
