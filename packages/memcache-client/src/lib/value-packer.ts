/* eslint-disable no-bitwise,no-magic-numbers,max-params,no-unused-vars,max-statements,no-var */
/* eslint max-len:[2,120] */
import assert from "assert";
import { ValueFlags } from "./value-flags";
import { CompressorLibrary } from "../types";

type PackedData = { flag: number; data: string | Buffer };
type DecompressedData = string | number | Record<string, unknown> | Buffer;
export default class ValuePacker {
  compressor: CompressorLibrary;

  constructor(compressor: CompressorLibrary) {
    this.compressor = compressor;
  }

  pack(value: string | number | Record<string, unknown> | Buffer, compress: boolean): PackedData {
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

    if (compress && (value as string | Buffer).length >= 100) {
      assert(this.compressor !== undefined, "No compressor available to compress value");
      flag |= ValueFlags.COMPRESS;
      if (!isBuffer) {
        (value as unknown as Buffer) = Buffer.from(value as string);
      }
      value = this.compressor.compressSync({ input: value });
    }

    return { flag, data: value as string | Buffer };
  }

  unpack(packed: PackedData): DecompressedData {
    const flag = packed.flag;
    const compress = (flag & ValueFlags.COMPRESS) === ValueFlags.COMPRESS;

    var data: string | number | Buffer = packed.data;

    if (compress) {
      assert(this.compressor !== undefined, "No compressor available to decompress data");
      data = this.compressor.decompressSync({ input: data });
    }

    const type = flag & ValueFlags.TYPE_ALL;

    if (type === ValueFlags.TYPE_NUMERIC) {
      data = +(data as string).toString();
    } else if (type === ValueFlags.TYPE_JSON) {
      data = JSON.parse(data as string);
    } else if (type !== ValueFlags.TYPE_BINARY) {
      data = (data as string).toString();
    }

    return data as DecompressedData;
  }
}
