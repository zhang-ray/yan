const React = require("react");
const { connect } = require("react-redux");
const shared = require("lib/components/shared/side-menu-shared.js");
const BaseModel = require("lib/BaseModel.js");
const Folder = require("lib/models/Folder.js");
const Note = require("lib/models/Note.js");
const { _ } = require("lib/locale.js");
const { themeStyle } = require("../theme.js");
const { bridge } = require("electron").remote.require("./bridge");
const Menu = bridge().Menu;
const MenuItem = bridge().MenuItem;
const InteropServiceHelper = require("../InteropServiceHelper.js");

class SideBarComponent extends React.Component {


	constructor() {
		super();

		this.onFolderDragStart_ = (event) => {
			const folderId = event.currentTarget.getAttribute('folderid');
			if (!folderId) return;
			
			event.dataTransfer.setDragImage(new Image(), 1, 1);
			event.dataTransfer.clearData();
			event.dataTransfer.setData('text/x-jop-folder-ids', JSON.stringify([folderId]));
		};

		this.onFolderDragOver_ = (event) => {
			if (event.dataTransfer.types.indexOf("text/x-jop-note-ids") >= 0) event.preventDefault();
			if (event.dataTransfer.types.indexOf("text/x-jop-folder-ids") >= 0) event.preventDefault();
		};

		this.onFolderDrop_ = async (event) => {
			const folderId = event.currentTarget.getAttribute('folderid');
			const dt = event.dataTransfer;
			if (!dt) return;

			if (dt.types.indexOf("text/x-jop-note-ids") >= 0) {
				event.preventDefault();

				const noteIds = JSON.parse(dt.getData("text/x-jop-note-ids"));
				for (let i = 0; i < noteIds.length; i++) {
					await Note.moveToFolder(noteIds[i], folderId);
				}
			} else if (dt.types.indexOf("text/x-jop-folder-ids") >= 0) {
				event.preventDefault();

				const folderIds = JSON.parse(dt.getData("text/x-jop-folder-ids"));
				for (let i = 0; i < folderIds.length; i++) {
					await Folder.moveToFolder(folderIds[i], folderId);
				}
			}
		};

		this.onFolderToggleClick_ = async (event) => {
			const folderId = event.currentTarget.getAttribute('folderid');

			this.props.dispatch({
				type: 'FOLDER_TOGGLE',
				id: folderId,
			});
		};
	}

	style() {
		const theme = themeStyle(this.props.theme);

		const itemHeight = 25;

		let style = {
			root: {
				backgroundColor: theme.backgroundColor2,
			},
			listItemContainer: {
				boxSizing: "border-box",
				height: itemHeight,
				// paddingLeft: 14,
				display: "flex",
				alignItems: "stretch",
			},
			listItem: {
				fontFamily: theme.fontFamily,
				fontSize: theme.fontSize,
				textDecoration: "none",
				color: theme.color2,
				cursor: "default",
				opacity: 0.8,
				whiteSpace: "nowrap",
				display: "flex",
				flex: 1,
				alignItems: 'center',
			},
			listItemSelected: {
				backgroundColor: theme.selectedColor2,
			},
			listItemExpandIcon: {
				color: theme.color2,
				cursor: "default",
				opacity: 0.8,
				// fontFamily: theme.fontFamily,
				fontSize: theme.fontSize,
				textDecoration: "none",
				paddingRight: 5,
				display: "flex",
				alignItems: 'center',
			},
			conflictFolder: {
				color: theme.colorError2,
				fontWeight: "bold",
			},
			header: {
				height: itemHeight * 1.8,
				fontFamily: theme.fontFamily,
				fontSize: theme.fontSize * 1.3,
				textDecoration: "none",
				boxSizing: "border-box",
				color: theme.color2,
				paddingLeft: 8,
				display: "flex",
				alignItems: "center",
			},
			button: {
				padding: 6,
				fontFamily: theme.fontFamily,
				fontSize: theme.fontSize,
				textDecoration: "none",
				boxSizing: "border-box",
				color: theme.color2,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				border: "1px solid rgba(255,255,255,0.2)",
				marginTop: 10,
				marginLeft: 5,
				marginRight: 5,
				cursor: "default",
			},
			syncReport: {
				fontFamily: theme.fontFamily,
				fontSize: Math.round(theme.fontSize * 0.9),
				color: theme.color2,
				opacity: 0.5,
				display: "flex",
				alignItems: "left",
				justifyContent: "top",
				flexDirection: "column",
				marginTop: 10,
				marginLeft: 5,
				marginRight: 5,
				minHeight: 70,
				wordWrap: "break-word",
				//width: "100%",
			},
		};

		return style;
	}

