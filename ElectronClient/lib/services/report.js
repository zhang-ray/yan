const { time } = require('lib/time-utils');
const BaseItem = require('lib/models/BaseItem.js');
const Alarm = require('lib/models/Alarm');
const Folder = require('lib/models/Folder.js');
const Note = require('lib/models/Note.js');
const { _ } = require('lib/locale.js');

class ReportService {

	csvEscapeCell(cell) {
		cell = this.csvValueToString(cell);
		let output = cell.replace(/"/, '""');
		if (this.csvCellRequiresQuotes(cell, ',')) {
			return '"' + output + '"';
		}
		return output;
	}

	csvCellRequiresQuotes(cell, delimiter) {
		if (cell.indexOf('\n') >= 0) return true;
		if (cell.indexOf('"') >= 0) return true;
		if (cell.indexOf(delimiter) >= 0) return true;
		return false;
	}

	csvValueToString(v) {
		if (v === undefined || v === null) return '';
		return v.toString();
	}

	csvCreateLine(row) {
		for (let i = 0; i < row.length; i++) {
			row[i] = this.csvEscapeCell(row[i]);
		}
		return row.join(',');
	}

	csvCreate(rows) {
		let output = [];
		for (let i = 0; i < rows.length; i++) {
			output.push(this.csvCreateLine(rows[i]));
		}
		return output.join('\n');
	}

	async basicItemList(option = null) {
		if (!option) option = {};
		if (!option.format) option.format = 'array';

		const itemTypes = BaseItem.syncItemTypes();
		let output = [];
		output.push(['type', 'id', 'updated_time', 'sync_time', 'is_conflict']);
		for (let i = 0; i < itemTypes.length; i++) {
			const itemType = itemTypes[i];
			const ItemClass = BaseItem.getClassByItemType(itemType);
			const items = await ItemClass.modelSelectAll('SELECT items.id, items.updated_time, sync_items.sync_time FROM ' + ItemClass.tableName() + ' items JOIN sync_items ON sync_items.item_id = items.id');

			for (let j = 0; j < items.length; j++) {
				const item = items[j];
				let row = [itemType, item.id, item.updated_time, item.sync_time];
				row.push(('is_conflict' in item) ? item.is_conflict : '');
				output.push(row);
			}
		}

		return option.format === 'csv' ? this.csvCreate(output) : output;
	}


}

module.exports = { ReportService };