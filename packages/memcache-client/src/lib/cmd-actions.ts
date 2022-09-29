/* eslint-disable no-shadow */
enum ActionTypes {
  ACTION_OK = "OK",
  ACTION_ERROR = "ERROR",
  ACTION_RESULT = "RESULT",
  ACTION_SINGLE_RESULT = "SINGLE_RESULT",
  ACTION_SELF = "SELF",
}

const CmdActions: Record<string, string> = {
  OK: ActionTypes.ACTION_OK,
  END: ActionTypes.ACTION_SELF,
  DELETED: ActionTypes.ACTION_OK,
  TOUCHED: ActionTypes.ACTION_OK,
  STORED: ActionTypes.ACTION_OK,
  //
  VALUE: ActionTypes.ACTION_SELF,
  STAT: ActionTypes.ACTION_RESULT,
  VERSION: ActionTypes.ACTION_SINGLE_RESULT,
  //
  NOT_STORED: ActionTypes.ACTION_ERROR,
  EXISTS: ActionTypes.ACTION_ERROR,
  NOT_FOUND: ActionTypes.ACTION_ERROR,
  //
  ERROR: ActionTypes.ACTION_ERROR,
  CLIENT_ERROR: ActionTypes.ACTION_ERROR,
  SERVER_ERROR: ActionTypes.ACTION_ERROR,
  // Slabs Reassign error responses
  // - "BUSY [message]" to indicate a page is already being processed, try again
  //   later.
  // - "BUSY [message]" to indicate the crawler is already processing a request.
  BUSY: ActionTypes.ACTION_ERROR,
  // - "BADCLASS [message]" a bad class id was specified
  BADCLASS: ActionTypes.ACTION_ERROR,
  // - "NOSPARE [message]" source class has no spare pages
  NOSPARE: ActionTypes.ACTION_ERROR,
  // - "NOTFULL [message]" dest class must be full to move new pages to it
  NOTFULL: ActionTypes.ACTION_ERROR,
  // - "UNSAFE [message]" source class cannot move a page right now
  UNSAFE: ActionTypes.ACTION_ERROR,
  // - "SAME [message]" must specify different source/dest ids.
  SAME: ActionTypes.ACTION_ERROR,
};

export default CmdActions;
