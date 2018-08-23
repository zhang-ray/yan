const { sprintf } = require('sprintf-js');

function _(s, ...args) {
	result = s;
	try {
		return sprintf(result, ...args);
	} catch (error) {
		return result + ' ' + args.join(', ') + ' (Translation error: ' + error.message + ')';
	}
}

module.exports = { _ };