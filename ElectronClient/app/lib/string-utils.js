function wrap(text, indent, width) {
	const wrap_ = require('word-wrap');

	return wrap_(text, {
		width: width - indent.length,
		indent: indent,
	});
}

function toTitleCase(string) {
	if (!string) return string;
	return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = { wrap, toTitleCase };