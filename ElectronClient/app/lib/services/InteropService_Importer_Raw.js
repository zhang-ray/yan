const InteropService_Importer_Base = require('lib/services/InteropService_Importer_Base');
const BaseItem = require('lib/models/BaseItem.js');
const BaseModel = require('lib/BaseModel.js');
const Resource = require('lib/models/Resource.js');
const Folder = require('lib/models/Folder.js');
const Note = require('lib/models/Note.js');
const { sprintf } = require('sprintf-js');
const { shim } = require('lib/shim');
const { _ } = require('lib/locale');
const { fileExtension } = require('lib/path-utils');
const { uuid } = require('lib/uuid.js');

class InteropService_Importer_Raw extends InteropService_Importer_Base {

	async exec(result) {
		const itemIdMap = {};
		const createdResources = {};
		const destinationFolderId = this.options_.destinationFolderId;

		const replaceLinkedItemIds = async (noteBody) => {
			let output = noteBody;
			const itemIds = Note.linkedItemIds(noteBody);

			for (let i = 0; i < itemIds.length; i++) {
				const id = itemIds[i];
				if (!itemIdMap[id]) itemIdMap[id] = uuid.create();
				output = output.replace(new RegExp(id, 'gi'), itemIdMap[id]);
			}

			return output;
		}

		const stats = await shim.fsDriver().readDirStats(this.sourcePath_);

		const folderExists = function(stats, folderId) {
			folderId = folderId.toLowerCase();
			for (let i = 0; i < stats.length; i++) {
				const stat = stats[i];
				const statId = BaseItem.pathToId(stat.path);
				if (statId.toLowerCase() === folderId) return true;
			}
			return false;
		}

		let defaultFolder_ = null;
		const defaultFolder = async () => {
			if (defaultFolder_) return defaultFolder_;
			const folderTitle = await Folder.findUniqueItemTitle(this.options_.defaultFolderTitle ? this.options_.defaultFolderTitle : 'Imported');
			defaultFolder_ = await Folder.save({ title: folderTitle });
			return defaultFolder_;
		}

		const setFolderToImportTo = async (itemParentId) => {
			// Logic is a bit complex here:
			// - If a destination folder was specified, move the note to it.
			// - Otherwise, if the associated folder exists, use this.
			// - If it doesn't exist, use the default folder. This is the case for example when importing JEX archives that contain only one or more notes, but no folder.
			const itemParentExists = folderExists(stats, itemParentId);

			if (!itemIdMap[itemParentId]) {
				if (destinationFolderId) {
					itemIdMap[itemParentId] = destinationFolderId;
				} else if (!itemParentExists) {
					const parentFolder = await defaultFolder();
					itemIdMap[itemParentId] = parentFolder.id;
				} else {
					itemIdMap[itemParentId] = uuid.create();
				}
			}
		}

		for (let i = 0; i < stats.length; i++) {
			const stat = stats[i];
			if (stat.isDirectory()) continue;
			if (fileExtension(stat.path).toLowerCase() !== 'md') continue;

			const content = await shim.fsDriver().readFile(this.sourcePath_ + '/' + stat.path);
			let item = await BaseItem.unserialize(content);
			const itemType = item.type_;
			const ItemClass = BaseItem.itemClass(item);

			delete item.type_;

			if (itemType === BaseModel.TYPE_NOTE) {

				await setFolderToImportTo(item.parent_id);

				if (!itemIdMap[item.id]) itemIdMap[item.id] = uuid.create();
				item.id = itemIdMap[item.id];
				item.parent_id = itemIdMap[item.parent_id];
				item.body = await replaceLinkedItemIds(item.body);
			} else if (itemType === BaseModel.TYPE_FOLDER) {
				if (destinationFolderId) continue;

				if (!itemIdMap[item.id]) itemIdMap[item.id] = uuid.create();
				item.id = itemIdMap[item.id];
				item.title = await Folder.findUniqueItemTitle(item.title);

				if (item.parent_id) {
					await setFolderToImportTo(item.parent_id);
					item.parent_id = itemIdMap[item.parent_id];
				}
			} else if (itemType === BaseModel.TYPE_RESOURCE) {
				if (!itemIdMap[item.id]) itemIdMap[item.id] = uuid.create();
				item.id = itemIdMap[item.id];
				createdResources[item.id] = item;
			}

			await ItemClass.save(item, { isNew: true, autoTimestamp: false });
		}

		if (await shim.fsDriver().isDirectory(this.sourcePath_ + '/resources')) {
			const resourceStats = await shim.fsDriver().readDirStats(this.sourcePath_ + '/resources');

			for (let i = 0; i < resourceStats.length; i++) {
				const resourceFilePath = this.sourcePath_ + '/resources/' + resourceStats[i].path;
				const oldId = Resource.pathToId(resourceFilePath);
				const newId = itemIdMap[oldId];
				if (!newId) {
					result.warnings.push(sprintf('Resource file is not referenced in any note and so was not imported: %s', oldId));
					continue;
				}

				const resource = createdResources[newId];
				const destPath = Resource.fullPath(resource);
				await shim.fsDriver().copy(resourceFilePath, destPath);
			}
		}

		return result;
	}

}

module.exports = InteropService_Importer_Raw;