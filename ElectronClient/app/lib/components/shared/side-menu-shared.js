const ArrayUtils = require('lib/ArrayUtils');
const Folder = require('lib/models/Folder');
const BaseModel = require('lib/BaseModel');

let shared = {};

function folderHasChildren_(folders, folderId) {
	for (let i = 0; i < folders.length; i++) {
		let folder = folders[i];
		if (folder.parent_id === folderId) return true;
	}
	return false;
}

function folderIsVisible(folders, folderId, collapsedFolderIds) {
	if (!collapsedFolderIds || !collapsedFolderIds.length) return true;

	while (true) {
		let folder = BaseModel.byId(folders, folderId);
		if (!folder) throw new Error('No folder with id ' + folder.id);
		if (!folder.parent_id) return true;
		if (collapsedFolderIds.indexOf(folder.parent_id) >= 0) return false;
		folderId = folder.parent_id;
	}

	return true;
}

function renderFoldersRecursive_(props, renderItem, items, parentId, depth) {
	const folders = props.folders;
	for (let i = 0; i < folders.length; i++) {
		let folder = folders[i];
		if (!Folder.idsEqual(folder.parent_id, parentId)) continue;
		if (!folderIsVisible(props.folders, folder.id, props.collapsedFolderIds)) continue;
		const hasChildren = folderHasChildren_(folders, folder.id);
		items.push(renderItem(folder, props.selectedFolderId == folder.id && props.notesParentType == 'Folder', hasChildren, depth));
		if (hasChildren) items = renderFoldersRecursive_(props, renderItem, items, folder.id, depth + 1);
	}
	return items;
}

shared.renderFolders = function(props, renderItem) {
	return renderFoldersRecursive_(props, renderItem, [], '', 0);
}

shared.renderSearches = function(props, renderItem) {
	let searches = props.searches.slice();
	let searchItems = [];
	for (let i = 0; i < searches.length; i++) {
		const search = searches[i];
		searchItems.push(renderItem(search, props.selectedSearchId == search.id && props.notesParentType == 'Search'));
	}
	return searchItems;
}

module.exports = shared;