const React = require('react');
const { connect } = require('react-redux');
const { Header } = require('./Header.min.js');
const { SideBar } = require('./SideBar.min.js');
const { NoteList } = require('./NoteList.min.js');
const { NoteText } = require('./NoteText.min.js');
const { PromptDialog } = require('./PromptDialog.min.js');
const Setting = require('lib/models/Setting.js');
const BaseModel = require('lib/BaseModel.js');
const Note = require('lib/models/Note.js');
const { uuid } = require('lib/uuid.js');
const Folder = require('lib/models/Folder.js');
const { themeStyle } = require('../theme.js');
const { _ } = require('lib/locale.js');
const layoutUtils = require('lib/layout-utils.js');
const { bridge } = require('electron').remote.require('./bridge');
const eventManager = require('../eventManager');

class MainScreenComponent extends React.Component {

	componentWillMount() {
		this.setState({
			promptOptions: null,
			modalLayer: {
				visible: false,
				message: '',
			}
		});
	}

	componentWillReceiveProps(newProps) {
		if (newProps.windowCommand) {
			this.doCommand(newProps.windowCommand);
		}
	}

	toggleVisiblePanes() {
		this.props.dispatch({
			type: 'NOTE_VISIBLE_PANES_TOGGLE',
		});
	}

	toggleSidebar() {
		this.props.dispatch({
			type: 'SIDEBAR_VISIBILITY_TOGGLE',
		});
	}

	async doCommand(command) {
		if (!command) return;

		const createNewNote = async (title, isTodo) => {
			const folderId = Setting.value('activeFolderId');
			if (!folderId) return;

			const newNote = {
				parent_id: folderId,
				is_todo: isTodo ? 1 : 0,
			};

			this.props.dispatch({
				type: 'NOTE_SET_NEW_ONE',
				item: newNote,
			});
		}

		let commandProcessed = true;

		if (command.name === 'newNote') {
			if (!this.props.folders.length) {
				bridge().showErrorMessageBox(_('Please create a notebook first.'));
				return;
			}

			await createNewNote(null, false);
		} else if (command.name === 'newNotebook') {
			this.setState({
				promptOptions: {
					label: _('Notebook title:'),
					onClose: async (answer) => {
						if (answer) {
							let folder = null;
							try {
								folder = await Folder.save({ title: answer }, { userSideValidation: true });
							} catch (error) {
								bridge().showErrorMessageBox(error.message);
							}

							if (folder) {
								this.props.dispatch({
									type: 'FOLDER_SELECT',
									id: folder.id,
								});
							}
						}

						this.setState({ promptOptions: null });
					}
				},
			});
		} else if (command.name === 'renameFolder') {
			const folder = await Folder.load(command.id);
			if (!folder) return;

			this.setState({
				promptOptions: {
					label: _('Rename notebook:'),
					value: folder.title,
					onClose: async (answer) => {
						if (answer !== null) {
							try {
								folder.title = answer;
								await Folder.save(folder, { fields: ['title'], userSideValidation: true });
							} catch (error) {
								bridge().showErrorMessageBox(error.message);
							}
						}
						this.setState({ promptOptions: null });
					}
				},
			});
		} else if (command.name === 'search') {

			if (!this.searchId_) this.searchId_ = uuid.create();

			this.props.dispatch({
				type: 'SEARCH_UPDATE',
				search: {
					id: this.searchId_,
					title: command.query,
					query_pattern: command.query,
					query_folder_id: null,
					type_: BaseModel.TYPE_SEARCH,
				},
			});

			if (command.query) {
				this.props.dispatch({
					type: 'SEARCH_SELECT',
					id: this.searchId_,
				});
			}

		} else if (command.name === 'toggleVisiblePanes') {
			this.toggleVisiblePanes();
		} else if (command.name === 'toggleSidebar') {
			this.toggleSidebar();
		} else if (command.name === 'showModalMessage') {
			this.setState({ modalLayer: { visible: true, message: command.message } });
		} else if (command.name === 'hideModalMessage') {
			this.setState({ modalLayer: { visible: false, message: '' } });
		} else {
			commandProcessed = false;
		}

		if (commandProcessed) {
			this.props.dispatch({
				type: 'WINDOW_COMMAND',
				name: null,
			});
		}
	}

