const BaseModel = require('lib/BaseModel.js');
const BaseItem = require('lib/models/BaseItem.js');
const NoteResource = require('lib/models/NoteResource.js');
const Setting = require('lib/models/Setting.js');
const ArrayUtils = require('lib/ArrayUtils.js');
const pathUtils = require('lib/path-utils.js');
const { mime } = require('lib/mime-utils.js');
const { filename } = require('lib/path-utils.js');
const { FsDriverDummy } = require('lib/fs-driver-dummy.js');
const markdownUtils = require('lib/markdownUtils');
const JoplinError = require('lib/JoplinError');

class Resource extends BaseItem {

	static tableName() {
		return 'resources';
	}

	static modelType() {
		return BaseModel.TYPE_RESOURCE;
	}

	static encryptionService() {
		if (!this.encryptionService_) throw new Error('Resource.encryptionService_ is not set!!');
		return this.encryptionService_;
	}

	static isSupportedImageMimeType(type) {
		const imageMimeTypes = ["image/jpg", "image/jpeg", "image/png", "image/gif"];
		return imageMimeTypes.indexOf(type.toLowerCase()) >= 0;
	}

	static fsDriver() {
		if (!Resource.fsDriver_) Resource.fsDriver_ = new FsDriverDummy();
		return Resource.fsDriver_;
	}

	static async serialize(item, type = null, shownKeys = null) {
		let fieldNames = this.fieldNames();
		fieldNames.push('type_');
		//fieldNames = ArrayUtils.removeElement(fieldNames, 'encryption_blob_encrypted');
		return super.serialize(item, 'resource', fieldNames);
	}

	static filename(resource, encryptedBlob = false) {
		let extension = encryptedBlob ? 'crypted' : resource.file_extension;
		if (!extension) extension = resource.mime ? mime.toFileExtension(resource.mime) : '';
		extension = extension ? ('.' + extension) : '';
		return resource.id + extension;
	}

	static fullPath(resource, encryptedBlob = false) {
		return Setting.value('resourceDir') + '/' + this.filename(resource, encryptedBlob);
	}

	static markdownTag(resource) {
		let tagAlt = resource.alt ? resource.alt : resource.title;
		if (!tagAlt) tagAlt = '';
		let lines = [];
		if (Resource.isSupportedImageMimeType(resource.mime)) {
			lines.push("![");
			lines.push(markdownUtils.escapeLinkText(tagAlt));
			lines.push("](:/" + resource.id + ")");
		} else {
			lines.push("[");
			lines.push(markdownUtils.escapeLinkText(tagAlt));
			lines.push("](:/" + resource.id + ")");
		}
		return lines.join('');
	}

	static internalUrl(resource) {
		return ':/' + resource.id;
	}

	static pathToId(path) {
		return filename(path);
	}

	static async content(resource) {
		return this.fsDriver().readFile(this.fullPath(resource), 'Buffer');
	}

	static setContent(resource, content) {
		return this.fsDriver().writeBinaryFile(this.fullPath(resource), content);
	}

	static isResourceUrl(url) {
		return url && url.length === 34 && url[0] === ':' && url[1] === '/';
	}

	static urlToId(url) {
		if (!this.isResourceUrl(url)) throw new Error('Not a valid resource URL: ' + url);
		return url.substr(2);
	}

	static async batchDelete(ids, options = null) {
		// For resources, there's not really batch deleting since there's the file data to delete
		// too, so each is processed one by one with the item being deleted last (since the db
		// call is the less likely to fail).
		for (let i = 0; i < ids.length; i++) {
			const id = ids[i];
			const resource = await Resource.load(id);
			if (!resource) continue;

			const path = Resource.fullPath(resource);
			await this.fsDriver().remove(path);
			await super.batchDelete([id], options);
			await NoteResource.deleteByResource(id); // Clean up note/resource relationships
		}
	}

}

Resource.IMAGE_MAX_DIMENSION = 1920;

module.exports = Resource;