const { Logger } = require('lib/logger.js');
const Setting = require('lib/models/Setting.js');
const { shim } = require('lib/shim.js');
const { _ } = require('lib/locale.js');

const reg = {};


reg.logger = () => {
	if (!reg.logger_) {
		//console.warn('Calling logger before it is initialized');
		return new Logger();
	}

	return reg.logger_;
}

reg.setLogger = (l) => {
	reg.logger_ = l;
}

reg.setShowErrorMessageBoxHandler = (v) => {
	reg.showErrorMessageBoxHandler_ = v;
}

reg.showErrorMessageBox = (message) => {
	if (!reg.showErrorMessageBoxHandler_) return;
	reg.showErrorMessageBoxHandler_(message);
}

reg.setDb = (v) => {
	reg.db_ = v;
}

reg.db = () => {
	return reg.db_;
}

module.exports = { reg };