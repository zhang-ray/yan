const Setting = require('lib/models/Setting.js');
const ObjectUtils = require('lib/ObjectUtils');
const { _ } = require('lib/locale.js');

const shared = {}

shared.init = function(comp) {
	if (!comp.state) comp.state = {};
	comp.state.settings = {};
	comp.state.changedSettingKeys = [];
}

shared.updateSettingValue = function(comp, key, value) {
	const settings = Object.assign({}, comp.state.settings);
	const changedSettingKeys = comp.state.changedSettingKeys.slice();
	settings[key] = Setting.formatValue(key, value);
	if (changedSettingKeys.indexOf(key) < 0) changedSettingKeys.push(key);

	comp.setState({
		settings: settings,
		changedSettingKeys: changedSettingKeys,
	});
}

shared.saveSettings = function(comp) {
	for (let key in comp.state.settings) {
		if (!comp.state.settings.hasOwnProperty(key)) continue;
		if (comp.state.changedSettingKeys.indexOf(key) < 0) continue;
		console.info("Saving", key, comp.state.settings[key]);
		Setting.setValue(key, comp.state.settings[key]);
	}

	comp.setState({ changedSettingKeys: [] });
}

shared.settingsToComponents = function(comp, device, settings) {
	const keys = Setting.keys(true, device);
	const settingComps = [];

	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		if (!Setting.isPublic(key)) continue;

		const md = Setting.settingMetadata(key);
		if (md.show && !md.show(settings)) continue;

		const settingComp = comp.settingToComponent(key, settings[key]);
		if (!settingComp) continue;
		settingComps.push(settingComp);
	}

	return settingComps
}

module.exports = shared;