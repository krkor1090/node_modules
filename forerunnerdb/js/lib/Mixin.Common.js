"use strict";

var idCounter = 0,
	Overload = require('./Overload'),
	Serialiser = require('./Serialiser'),
	Common,
	serialiser = new Serialiser();

/**
 * Provides commonly used methods to most classes in ForerunnerDB.
 * @mixin
 */
Common = {
	// Expose the serialiser object so it can be extended with new data handlers.
	serialiser: serialiser,

	/**
	 * Gets / sets data in the item store. The store can be used to set and
	 * retrieve data against a key. Useful for adding arbitrary key/value data
	 * to a collection / view etc and retrieving it later.
	 * @param {String|*} key The key under which to store the passed value or
	 * retrieve the existing stored value.
	 * @param {*=} val Optional value. If passed will overwrite the existing value
	 * stored against the specified key if one currently exists.
	 * @returns {*}
	 */
	store: function (key, val) {
		if (key !== undefined) {
			if (val !== undefined) {
				// Store the data
				this._store = this._store || {};
				this._store[key] = val;

				return this;
			}

			if (this._store) {
				return this._store[key];
			}
		}

		return undefined;
	},

	/**
	 * Removes a previously stored key/value pair from the item store, set previously
	 * by using the store() method.
	 * @param {String|*} key The key of the key/value pair to remove;
	 * @returns {Common} Returns this for chaining.
	 */
	unStore: function (key) {
		if (key !== undefined) {
			delete this._store[key];
		}

		return this;
	},

	/**
	 * Returns a non-referenced version of the passed object / array.
	 * @param {Object} data The object or array to return as a non-referenced version.
	 * @param {Number=} copies Optional number of copies to produce. If specified, the return
	 * value will be an array of decoupled objects, each distinct from the other.
	 * @returns {*}
	 */	
	decouple: function (data, copies) {
		if (data !== undefined) {
			if (!copies) {
				return this.jParse(this.jStringify(data));
			} else {
				var i,
					json = this.jStringify(data),
					copyArr = [];

				for (i = 0; i < copies; i++) {
					copyArr.push(this.jParse(json));
				}

				return copyArr;
			}
		}

		return undefined;
	},

	/**
	 * Parses and returns data from stringified version.
	 * @param {String} data The stringified version of data to parse.
	 * @returns {Object} The parsed JSON object from the data.
	 */
	jParse: function (data) {
		return serialiser.parse(data);
		//return JSON.parse(data);
	},

	/**
	 * Converts a JSON object into a stringified version.
	 * @param {Object} data The data to stringify.
	 * @returns {String} The stringified data.
	 */
	jStringify: function (data) {
		return serialiser.stringify(data);
		//return JSON.stringify(data);
	},
	
	/**
	 * Generates a new 16-character hexadecimal unique ID or
	 * generates a new 16-character hexadecimal ID based on
	 * the passed string. Will always generate the same ID
	 * for the same string.
	 * @param {String=} str A string to generate the ID from.
	 * @return {String}
	 */
	objectId: function (str) {
		var id,
			pow = Math.pow(10, 17);

		if (!str) {
			idCounter++;

			id = (idCounter + (
				Math.random() * pow +
				Math.random() * pow +
				Math.random() * pow +
				Math.random() * pow
			)).toString(16);
		} else {
			var val = 0,
				count = str.length,
				i;

			for (i = 0; i < count; i++) {
				val += str.charCodeAt(i) * pow;
			}

			id = val.toString(16);
		}

		return id;
	},

	/**
	 * Gets / sets debug flag that can enable debug message output to the
	 * console if required.
	 * @param {Boolean} val The value to set debug flag to.
	 * @return {Boolean} True if enabled, false otherwise.
	 */
	/**
	 * Sets debug flag for a particular type that can enable debug message
	 * output to the console if required.
	 * @param {String} type The name of the debug type to set flag for.
	 * @param {Boolean} val The value to set debug flag to.
	 * @return {Boolean} True if enabled, false otherwise.
	 */
	debug: new Overload([
		function () {
			return this._debug && this._debug.all;
		},

		function (val) {
			if (val !== undefined) {
				if (typeof val === 'boolean') {
					this._debug = this._debug || {};
					this._debug.all = val;
					this.chainSend('debug', this._debug);
					return this;
				} else {
					return (this._debug && this._debug[val]) || (this._db && this._db._debug && this._db._debug[val]) || (this._debug && this._debug.all);
				}
			}

			return this._debug && this._debug.all;
		},

		function (type, val) {
			if (type !== undefined) {
				if (val !== undefined) {
					this._debug = this._debug || {};
					this._debug[type] = val;
					this.chainSend('debug', this._debug);
					return this;
				}

				return (this._debug && this._debug[val]) || (this._db && this._db._debug && this._db._debug[type]);
			}

			return this._debug && this._debug.all;
		}
	]),

	/**
	 * Returns a string describing the class this instance is derived from.
	 * @returns {string}
	 */
	classIdentifier: function () {
		return 'ForerunnerDB.' + this.className;
	},

	/**
	 * Returns a string describing the instance by it's class name and instance
	 * object name.
	 * @returns {String} The instance identifier.
	 */
	instanceIdentifier: function () {
		return '[' + this.className + ']' + this.name();
	},

	/**
	 * Returns a string used to denote a console log against this instance,
	 * consisting of the class identifier and instance identifier.
	 * @returns {string} The log identifier.
	 */
	logIdentifier: function () {
		return this.classIdentifier() + ': ' + this.instanceIdentifier();
	},

	/**
	 * Converts a query object with MongoDB dot notation syntax
	 * to Forerunner's object notation syntax.
	 * @param {Object} obj The object to convert.
	 */
	convertToFdb: function (obj) {
		var varName,
			splitArr,
			objCopy,
			i;

		for (i in obj) {
			if (obj.hasOwnProperty(i)) {
				objCopy = obj;

				if (i.indexOf('.') > -1) {
					// Replace .$ with a placeholder before splitting by . char
					i = i.replace('.$', '[|$|]');
					splitArr = i.split('.');

					while ((varName = splitArr.shift())) {
						// Replace placeholder back to original .$
						varName = varName.replace('[|$|]', '.$');

						if (splitArr.length) {
							objCopy[varName] = {};
						} else {
							objCopy[varName] = obj[i];
						}

						objCopy = objCopy[varName];
					}

					delete obj[i];
				}
			}
		}
	},

	/**
	 * Checks if the state is dropped.
	 * @returns {boolean} True when dropped, false otherwise.
	 */
	isDropped: function () {
		return this._state === 'dropped';
	}
};

module.exports = Common;