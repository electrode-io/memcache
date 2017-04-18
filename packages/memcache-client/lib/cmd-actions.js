"use strict";

const ACTION_OK = "OK";
const ACTION_ERROR = "ERROR";
const ACTION_RESULT = "RESULT";
const ACTION_SINGLE_RESULT = "SINGLE_RESULT";
const ACTION_SELF = "SELF";

module.exports = {
  OK: ACTION_OK,
  END: ACTION_SELF,
  DELETED: ACTION_OK,
  TOUCHED: ACTION_OK,
  STORED: ACTION_OK,
  //
  VALUE: ACTION_SELF,
  STAT: ACTION_RESULT,
  VERSION: ACTION_SINGLE_RESULT,
  //
  NOT_STORED: ACTION_ERROR,
  EXISTS: ACTION_ERROR,
  NOT_FOUND: ACTION_ERROR,
  //
  ERROR: ACTION_ERROR,
  CLIENT_ERROR: ACTION_ERROR,
  SERVER_ERROR: ACTION_ERROR,
  // Slabs Reassign error responses
  // - "BUSY [message]" to indicate a page is already being processed, try again
  //   later.
  // - "BUSY [message]" to indicate the crawler is already processing a request.
  BUSY: ACTION_ERROR,
  // - "BADCLASS [message]" a bad class id was specified
  BADCLASS: ACTION_ERROR,
  // - "NOSPARE [message]" source class has no spare pages
  NOSPARE: ACTION_ERROR,
  // - "NOTFULL [message]" dest class must be full to move new pages to it
  NOTFULL: ACTION_ERROR,
  // - "UNSAFE [message]" source class cannot move a page right now
  UNSAFE: ACTION_ERROR,
  // - "SAME [message]" must specify different source/dest ids.
  SAME: ACTION_ERROR
};
