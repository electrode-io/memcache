"use strict";

/* eslint-disable no-bitwise,no-magic-numbers */

const COMPRESS = 1;
const TYPE_JSON = 1 << 1;
const TYPE_NUMERIC = 1 << 2;
const TYPE_BINARY = 1 << 3;
const TYPE_ALL = TYPE_JSON | TYPE_NUMERIC | TYPE_BINARY;

module.exports = {
  COMPRESS,
  TYPE_JSON,
  TYPE_NUMERIC,
  TYPE_BINARY,
  TYPE_ALL
};
