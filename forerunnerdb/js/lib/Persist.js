"use strict";

// Import external names locally
var Shared = require('./Shared'),
	async = require('async'),
	localforage = require('localforage'),
	FdbCompress = require('./PersistCompress'),// jshint ignore:line
	FdbCrypto = require('./PersistCrypto'),// jshint ignore:line
	Db,
	Collection,
	CollectionDrop,
	CollectionGroup,
	CollectionInit,
	DbInit,
	DbDrop,
	Persist,
	Overload;//,
	//DataVersion = '2.0';

/**
 * The persistent storage class handles loading and saving data to browser
 * storage.
 * @constructor
 */
Persist = function () {
	this.init.apply(this, arguments);
};

/**
 * The local forage library.
 */
Persist.prototype.localforage = localforage;

/**
 * The init method that can be overridden or extended.
 * @param {Db} db The ForerunnerDB database instance.
 */
Persist.prototype.init = function (db) {
	var self = this;

	this._encodeSteps = [
		function () { return self._encode.apply(self, arguments); }
	];
	this._decodeSteps = [
		function () { return self._decode.apply(self, arguments); }
	];

	// Check environment
	if (db.isClient()) {
		if (window.Storage !== undefined) {
			this.mode('localforage');

			localforage.config({
				driver: [
					localforage.INDEXEDDB,
					localforage.WEBSQL,
					localforage.LOCALSTORAGE
				],
				name: String(db.core().name()),
				storeName: 'FDB'
			});
		}
	}
};

Shared.addModule('Persist', Persist);
Shared.mixin(Persist.prototype, 'Mixin.ChainReactor');
Shared.mixin(Persist.prototype, 'Mixin.Common');

Db = Shared.modules.Db;
Collection = require('./Collection');
CollectionDrop = Collection.prototype.drop;
CollectionGroup = require('./CollectionGroup');
CollectionInit = Collection.prototype.init;
DbInit = Db.prototype.init;
DbDrop = Db.prototype.drop;
Overload = Shared.overload;

/**
 * Gets / sets the persistent storage mode (the library used
 * to persist data to the browser - defaults to localForage).
 * @param {String} type The library to use for storage. Defaults
 * to localForage.
 * @returns {*}
 */
Persist.prototype.mode = function (type) {
	if (type !== undefined) {
		this._mode = type;
		return this;
	}

	return this._mode;
};

/**
 * Gets / sets the driver used when persisting data.
 * @param {String} val Specify the driver type (LOCALSTORAGE,
 * WEBSQL or INDEXEDDB)
 * @returns {*}
 */
Persist.prototype.driver = function (val) {
	if (val !== undefined) {
		switch (val.toUpperCase()) {
			case 'LOCALSTORAGE':
				localforage.setDriver(localforage.LOCALSTORAGE);
				break;

			case 'WEBSQL':
				localforage.setDriver(localforage.WEBSQL);
				break;

			case 'INDEXEDDB':
				localforage.setDriver(localforage.INDEXEDDB);
				break;

			default:
				throw('ForerunnerDB.Persist: The persistence driver you have specified is not found. Please use either IndexedDB, WebSQL or LocalStorage!');
		}

		return this;
	}

	return localforage.driver();
};

/**
 * Starts a decode waterfall process.
 * @param {*} val The data to be decoded.
 * @param {Function} finished The callback to pass final data to.
 */
Persist.prototype.decode = function (val, finished) {
	async.waterfall([function (callback) {
		if (callback) { callback(false, val, {}); }
	}].concat(this._decodeSteps), finished);
};

/**
 * Starts an encode waterfall process.
 * @param {*} val The data to be encoded.
 * @param {Function} finished The callback to pass final data to.
 */
Persist.prototype.encode = function (val, finished) {
	async.waterfall([function (callback) {
		if (callback) { callback(false, val, {}); }
	}].concat(this._encodeSteps), finished);
};

Shared.synthesize(Persist.prototype, 'encodeSteps');
Shared.synthesize(Persist.prototype, 'decodeSteps');

/**
 * Adds an encode/decode step to the persistent storage system so
 * that you can add custom functionality.
 * @param {Function} encode The encode method called with the data from the
 * previous encode step. When your method is complete it MUST call the
 * callback method. If you provide anything other than false to the err
 * parameter the encoder will fail and throw an error.
 * @param {Function} decode The decode method called with the data from the
 * previous decode step. When your method is complete it MUST call the
 * callback method. If you provide anything other than false to the err
 * parameter the decoder will fail and throw an error.
 * @param {Number=} index Optional index to add the encoder step to. This
 * allows you to place a step before or after other existing steps. If not
 * provided your step is placed last in the list of steps. For instance if
 * you are providing an encryption step it makes sense to place this last
 * since all previous steps will then have their data encrypted by your
 * final step.
 */
