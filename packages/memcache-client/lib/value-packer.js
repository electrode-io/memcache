"use strict";

/* eslint-disable no-bitwise,no-magic-numbers,max-params,no-unused-vars,max-statements,no-var */
/* eslint max-len:[2,120] */

const assert = require("assert");

const FLAG_COMPRESS = 1;
const FLAG_TYPE_JSON = 1 << 1;
const FLAG_TYPE_NUMERIC = 1 << 2;
const FLAG_TYPE_BINARY = 1 << 3;
const FLAG_TYPE_ALL = FLAG_TYPE_JSON | FLAG_TYPE_NUMERIC | FLAG_TYPE_BINARY;

class ValuePacker {
  constructor(compressor) {
    this.compressor = compressor;
  }

  pack(value, compress) {
    const valueType = typeof value;
    const isBuffer = Buffer.isBuffer(value);

    var flag = 0;
    if (isBuffer) {
      flag = FLAG_TYPE_BINARY;
    } else if (valueType === "number") {
      flag = FLAG_TYPE_NUMERIC;
      value = JSON.stringify(value);
    } else if (valueType === "object") {
      flag = FLAG_TYPE_JSON;
      value = JSON.stringify(value);
    }

    if (compress && value.length >= 100) {
      assert(this.compressor !== undefined, "No compressor available to compress value");
      flag |= FLAG_COMPRESS;
      if (!isBuffer) {
        value = Buffer.from(value);
      }
      value = this.compressor.compressSync(value);
    }

    return { flag, data: value };
  }

  unpack(packed) {
    const flag = packed.flag;
    const compress = (flag & FLAG_COMPRESS) === FLAG_COMPRESS;

    var data = packed.data;

    if (compress) {
      assert(this.compressor !== undefined, "No compressor available to decompress data");
      data = this.compressor.decompressSync(data);
    }

    const type = flag & FLAG_TYPE_ALL;

    if (type === FLAG_TYPE_NUMERIC) {
      data = +data.toString();
    } else if (type === FLAG_TYPE_JSON) {
      data = JSON.parse(data);
    } else if (type !== FLAG_TYPE_BINARY) {
      data = data.toString();
    }

    return data;
  }
}

module.exports = ValuePacker;