	styles(themeId, width, height, messageBoxVisible, isSidebarVisible) {
		const styleKey = themeId + '_' + width + '_' + height + '_' + messageBoxVisible + '_' + (+isSidebarVisible);
		if (styleKey === this.styleKey_) return this.styles_;

		const theme = themeStyle(themeId);

		this.styleKey_ = styleKey;

		this.styles_ = {};

		this.styles_.header = {
			width: width,
		};

		this.styles_.messageBox = {
			width: width,
			height: 30,
			display: 'flex',
			alignItems: 'center',
			paddingLeft: 10,
			backgroundColor: theme.warningBackgroundColor,
		}

		const rowHeight = height - theme.headerHeight;

		this.styles_.sideBar = {
			width: Math.floor(layoutUtils.size(width * .2, 150, 300)),
			height: rowHeight,
			display: 'inline-block',
			verticalAlign: 'top',
    };

		if (isSidebarVisible === false) {
			this.styles_.sideBar.width = 0;
			this.styles_.sideBar.display = 'none';
		}

		this.styles_.noteList = {
			width: Math.floor(layoutUtils.size(width * .2, 150, 300)),
			height: rowHeight,
			display: 'inline-block',
			verticalAlign: 'top',
		};

		this.styles_.noteText = {
			width: Math.floor(layoutUtils.size(width - this.styles_.sideBar.width - this.styles_.noteList.width, 0)),
			height: rowHeight,
			display: 'inline-block',
			verticalAlign: 'top',
		};

		this.styles_.prompt = {
			width: width,
			height: height,
		};

		this.styles_.modalLayer = Object.assign({}, theme.textStyle, {
			zIndex: 10000,
			position: 'absolute',
			top: 0,
			left: 0,
			backgroundColor: theme.backgroundColor,
			width: width - 20,
			height: height - 20,
			padding: 10,
		});

		return this.styles_;
	}

	render() {
		const style = this.props.style;
		const promptOptions = this.state.promptOptions;
		const folders = this.props.folders;
		const notes = this.props.notes;
		const sidebarVisibility = this.props.sidebarVisibility;
		const styles = this.styles(this.props.theme, style.width, style.height, false, sidebarVisibility);
		const theme = themeStyle(this.props.theme);
		const selectedFolderId = this.props.selectedFolderId;
		const onConflictFolder = this.props.selectedFolderId === Folder.conflictFolderId();

		const headerItems = [];

		headerItems.push({
			title: _('New note'),
			iconName: 'fa-file-o',
			enabled: !!folders.length && !onConflictFolder,
			onClick: () => { this.doCommand({ name: 'newNote' }) },
		});

		headerItems.push({
			title: _('New notebook'),
			iconName: 'fa-folder-o',
			onClick: () => { this.doCommand({ name: 'newNotebook' }) },
		});

		headerItems.push({
			title: _('Layout'),
			iconName: 'fa-columns',
			enabled: !!notes.length,
			onClick: () => { this.doCommand({ name: 'toggleVisiblePanes' }) },
		});

		headerItems.push({
			title: _('Search...'),
			iconName: 'fa-search',
			onQuery: (query) => { this.doCommand({ name: 'search', query: query }) },
			type: 'search',
		});

		if (!this.promptOnClose_) {
			this.promptOnClose_ = (answer, buttonType) => {
				return this.state.promptOptions.onClose(answer, buttonType);
			}
		}

		const onViewDisabledItemsClick = () => {
			this.props.dispatch({
				type: 'NAV_GO',
				routeName: 'Status',
			});
		}

		let messageComp = null;

		const modalLayerStyle = Object.assign({}, styles.modalLayer, { display: this.state.modalLayer.visible ? 'block' : 'none' });

		return (
			<div style={style}>
				<div style={modalLayerStyle}>{this.state.modalLayer.message}</div>

				<PromptDialog
					autocomplete={promptOptions && ('autocomplete' in promptOptions) ? promptOptions.autocomplete : null}
					defaultValue={promptOptions && promptOptions.value ? promptOptions.value : ''}
					theme={this.props.theme}
					style={styles.prompt}
					onClose={this.promptOnClose_}
					label={promptOptions ? promptOptions.label : ''}
					description={promptOptions ? promptOptions.description : null}
					visible={!!this.state.promptOptions}
					buttons={promptOptions && ('buttons' in promptOptions) ? promptOptions.buttons : null}
					inputType={promptOptions && ('inputType' in promptOptions) ? promptOptions.inputType : null} />
				<Header style={styles.header} showBackButton={false} items={headerItems} />
				{messageComp}
				<SideBar style={styles.sideBar} />
				<NoteList style={styles.noteList} />
				<NoteText style={styles.noteText} visiblePanes={this.props.noteVisiblePanes} />
			</div>
		);
	}

}

const mapStateToProps = (state) => {
	return {
		theme: state.settings.theme,
		windowCommand: state.windowCommand,
		noteVisiblePanes: state.noteVisiblePanes,
		sidebarVisibility: state.sidebarVisibility,
		folders: state.folders,
		notes: state.notes,
		hasDisabledSyncItems: state.hasDisabledSyncItems,
		selectedFolderId: state.selectedFolderId,
		sidebarVisibility: state.sidebarVisibility,
	};
};

const MainScreen = connect(mapStateToProps)(MainScreenComponent);

module.exports = { MainScreen };
