const { createStore, applyMiddleware } = require('redux');
const { reducer, defaultState, stateUtils } = require('lib/reducer.js');
const { JoplinDatabase } = require('lib/joplin-database.js');
const { FoldersScreenUtils } = require('lib/folders-screen-utils.js');
const { DatabaseDriverNode } = require('lib/database-driver-node.js');
const BaseModel = require('lib/BaseModel.js');
const Folder = require('lib/models/Folder.js');
const Note = require('lib/models/Note.js');
const Setting = require('lib/models/Setting.js');
const { Logger } = require('lib/logger.js');
const { reg } = require('lib/registry.js');
const { time } = require('lib/time-utils.js');
const { shim } = require('lib/shim.js');
const { _ } = require('lib/locale.js');
const reduxSharedMiddleware = require('lib/components/shared/reduxSharedMiddleware');
const os = require('os');
const fs = require('fs-extra');
const EventEmitter = require('events');
const syswidecas = require('syswide-cas');
const BaseService = require('lib/services/BaseService');

class BaseApplication {

	constructor() {
		this.logger_ = new Logger();
		this.dbLogger_ = new Logger();
		this.eventEmitter_ = new EventEmitter();

		// Note: this is basically a cache of state.selectedFolderId. It should *only* 
		// be derived from the state and not set directly since that would make the
		// state and UI out of sync.
		this.currentFolder_ = null; 
	}

	logger() {
		return this.logger_;
	}

	store() {
		return this.store_;
	}

	currentFolder() {
		return this.currentFolder_;
	}


	on(eventName, callback) {
		return this.eventEmitter_.on(eventName, callback);
	}

	async exit(code = 0) {
		await Setting.saveAll();
		process.exit(code);
	}

	async refreshNotes(state) {
		let parentType = state.notesParentType;
		let parentId = null;
		
		if (parentType === 'Folder') {
			parentId = state.selectedFolderId;
			parentType = BaseModel.TYPE_FOLDER;
		} else if (parentType === 'Search') {
			parentId = state.selectedSearchId;
			parentType = BaseModel.TYPE_SEARCH;
		}

		this.logger().debug('Refreshing notes:', parentType, parentId);

		let options = {
			order: stateUtils.notesOrder(state.settings),
			caseInsensitive: true,
		};

		const source = JSON.stringify({
			options: options,
			parentId: parentId,
		});

		let notes = [];

		if (parentId) {
			if (parentType === Folder.modelType()) {
				notes = await Note.previews(parentId, options);
			} else if (parentType === BaseModel.TYPE_SEARCH) {
				let fields = Note.previewFields();
				let search = BaseModel.byId(state.searches, parentId);
				notes = await Note.previews(null, {
					fields: fields,
					anywherePattern: '*' + search.query_pattern + '*',
				});
			}
		}

		this.store().dispatch({
			type: 'NOTE_UPDATE_ALL',
			notes: notes,
			notesSource: source,
		});

		this.store().dispatch({
			type: 'NOTE_SELECT',
			id: notes.length ? notes[0].id : null,
		});
	}

	reducerActionToString(action) {
		let o = [action.type];
		if ('id' in action) o.push(action.id);
		if ('noteId' in action) o.push(action.noteId);
		if ('folderId' in action) o.push(action.folderId);
		if ('tagId' in action) o.push(action.tagId);
		if ('tag' in action) o.push(action.tag.id);
		if ('folder' in action) o.push(action.folder.id);
		if ('notesSource' in action) o.push(JSON.stringify(action.notesSource));
		return o.join(', ');
	}

	hasGui() {
		return false;
	}

	uiType() {
		return this.hasGui() ? 'gui' : 'cli';
	}

	generalMiddlewareFn() {
		const middleware = store => next => (action) => {
			return this.generalMiddleware(store, next, action);
		}

		return middleware;
	}