Persist.prototype.addStep = new Overload({
	'object': function (obj) {
		this.$main.call(this, function objEncode () { obj.encode.apply(obj, arguments); }, function objDecode () { obj.decode.apply(obj, arguments); }, 0);
	},

	'function, function': function (encode, decode) {
		this.$main.call(this, encode, decode, 0);
	},

	'function, function, number': function (encode, decode, index) {
		this.$main.call(this, encode, decode, index);
	},

	$main: function (encode, decode, index) {
		if (index === 0 || index === undefined) {
			this._encodeSteps.push(encode);
			this._decodeSteps.unshift(decode);
		} else {
			// Place encoder step at index then work out correct
			// index to place decoder step
			this._encodeSteps.splice(index, 0, encode);
			this._decodeSteps.splice(this._decodeSteps.length - index, 0, decode);
		}
	}
});

Persist.prototype.unwrap = function (dataStr) {
	var parts = dataStr.split('::fdb::'),
		data;

	switch (parts[0]) {
		case 'json':
			data = this.jParse(parts[1]);
			break;

		case 'raw':
			data = parts[1];
			break;

		default:
			break;
	}
};

/**
 * Takes encoded data and decodes it for use as JS native objects and arrays.
 * @param {String} val The currently encoded string data.
 * @param {Object} meta Meta data object that can be used to pass back useful
 * supplementary data.
 * @param {Function} finished The callback method to call when decoding is
 * completed.
 * @private
 */
Persist.prototype._decode = function (val, meta, finished) {
	var parts,
		data;

	if (val) {
		parts = val.split('::fdb::');

		switch (parts[0]) {
			case 'json':
				data = this.jParse(parts[1]);
				break;

			case 'raw':
				data = parts[1];
				break;

			default:
				break;
		}

		if (data) {
			meta.foundData = true;
			meta.rowCount = data.length;
		} else {
			meta.foundData = false;
		}

		if (finished) {
			finished(false, data, meta);
		}
	} else {
		meta.foundData = false;
		meta.rowCount = 0;

		if (finished) {
			finished(false, val, meta);
		}
	}
};

/**
 * Takes native JS data and encodes it for for storage as a string.
 * @param {Object} val The current un-encoded data.
 * @param {Object} meta Meta data object that can be used to pass back useful
 * supplementary data.
 * @param {Function} finished The callback method to call when encoding is
 * completed.
 * @private
 */
Persist.prototype._encode = function (val, meta, finished) {
	var data = val;

	if (typeof val === 'object') {
		val = 'json::fdb::' + this.jStringify(val);
	} else {
		val = 'raw::fdb::' + val;
	}

	if (data) {
		meta.foundData = true;
		meta.rowCount = data.length;
	} else {
		meta.foundData = false;
	}

	if (finished) {
		finished(false, val, meta);
	}
};

/**
 * Encodes passed data and then stores it in the browser's persistent
 * storage layer.
 * @param {String} key The key to store the data under in the persistent
 * storage.
 * @param {Object} data The data to store under the key.
 * @param {Function=} callback The method to call when the save process
 * has completed.
 */
Persist.prototype.save = function (key, data, callback) {
	switch (this.mode()) {
		case 'localforage':
			this.encode(data, function (err, data, tableStats) {
				localforage.setItem(key, data).then(function (data) {
					if (callback) { callback(false, data, tableStats); }
				}, function (err) {
					if (callback) { callback(err); }
				});
			});
			break;

		default:
			if (callback) { callback('No data handler.'); }
			break;
	}
};

/**
 * Loads and decodes data from the passed key.
 * @param {String} key The key to retrieve data from in the persistent
 * storage.
 * @param {Function=} callback The method to call when the load process
 * has completed.
 */
Persist.prototype.load = function (key, callback) {
	var self = this;

	switch (this.mode()) {
		case 'localforage':
			localforage.getItem(key).then(function (val) {
				self.decode(val, callback);
			}, function (err) {
				if (callback) { callback(err); }
			});
			break;

		default:
			if (callback) { callback('No data handler or unrecognised data type.');	}
			break;
	}
};

/**
 * Deletes data in persistent storage stored under the passed key.
 * @param {String} key The key to drop data for in the storage.
 * @param {Function=} callback The method to call when the data is dropped.
 */
Persist.prototype.drop = function (key, callback) {
	switch (this.mode()) {
		case 'localforage':
			localforage.removeItem(key).then(function () {
				if (callback) { callback(false); }
			}, function (err) {
				if (callback) { callback(err); }
			});
			break;

		default:
			if (callback) { callback('No data handler or unrecognised data type.'); }
			break;
	}

};

