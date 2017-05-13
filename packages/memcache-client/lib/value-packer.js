"use strict";

/* eslint-disable no-bitwise,no-magic-numbers,max-params,no-unused-vars,max-statements,no-var */
/* eslint max-len:[2,120] */

const assert = require("assert");
const ValueFlags = require("./value-flags");

class ValuePacker {
  constructor(compressor) {
    this.compressor = compressor;
  }

  pack(value, compress) {
    const valueType = typeof value;
    const isBuffer = Buffer.isBuffer(value);

    var flag = 0;
    if (isBuffer) {
      flag = ValueFlags.TYPE_BINARY;
    } else if (valueType === "number") {
      flag = ValueFlags.TYPE_NUMERIC;
      value = JSON.stringify(value);
    } else if (valueType === "object") {
      flag = ValueFlags.TYPE_JSON;
      value = JSON.stringify(value);
    }

    if (compress && value.length >= 100) {
      assert(this.compressor !== undefined, "No compressor available to compress value");
      flag |= ValueFlags.COMPRESS;
      if (!isBuffer) {
        value = Buffer.from(value);
      }
      value = this.compressor.compressSync(value);
    }

    return { flag, data: value };
  }

  unpack(packed) {
    const flag = packed.flag;
    const compress = (flag & ValueFlags.COMPRESS) === ValueFlags.COMPRESS;

    var data = packed.data;

    if (compress) {
      assert(this.compressor !== undefined, "No compressor available to decompress data");
      data = this.compressor.decompressSync(data);
    }

    const type = flag & ValueFlags.TYPE_ALL;

    if (type === ValueFlags.TYPE_NUMERIC) {
      data = +data.toString();
    } else if (type === ValueFlags.TYPE_JSON) {
      data = JSON.parse(data);
    } else if (type !== ValueFlags.TYPE_BINARY) {
      data = data.toString();
    }

    return data;
  }
}

module.exports = ValuePacker;
