"use strict";

/**
 * Provides angular scope updating functionality to ForerunnerDB. Allows
 * collections and views to provide data to angular and to automatically
 * update angular when data in ForerunnerDB changes.
 * @class Angular
 */

var Shared = window.ForerunnerDB.shared,
	Angular = {};

Shared.addModule('Angular', Angular);

/**
 * Extends the Collection class with new binding capabilities.
 * @extends Collection
 * @param {Collection} Module The Collection class module.
 * @private
 */
Angular.extendCollection = function (Module) {
	var superDrop = Module.prototype.drop;

	/**
	 * Creates a link to the DOM between the collection data and the elements
	 * in the passed output selector. When new elements are needed or changes
	 * occur the passed templateSelector is used to get the template that is
	 * output to the DOM.
	 * @func link
	 * @memberof Collection
	 * @param scope
	 * @param varName
	 * @param {Object=} options Optional extra options.
	 * @see unlink
	 */
	Module.prototype.ng = function (scope, varName, options) {
		var self = this,
			link,
			i;

		if (scope && varName) {
			self._ngLinks = self._ngLinks || [];

			link = {
				scope: scope,
				varName: varName,
				callback: function () {
					if (options && options.$single) {
						scope[varName] = self.findOne();
					} else {
						scope[varName] = self.find();
					}

					scope.$apply();
				}
			};

			self._ngLinks.push(link);

			// Hook the angular destroy event to remove this link
			scope.$on("$destroy", function(){
				if (self._ngLinks && self._ngLinks.length) {
					for (i = self._ngLinks.length - 1; i >= 0; i--) {
						if (self._ngLinks[i].scope === scope) {
							self.off('change', link.callback);
							self._ngLinks.splice(i, 1);
						}
					}
				}
			});

			// Hook the ForerunnerDB change event to inform angular of a change
			self.on('change', link.callback);

			// Now update the view
			if (link.callback) { link.callback(); }
		} else {
			throw(this.logIdentifier() + ' Cannot link to angular $scope if no scope or variable name is passed!');
		}
	};

	Module.prototype.drop = function () {
		if (this._ngLinks) {
			delete this._ngLinks;
		}

		return superDrop.apply(this, arguments);
	};
};

/**
 * Extends the View class with new binding capabilities.
 * @extends View
 * @param {View} Module The View class module.
 * @private
 */
Angular.extendView = function (Module) {
	Module.prototype.ng = function (scope, varName, options) {
		var publicData = this.publicData();

		publicData.ng(scope, varName, options);

		return this;
	};
};

Angular.extendDocument = function (Module) {
	var superDrop = Module.prototype.drop;

	Module.prototype.ng = function (scope, varName, options) {
		var self = this,
				watchUpdating = false,
				link,
				i;

		if (scope && varName) {
			self._ngLinks = self._ngLinks || [];

			link = {
				scope: scope,
				varName: varName,
				callback: function () {
					scope[varName] = self.find();
					scope.$apply();
				}
			};

			self._ngLinks.push(link);

			// Hook the angular destroy event to remove this link
			scope.$on("$destroy", function(){
				if (self._ngLinks && self._ngLinks.length) {
					for (i = self._ngLinks.length - 1; i >= 0; i--) {
						if (self._ngLinks[i].scope === scope) {
							self.off('change', link.callback);
							self._ngLinks.splice(i, 1);
						}
					}
				}
			});

			// Hook the angular watch event to update our data if the
			// angular data is updated by content
			scope.$watch(varName, function(newValue) {
				watchUpdating = true;
				console.log('Updating', newValue);
				self.update({}, newValue);
				watchUpdating = false;
			}, true);

			// Hook the ForerunnerDB change event to inform angular of a change
			self.on('change', function () {
				if (!watchUpdating) {
					link.callback.apply(this, arguments);
				} else {
					console.log('Ignoring update as it is a watch update');
				}
			});

			// Now update the view
			if (link.callback) { link.callback(); }
		} else {
			throw(this.logIdentifier() + ' Cannot link to angular $scope if no scope or variable name is passed!');
		}
	};

	Module.prototype.drop = function () {
		if (this._ngLinks) {
			delete this._ngLinks;
		}

		return superDrop.apply(this, arguments);
	};
};

/**
 * Extends the Overview class with new binding capabilities.
 * @extends Overview
 * @param {Overview} Module The Overview class module.
 * @private
 */
Angular.extendOverview = function (Module) {
	Module.prototype.ng = function (scope, varName, options) {
		this._data.ng.apply(this._data, arguments);
		this._refresh();
	};
};

// Define modules that we wish to work on
var modules = ['Collection', 'View', 'Overview', 'Document'],
	moduleIndex,
	moduleFinished = function (name, module) {
		if (Angular['extend' + name]) {
			Angular['extend' + name](module);
		}
	};

// Extend modules that are finished loading
for (moduleIndex = 0; moduleIndex < modules.length; moduleIndex++) {
	Shared.moduleFinished(modules[moduleIndex], moduleFinished);
}

Shared.finishModule('Angular');
module.exports = Angular;
