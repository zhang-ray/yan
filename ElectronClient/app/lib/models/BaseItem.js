const BaseModel = require('lib/BaseModel.js');
const { Database } = require('lib/database.js');
const Setting = require('lib/models/Setting.js');
const JoplinError = require('lib/JoplinError.js');
const { time } = require('lib/time-utils.js');
const { sprintf } = require('sprintf-js');
const { _ } = require('lib/locale.js');
const moment = require('moment');
const markdownUtils = require('lib/markdownUtils');

class BaseItem extends BaseModel {

	static useUuid() {
		return true;
	}

	static loadClass(className, classRef) {
		for (let i = 0; i < BaseItem.syncItemDefinitions_.length; i++) {
			if (BaseItem.syncItemDefinitions_[i].className == className) {
				BaseItem.syncItemDefinitions_[i].classRef = classRef;
				return;
			}
		}

		throw new Error('Invalid class name: ' + className);
	}

	static async findUniqueItemTitle(title) {
		let counter = 1;
		let titleToTry = title;
		while (true) {
			const item = await this.loadByField('title', titleToTry);
			if (!item) return titleToTry;
			titleToTry = title + ' (' + counter + ')';
			counter++;
			if (counter >= 100) titleToTry = title + ' (' + ((new Date()).getTime()) + ')';
			if (counter >= 1000) throw new Error('Cannot find unique title');
		}
	}

	// Need to dynamically load the classes like this to avoid circular dependencies
	static getClass(name) {
		for (let i = 0; i < BaseItem.syncItemDefinitions_.length; i++) {
			if (BaseItem.syncItemDefinitions_[i].className == name) {
				const classRef = BaseItem.syncItemDefinitions_[i].classRef;
				if (!classRef) throw new Error('Class has not been loaded: ' + name);
				return BaseItem.syncItemDefinitions_[i].classRef;
			}
		}

		throw new Error('Invalid class name: ' + name);
	}

	static getClassByItemType(itemType) {
		for (let i = 0; i < BaseItem.syncItemDefinitions_.length; i++) {
			if (BaseItem.syncItemDefinitions_[i].type == itemType) {
				return BaseItem.syncItemDefinitions_[i].classRef;
			}
		}

		throw new Error('Invalid item type: ' + itemType);
	}

	static systemPath(itemOrId) {
		if (typeof itemOrId === 'string') return itemOrId + '.md';
		return itemOrId.id + '.md';
	}

	static isSystemPath(path) {
		// 1b175bb38bba47baac22b0b47f778113.md
		if (!path || !path.length) return false;
		let p = path.split('/');
		p = p[p.length - 1];
		p = p.split('.');
		if (p.length != 2) return false;
		return p[0].length == 32 && p[1] == 'md';
	}

	static itemClass(item) {
		if (!item) throw new Error('Item cannot be null');

		if (typeof item === 'object') {
			if (!('type_' in item)) throw new Error('Item does not have a type_ property');
			return this.itemClass(item.type_);
		} else {
			for (let i = 0; i < BaseItem.syncItemDefinitions_.length; i++) {
				let d = BaseItem.syncItemDefinitions_[i];
				if (Number(item) == d.type) return this.getClass(d.className);
			}
			throw new Error('Unknown type: ' + item);
		}
	}

	static pathToId(path) {
		let p = path.split('/');
		let s = p[p.length - 1].split('.');
		return s[0];
	}

	static async loadItemById(id) {
		let classes = this.syncItemClassNames();
		for (let i = 0; i < classes.length; i++) {
			let item = await this.getClass(classes[i]).load(id);
			if (item) return item;
		}
		return null;
	}

	static async delete(id, options = null) {
		return this.batchDelete([id], options);
	}

	static async batchDelete(ids, options = null) {
		let trackDeleted = true;
		if (options && options.trackDeleted !== null && options.trackDeleted !== undefined) trackDeleted = options.trackDeleted;

		// Don't create a deleted_items entry when conflicted notes are deleted
		// since no other client have (or should have) them.
		let conflictNoteIds = [];
		if (this.modelType() == BaseModel.TYPE_NOTE) {
			const conflictNotes = await this.db().selectAll('SELECT id FROM notes WHERE id IN ("' + ids.join('","') + '") AND is_conflict = 1');
			conflictNoteIds = conflictNotes.map((n) => { return n.id });
		}

		await super.batchDelete(ids, options);

		if (trackDeleted) {
			const syncTargetIds = Setting.enumOptionValues('sync.target');
			let queries = [];
			let now = time.unixMs();
			for (let i = 0; i < ids.length; i++) {
				if (conflictNoteIds.indexOf(ids[i]) >= 0) continue;

				// For each deleted item, for each sync target, we need to add an entry in deleted_items.
				// That way, each target can later delete the remote item.
				for (let j = 0; j < syncTargetIds.length; j++) {
					queries.push({
						sql: 'INSERT INTO deleted_items (item_type, item_id, deleted_time, sync_target) VALUES (?, ?, ?, ?)',
						params: [this.modelType(), ids[i], now, syncTargetIds[j]],
					});
				}
			}
			await this.db().transactionExecBatch(queries);
		}
	}

