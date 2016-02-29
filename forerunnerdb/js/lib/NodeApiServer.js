"use strict";

// jshint ignore: start

// Import external names locally
var Shared = require('./Shared'),
	NodeApiCollection = require('./NodeApiCollection'),
	express = require('express'),
	app = express(),
	Db,
	DbInit,
	NodeApiServer,
	Overload;

NodeApiServer = function () {
	this.init.apply(this, arguments);
};

/**
 * The init method that can be overridden or extended.
 * @param {Db} db The ForerunnerDB database instance.
 */
NodeApiServer.prototype.init = function (db) {
	var self = this;
	self._db = db;
	self._access = {};
};

Shared.addModule('NodeApiServer', NodeApiServer);
Shared.mixin(NodeApiServer.prototype, 'Mixin.Common');
Shared.mixin(NodeApiServer.prototype, 'Mixin.ChainReactor');

Db = Shared.modules.Db;
DbInit = Db.prototype.init;
Overload = Shared.overload;

/**
 * Starts the rest server listening for requests against the ip and
 * port number specified.
 * @param {String} host The IP address to listen on, set to 0.0.0.0 to
 * listen on all interfaces.
 * @param {Number} port The port to listen on.
 * @param {Function=} callback The method to call when the server has
 * started (or failed to start).
 * @returns {NodeApiServer}
 */
NodeApiServer.prototype.listen = function (host, port, callback) {
	var self = this;

	self._server = app.listen(port, host, function () {
		console.log('Listening at http://%s:%s', host, port);
		callback(false, self._server);
	});

	return this;
};

NodeApiServer.prototype.access = new Overload({
	'': function () {
		return this.$main.call(this);
	},

	'string': function (modelName) {
		return this.$main.call(this, modelName);
	},

	'string, function': function (modelName, method) {
		return this.$main.call(this, modelName, '*', method);
	},

	'string, string': function (modelName, methodName) {
		return this.$main.call(this, modelName, methodName);
	},

	'string, string, function': function (modelName, methodName, method) {
		return this.$main.call(this, modelName, methodName, method);
	},

	/**
	 * Defines an access rule for a model and method combination. When
	 * access is requested via a REST call, the function provided will be
	 * executed and the callback from that method will determine if the
	 * access will be allowed or denied. Multiple access functions can
	 * be provided for a single model and method allowing authentication
	 * checks to be stacked.
	 * @name access
	 * @param {String} modelName The model name (collection) to apply the
	 * access function to.
	 * @param {String} methodName The name of the method to apply the access
	 * function to e.g. "insert".
	 * @param {Function} method The function to call when an access attempt
	 * is made against the collection. A callback method is passed to this
	 * function which should be called after the function has finished
	 * processing.
	 * @returns {*}
	 */
	'$main': function (modelName, methodName, method) {
		if (modelName !== undefined) {
			if (methodName !== undefined) {
				if (method !== undefined) {
					this._access[modelName] = this._access[modelName] || {};
					this._access[modelName][methodName] = this._access[modelName][methodName] || [];
					this._access[modelName][methodName].push(method);

					return this;
				}

				if (this._access[modelName] && this._access[modelName][methodName]) {
					return this._access[modelName][methodName];
				}

				return [];
			}

			if (this._access[modelName]) {
				return this._access[modelName];
			}

			return {};
		}

		return this._access;
	}
});

// Override the DB init to instantiate the plugin
Db.prototype.init = function () {
	DbInit.apply(this, arguments);
	this.api = new NodeApiServer(this);
};

Shared.finishModule('NodeApiServer');

module.exports = NodeApiServer;