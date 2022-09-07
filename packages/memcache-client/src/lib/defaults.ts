/* eslint-disable */

const DefaultValues = {
  MAX_CONNECTIONS: 1,
  CMD_TIMEOUT_MS: 5000,
  CONNECT_TIMEOUT_MS: 5000,
  FAILED_SERVER_OUT_TIME: 60 * 1000, // time to keep failed servers out
  RETRY_FAILED_SERVER_INTERVAL: 10000, // how frequent to check failed servers
  DANGLE_SOCKET_WAIT_TIMEOUT: 5 * 60 * 1000, // time to wait for events on dangle socket
  KEEP_LAST_SERVER: true,
};

export default DefaultValues;