	static serialize_format(propName, propValue) {
		if (['created_time', 'updated_time', 'sync_time', 'user_updated_time', 'user_created_time'].indexOf(propName) >= 0) {
			if (!propValue) return '';
			propValue = moment.unix(propValue / 1000).utc().format('YYYY-MM-DDTHH:mm:ss.SSS') + 'Z';
		} else if (propValue === null || propValue === undefined) {
			propValue = '';
		}

		return propValue;
	}

	static unserialize_format(type, propName, propValue) {
		if (propName[propName.length - 1] == '_') return propValue; // Private property

		let ItemClass = this.itemClass(type);

		if (['created_time', 'updated_time', 'user_created_time', 'user_updated_time'].indexOf(propName) >= 0) {
			if (!propValue) return 0;
			propValue = moment(propValue, 'YYYY-MM-DDTHH:mm:ss.SSSZ').format('x');
		} else {
			propValue = Database.formatValue(ItemClass.fieldType(propName), propValue);
		}

		return propValue;
	}

	static async serialize(item, type = null, shownKeys = null) {
		item = this.filter(item);

		let output = {};

		if ('title' in item && shownKeys.indexOf('title') >= 0) {
			output.title = item.title;
		}

		if ('body' in item && shownKeys.indexOf('body') >= 0) {
			output.body = item.body;
		}

		output.props = [];

		for (let i = 0; i < shownKeys.length; i++) {
			let key = shownKeys[i];
			if (key == 'title' || key == 'body') continue;

			let value = null;
			if (typeof key === 'function') {
				let r = await key();
				key = r.key;
				value = r.value;
			} else {
				value = this.serialize_format(key, item[key]);
			}

			output.props.push(key + ': ' + value);
		}

		let temp = [];

		if (output.title) temp.push(output.title);
		if (output.body) temp.push(output.body);
		if (output.props.length) temp.push(output.props.join("\n"));

		return temp.join("\n\n");
	}

	static async unserialize(content) {
		let lines = content.split("\n");
		let output = {};
		let state = 'readingProps';
		let body = [];

		for (let i = lines.length - 1; i >= 0; i--) {
			let line = lines[i];

			if (state == 'readingProps') {
				line = line.trim();

				if (line == '') {
					state = 'readingBody';
					continue;
				}

				let p = line.indexOf(':');
				if (p < 0) throw new Error('Invalid property format: ' + line + ": " + content);
				let key = line.substr(0, p).trim();
				let value = line.substr(p + 1).trim();
				output[key] = value;
			} else if (state == 'readingBody') {
				body.splice(0, 0, line);
			}
		}

		if (!output.type_) throw new Error('Missing required property: type_: ' + content);
		output.type_ = Number(output.type_);

		if (body.length) {
			let title = body.splice(0, 2);
			output.title = title[0];
		}

		if (output.type_ === BaseModel.TYPE_NOTE) output.body = body.join("\n");

		for (let n in output) {
			if (!output.hasOwnProperty(n)) continue;
			output[n] = await this.unserialize_format(output.type_, n, output[n]);
		}

		return output;
	}
	

	static syncItemClassNames() {
		return BaseItem.syncItemDefinitions_.map((def) => {
			return def.className;
		});
	}

	static displayTitle(item) {
		if (!item) return '';
		return !!item.encryption_applied ? '🔑 ' + _('Encrypted') : item.title + '';
	}
	
	static async save(o, options = null) {
		if (!options) options = {};

		if (options.userSideValidation === true) {
			if (!!o.encryption_applied) throw new Error(_('Encrypted items cannot be modified'));
		}

		return super.save(o, options);
	}

	static markdownTag(item) {
		const output = [];
		output.push('[');
		output.push(markdownUtils.escapeLinkText(item.title));
		output.push(']');
		output.push('(:/' + item.id + ')');
		return output.join('');
	}

}

// Also update:
// - itemsThatNeedSync()
// - syncedItems()

BaseItem.syncItemDefinitions_ = [
	{ type: BaseModel.TYPE_NOTE, className: 'Note' },
	{ type: BaseModel.TYPE_FOLDER, className: 'Folder' },
	{ type: BaseModel.TYPE_RESOURCE, className: 'Resource' },
];

module.exports = BaseItem;