	async generalMiddleware(store, next, action) {
		this.logger().debug('Reducer action', this.reducerActionToString(action));

		const result = next(action);
		const newState = store.getState();
		let refreshNotes = false;

		reduxSharedMiddleware(store, next, action);

		if (action.type == 'FOLDER_SELECT' || action.type === 'FOLDER_DELETE' || (action.type === 'SEARCH_UPDATE' && newState.notesParentType === 'Folder')) {
			Setting.setValue('activeFolderId', newState.selectedFolderId);
			this.currentFolder_ = newState.selectedFolderId ? await Folder.load(newState.selectedFolderId) : null;
			refreshNotes = true;
		}

		if (this.hasGui() && ((action.type == 'SETTING_UPDATE_ONE') || action.type == 'SETTING_UPDATE_ALL')) {
			refreshNotes = true;
		}

		if (this.hasGui() && ((action.type == 'SETTING_UPDATE_ONE') || action.type == 'SETTING_UPDATE_ALL')) {
			refreshNotes = true;
		}

		if (this.hasGui() && ((action.type == 'SETTING_UPDATE_ONE' && action.key.indexOf('notes.sortOrder') === 0) || action.type == 'SETTING_UPDATE_ALL')) {
			refreshNotes = true;
		}

		if (action.type == 'TAG_SELECT' || action.type === 'TAG_DELETE') {
			refreshNotes = true;
		}

		if (action.type == 'SEARCH_SELECT' || action.type === 'SEARCH_DELETE') {
			refreshNotes = true;
		}

		if (refreshNotes) {
			await this.refreshNotes(newState);
		}

		if ((action.type == 'SETTING_UPDATE_ONE' && (action.key == 'dateFormat' || action.key == 'timeFormat')) || (action.type == 'SETTING_UPDATE_ALL')) {
			time.setDateFormat(Setting.value('dateFormat'));
			time.setTimeFormat(Setting.value('timeFormat'));
		}

		if ((action.type == 'SETTING_UPDATE_ONE' && action.key == 'net.ignoreTlsErrors') || (action.type == 'SETTING_UPDATE_ALL')) {
			// https://stackoverflow.com/questions/20082893/unable-to-verify-leaf-signature
			process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = Setting.value('net.ignoreTlsErrors') ? '0' : '1';
		}

		if ((action.type == 'SETTING_UPDATE_ONE' && action.key == 'net.customCertificates') || (action.type == 'SETTING_UPDATE_ALL')) {
			const caPaths = Setting.value('net.customCertificates').split(',');
			for (let i = 0; i < caPaths.length; i++) {
				const f = caPaths[i].trim();
				if (!f) continue;
				syswidecas.addCAs(f);
			}
		}

		if (action.type === 'NOTE_UPDATE_ONE') {
			// If there is a conflict, we refresh the folders so as to display "Conflicts" folder
			if (action.note && action.note.is_conflict) {
				await FoldersScreenUtils.refreshFolders();
			}
		}

	  	return result;
	}

	dispatch(action) {
		if (this.store()) return this.store().dispatch(action);
	}

	reducer(state = defaultState, action) {
		return reducer(state, action);
	}

	initRedux() {
		this.store_ = createStore(this.reducer, applyMiddleware(this.generalMiddlewareFn()));
		BaseModel.dispatch = this.store().dispatch;
		FoldersScreenUtils.dispatch = this.store().dispatch;
		reg.dispatch = this.store().dispatch;
	}

	async readFlagsFromFile(flagPath) {
		return {};
	}

	determineProfileDir() {
		return os.homedir() + '/.config/' + Setting.value('appName');
	}


	determineBackupDir(){
		return os.homedir() + '/.backup/' + Setting.value('appName');
	}


	async start(argv) {
		const profileDir = this.determineProfileDir();
		const resourceDir = profileDir + '/resources';
		const tempDir = profileDir + '/tmp';

		const backupDir = this.determineBackupDir();

		Setting.setConstant('profileDir', profileDir);
		Setting.setConstant('resourceDir', resourceDir);
		Setting.setConstant('tempDir', tempDir);
		Setting.setConstant('backupDir', backupDir);

		await shim.fsDriver().remove(tempDir);

		await fs.mkdirp(profileDir, 0o755);
		await fs.mkdirp(resourceDir, 0o755);
		await fs.mkdirp(tempDir, 0o755);
		await fs.mkdirp(backupDir, 0o700);

		this.logger_.addTarget('file', { path: profileDir + '/log.txt' });
		//this.logger_.addTarget('console');
		this.logger_.setLevel(Logger.LEVEL_DEBUG);

		reg.setLogger(this.logger_);
		reg.dispatch = (o) => {};

		this.dbLogger_.addTarget('file', { path: profileDir + '/log-database.txt' });
		this.dbLogger_.setLevel(Logger.LEVEL_DEBUG);

		this.logger_.info('Profile directory: ' + profileDir);

		this.database_ = new JoplinDatabase(new DatabaseDriverNode());
		this.database_.setLogExcludedQueryTypes(['SELECT']);
		this.database_.setLogger(this.dbLogger_);
		await this.database_.open({ name: profileDir + '/database.sqlite' });

		reg.setDb(this.database_);
		BaseModel.db_ = this.database_;

		await Setting.load();

		BaseService.logger_ = this.logger_;

		let currentFolderId = Setting.value('activeFolderId');
		let currentFolder = null;
		if (currentFolderId) currentFolder = await Folder.load(currentFolderId);
		if (!currentFolder) currentFolder = await Folder.defaultFolder();
		Setting.setValue('activeFolderId', currentFolder ? currentFolder.id : '');

		// await this.testing();process.exit();

		return argv;
	}

}

module.exports = { BaseApplication };