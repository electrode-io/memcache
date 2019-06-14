"use strict";

const defaults = require("./defaults");
const MemcacheNode = require("./memcache-node");
const _defaults = require("lodash/defaults");
const forOwn = require("lodash/forOwn");
const pickBy = require("lodash/pickBy");
const isEmpty = require("lodash/isEmpty");

const HashRing = require("hashring");

/* eslint-disable max-statements,no-magic-numbers */

/*
 * Manages a consistent hash ring of servers
 */

class ConsistentHashRingServers {
	constructor(client, server, options) {
		this.client = client;
		this._servers = Array.isArray(server) ? server : [server];
		this._exServers = {};
		this._nodes = {};
		this._config = _defaults({}, options, {
			maxConnections: defaults.MAX_CONNECTIONS,
			failedServerOutTime: defaults.FAILED_SERVER_OUT_TIME,
			retryFailedServerInterval: defaults.RETRY_FAILED_SERVER_INTERVAL,
			keepLastServer: defaults.KEEP_LAST_SERVER
		});
		this._hashRing = new HashRing(this._servers, "sha1");
	}

	shutdown() {
		forOwn(this._nodes, node => node.shutdown());
	}

	doCmd(key, action) {
		if (!isEmpty(this._exServers)) {
			this._retryServers();
		}
		if (this._servers.length === 0) {
			throw new Error("No more valid servers left");
		}
		if (this._servers.length === 1 && this._config.keepLastServer === true) {
			return this._getNode(key).doCmd(action);
		}
		const node = this._getNode(key);
		return node.doCmd(action).catch(err => {
			if (!err.connecting) {
				throw err;
			}
			// failed to connect to server, exile it
			const s = node.options.server;
			const _servers = [];
			for (let i = 0; i < this._servers.length; i++) {
				if (s === this._servers[i]) {
					this._exServers[this._servers[i]] = Date.now();
					this._hashRing.remove(this._servers[i]);
				} else {
					_servers.push(this._servers[i]);
				}
			}
			this._servers = _servers;
			return this.doCmd(key, action);
		});
	}

	_retryServers() {
		const now = Date.now();
		if (now - this._lastRetryTime < this._config.retryFailedServerInterval) {
			return;
		}
		this._lastRetryTime = now;
		forOwn(this._exServers, (exiledTime, server) => {
			if (now - exiledTime >= this._config.failedServerOutTime) {
				this._exServers[server] = null;
				this._servers.push(server);
				this._hashRing.add(server);
			}
		});
		this._exServers = pickBy(this._exServers, exiledTime => exiledTime !== null);
	}

	_getNode(key) {
		const server = this._hashRing.get(key);
		if (!this._nodes[server]) {
			const options = {
				server,
				maxConnections: this._config.maxConnections
			};
			this._nodes[server] = new MemcacheNode(this.client, options);
		}
		return this._nodes[server];
	}
}

module.exports = ConsistentHashRingServers;