// Extend the Collection prototype with persist methods
Collection.prototype.drop = new Overload({
	/**
	 * Drop collection and persistent storage.
	 */
	'': function () {
		if (!this.isDropped()) {
			this.drop(true);
		}
	},

	/**
	 * Drop collection and persistent storage with callback.
	 * @param {Function} callback Callback method.
	 */
	'function': function (callback) {
		if (!this.isDropped()) {
			this.drop(true, callback);
		}
	},

	/**
	 * Drop collection and optionally drop persistent storage.
	 * @param {Boolean} removePersistent True to drop persistent storage, false to keep it.
	 */
	'boolean': function (removePersistent) {
		if (!this.isDropped()) {
			// Remove persistent storage
			if (removePersistent) {
				if (this._name) {
					if (this._db) {
						// Drop the collection data from storage
						this._db.persist.drop(this._db._name + '-' + this._name);
						this._db.persist.drop(this._db._name + '-' + this._name + '-metaData');
					}
				} else {
					throw('ForerunnerDB.Persist: Cannot drop a collection\'s persistent storage when no name assigned to collection!');
				}
			}

			// Call the original method
			CollectionDrop.call(this);
		}
	},

	/**
	 * Drop collections and optionally drop persistent storage with callback.
	 * @param {Boolean} removePersistent True to drop persistent storage, false to keep it.
	 * @param {Function} callback Callback method.
	 */
	'boolean, function': function (removePersistent, callback) {
		var self = this;

		if (!this.isDropped()) {
			// Remove persistent storage
			if (removePersistent) {
				if (this._name) {
					if (this._db) {
						// Drop the collection data from storage
						this._db.persist.drop(this._db._name + '-' + this._name, function () {
							self._db.persist.drop(self._db._name + '-' + self._name + '-metaData', callback);
						});

						return CollectionDrop.call(this);
					} else {
						if (callback) { callback('Cannot drop a collection\'s persistent storage when the collection is not attached to a database!'); }
					}
				} else {
					if (callback) { callback('Cannot drop a collection\'s persistent storage when no name assigned to collection!'); }
				}
			} else {
				// Call the original method
				return CollectionDrop.call(this, callback);
			}
		}
	}
});

/**
 * Saves an entire collection's data to persistent storage.
 * @param {Function=} callback The method to call when the save function
 * has completed.
 */
Collection.prototype.save = function (callback) {
	var self = this,
		processSave;

	if (self._name) {
		if (self._db) {
			processSave = function () {
				// Save the collection data
				self._db.persist.save(self._db._name + '-' + self._name, self._data, function (err, data, tableStats) {
					if (!err) {
						self._db.persist.save(self._db._name + '-' + self._name + '-metaData', self.metaData(), function (err, data, metaStats) {
							if (callback) { callback(err, data, tableStats, metaStats); }
						});
					} else {
						if (callback) { callback(err); }
					}
				});
			};

			// Check for processing queues
			if (self.isProcessingQueue()) {
				// Hook queue complete to process save
				self.on('queuesComplete', function () {
					processSave();
				});
			} else {
				// Process save immediately
				processSave();
			}
		} else {
			if (callback) { callback('Cannot save a collection that is not attached to a database!'); }
		}
	} else {
		if (callback) { callback('Cannot save a collection with no assigned name!'); }
	}
};

/**
 * Loads an entire collection's data from persistent storage.
 * @param {Function=} callback The method to call when the load function
 * has completed.
 */
Collection.prototype.load = function (callback) {
	var self = this;

	if (self._name) {
		if (self._db) {
			// Load the collection data
			self._db.persist.load(self._db._name + '-' + self._name, function (err, data, tableStats) {
				if (!err) {
					if (data) {
						// Remove all previous data
						self.remove({});
						self.insert(data);
						//self.setData(data);
					}

					// Now load the collection's metadata
					self._db.persist.load(self._db._name + '-' + self._name + '-metaData', function (err, data, metaStats) {
						if (!err) {
							if (data) {
								self.metaData(data);
							}
						}

						if (callback) { callback(err, tableStats, metaStats); }
					});
				} else {
					if (callback) { callback(err); }
				}
			});
		} else {
			if (callback) { callback('Cannot load a collection that is not attached to a database!'); }
		}
	} else {
		if (callback) { callback('Cannot load a collection with no assigned name!'); }
	}
};

// Override the DB init to instantiate the plugin
Db.prototype.init = function () {
	DbInit.apply(this, arguments);
	this.persist = new Persist(this);
};

/**
 * Loads an entire database's data from persistent storage.
 * @param {Function=} callback The method to call when the load function
 * has completed.
 */
Db.prototype.load = function (callback) {
	// Loop the collections in the database
	var obj = this._collection,
		keys = obj.keys(),
		keyCount = keys.length,
		loadCallback,
		index;

	loadCallback = function (err) {
		if (!err) {
			keyCount--;

			if (keyCount === 0) {
				if (callback) { callback(false); }
			}
		} else {
			if (callback) { callback(err); }
		}
	};

	for (index in obj) {
		if (obj.hasOwnProperty(index)) {
			// Call the collection load method
			obj[index].load(loadCallback);
		}
	}
};

/**
 * Saves an entire database's data to persistent storage.
 * @param {Function=} callback The method to call when the save function
 * has completed.
 */
Db.prototype.save = function (callback) {
	// Loop the collections in the database
	var obj = this._collection,
		keys = obj.keys(),
		keyCount = keys.length,
		saveCallback,
		index;

	saveCallback = function (err) {
		if (!err) {
			keyCount--;

			if (keyCount === 0) {
				if (callback) { callback(false); }
			}
		} else {
			if (callback) { callback(err); }
		}
	};

	for (index in obj) {
		if (obj.hasOwnProperty(index)) {
			// Call the collection save method
			obj[index].save(saveCallback);
		}
	}
};

Shared.finishModule('Persist');
module.exports = Persist;