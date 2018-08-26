const { shim } = require('lib/shim');
const katex = require('katex');
const katexCss = require('lib/csstojs/katex.css.js');
const Setting = require('lib/models/Setting');

class MdToHtml_Katex {

	constructor() {
		this.cache_ = {};
		this.assetsLoaded_ = false;
	}

	name() {
		return 'katex';
	}

	processContent(renderedTokens, content, tagType) {
		try {
			const cacheKey = tagType + '_' + content;
			let renderered = null;

			if (this.cache_[cacheKey]) {
				renderered = this.cache_[cacheKey];
			} else {
				renderered = katex.renderToString(content, {
					displayMode: tagType === 'block',
				});
				this.cache_[cacheKey] = renderered;
			}

			if (tagType === 'block') renderered = '<p>' + renderered + '</p>';

			renderedTokens.push(renderered);
		} catch (error) {
			renderedTokens.push('Cannot render Katex content: ' + error.message);
		}
		return renderedTokens;
	}

	extraCss() {
		return katexCss;
	}

	async loadAssets() {
		if (this.assetsLoaded_) return;

		this.assetsLoaded_ = true;
	}

}

module.exports = MdToHtml_Katex;