	itemContextMenu(event) {
		const itemId = event.target.getAttribute("data-id");
		if (itemId === Folder.conflictFolderId()) return;

		const itemType = Number(event.target.getAttribute("data-type"));
		if (!itemId || !itemType) throw new Error("No data on element");

		let deleteMessage = "";
		if (itemType === BaseModel.TYPE_FOLDER) {
			deleteMessage = _("Delete notebook? All notes and sub-notebooks within this notebook will also be deleted.");
		} else if (itemType === BaseModel.TYPE_SEARCH) {
			deleteMessage = _("Remove this search from the sidebar?");
		}

		const menu = new Menu();

		let item = null;
		if (itemType === BaseModel.TYPE_FOLDER) {
			item = BaseModel.byId(this.props.folders, itemId);
		}

		menu.append(
			new MenuItem({
				label: _("Delete"),
				click: async () => {
					const ok = bridge().showConfirmMessageBox(deleteMessage);
					if (!ok) return;

					if (itemType === BaseModel.TYPE_FOLDER) {
						await Folder.delete(itemId);
					} else if (itemType === BaseModel.TYPE_SEARCH) {
						this.props.dispatch({
							type: "SEARCH_DELETE",
							id: itemId,
						});
					}
				},
			})
		);

		if (itemType === BaseModel.TYPE_FOLDER && !item.encryption_applied) {
			menu.append(
				new MenuItem({
					label: _("Rename"),
					click: async () => {
						this.props.dispatch({
							type: "WINDOW_COMMAND",
							name: "renameFolder",
							id: itemId,
						});
					},
				})
			);

			// menu.append(
			// 	new MenuItem({
			// 		label: _("Move"),
			// 		click: async () => {
			// 			this.props.dispatch({
			// 				type: "WINDOW_COMMAND",
			// 				name: "renameFolder",
			// 				id: itemId,
			// 			});
			// 		},
			// 	})
			// );

			menu.append(new MenuItem({ type: "separator" }));

			const InteropService = require("lib/services/InteropService.js");

			menu.append(
				new MenuItem({
					label: _("Export"),
					click: async () => {
						const ioService = new InteropService();
						const module = ioService.moduleByFormat_("exporter", "jex");
						await InteropServiceHelper.export(this.props.dispatch.bind(this), module, { sourceFolderIds: [itemId] });
					},
				})
			);
		}

		menu.popup(bridge().window());
	}

	folderItem_click(folder) {
		this.props.dispatch({
			type: "FOLDER_SELECT",
			id: folder ? folder.id : null,
		});
	}

	searchItem_click(search) {
		this.props.dispatch({
			type: "SEARCH_SELECT",
			id: search ? search.id : null,
		});
	}

	async sync_click() {
		await shared.synchronize_press(this);
	}

	folderItem(folder, selected, hasChildren, depth) {
		let style = Object.assign({}, this.style().listItem);
		if (folder.id === Folder.conflictFolderId()) style = Object.assign(style, this.style().conflictFolder);

		const itemTitle = Folder.displayTitle(folder);

		let containerStyle = Object.assign({}, this.style().listItemContainer);
		// containerStyle.paddingLeft = containerStyle.paddingLeft + depth * 10;

		if (selected) containerStyle = Object.assign(containerStyle, this.style().listItemSelected);

		let expandLinkStyle = Object.assign({}, this.style().listItemExpandIcon);
		let expandIconStyle = {
			visibility: hasChildren ? 'visible' : 'hidden',
			paddingLeft: 8 + depth * 10,
		}

		const iconName = this.props.collapsedFolderIds.indexOf(folder.id) >= 0 ? 'fa-plus-square' : 'fa-minus-square';
		const expandIcon = <i style={expandIconStyle} className={"fa " + iconName}></i>
		const expandLink = hasChildren ? <a style={expandLinkStyle} href="#" folderid={folder.id} onClick={this.onFolderToggleClick_}>{expandIcon}</a> : <span style={expandLinkStyle}>{expandIcon}</span>

		return (
			<div className="list-item-container" style={containerStyle} key={folder.id} onDragStart={this.onFolderDragStart_} onDragOver={this.onFolderDragOver_} onDrop={this.onFolderDrop_} draggable={true} folderid={folder.id}>
				{ expandLink }
				<a
					className="list-item"
					href="#"
					data-id={folder.id}
					data-type={BaseModel.TYPE_FOLDER}
					onContextMenu={event => this.itemContextMenu(event)}
					style={style}
					folderid={folder.id}
					onClick={() => {
						this.folderItem_click(folder);
					}}
					onDoubleClick={this.onFolderToggleClick_}
				>
					{itemTitle}
				</a>
			</div>
		);
	}

	searchItem(search, selected) {
		let style = Object.assign({}, this.style().listItem);
		if (selected) style = Object.assign(style, this.style().listItemSelected);
		return (
			<a
				className="list-item"
				href="#"
				data-id={search.id}
				data-type={BaseModel.TYPE_SEARCH}
				onContextMenu={event => this.itemContextMenu(event)}
				key={search.id}
				style={style}
				onClick={() => {
					this.searchItem_click(search);
				}}
			>
				{search.title}
			</a>
		);
	}

	makeDivider(key) {
		return <div style={{ height: 2, backgroundColor: "blue" }} key={key} />;
	}

	makeHeader(key, label, iconName, extraProps = {}) {
		const style = this.style().header;
		const icon = <i style={{ fontSize: style.fontSize * 1.2, marginRight: 5 }} className={"fa " + iconName} />;
		return (
			<div style={style} key={key} {...extraProps}>
				{icon}
				{label}
			</div>
		);
	}

	render() {
		const theme = themeStyle(this.props.theme);
		const style = Object.assign({}, this.style().root, this.props.style, {
			overflowX: "hidden",
			overflowY: "auto",
		});

		let items = [];

		items.push(this.makeHeader("folderHeader", _("Notebooks"), "fa-folder-o", {
			onDrop: this.onFolderDrop_,
			folderid: '',
		}));

		if (this.props.folders.length) {
			const folderItems = shared.renderFolders(this.props, this.folderItem.bind(this));
			items = items.concat(folderItems);
		}
		
		return (
			<div className="side-bar" style={style}>
				{items}
			</div>
		);
	}
}

const mapStateToProps = state => {
	return {
		folders: state.folders,
		searches: state.searches,
		syncStarted: state.syncStarted,
		syncReport: state.syncReport,
		selectedFolderId: state.selectedFolderId,
		selectedSearchId: state.selectedSearchId,
		notesParentType: state.notesParentType,
		locale: state.settings.locale,
		theme: state.settings.theme,
		collapsedFolderIds: state.collapsedFolderIds,
	};
};

const SideBar = connect(mapStateToProps)(SideBarComponent);

module.exports = { SideBar };
