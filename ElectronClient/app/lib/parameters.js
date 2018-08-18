const Setting = require('lib/models/Setting.js');

const parameters_ = {};

parameters_.dev = {
};

parameters_.prod = {
};

function parameters(env = null) {
	if (env === null) env = Setting.value('env');
	let output = parameters_[env];
	return output;
}

module.exports = { parameters };