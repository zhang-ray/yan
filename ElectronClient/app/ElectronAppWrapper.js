const { _ } = require('lib/locale.js');
const { BrowserWindow } = require('electron');
const { shim } = require('lib/shim');
const url = require('url')
const path = require('path')
const urlUtils = require('lib/urlUtils.js');
const { dirname, basename } = require('lib/path-utils');
const fs = require('fs-extra');

class ElectronAppWrapper {

	constructor(electronApp, env, profilePath) {
		this.electronApp_ = electronApp;
		this.env_ = env;
		this.profilePath_ = profilePath;
		this.win_ = null;
		this.willQuitApp_ = false;
		this.buildDir_ = null;
	}

	electronApp() {
		return this.electronApp_;
	}

	setLogger(v) {
		this.logger_ = v;
	}

	logger() {
		return this.logger_;
	}

	window() {
		return this.win_;
	}

	createWindow() {
		const windowStateKeeper = require('electron-window-state');

		const stateOptions = {
			defaultWidth: 800,
			defaultHeight: 600,
			file: 'window-state-' + this.env_ + '.json',
		}

		if (this.profilePath_) stateOptions.path = this.profilePath_;

		// Load the previous state with fallback to defaults
		const windowState = windowStateKeeper(stateOptions);

		const windowOptions = {
			x: windowState.x,
			y: windowState.y,
			width: windowState.width,
			height: windowState.height,
		};

		require('electron-context-menu')({
			shouldShowMenu: (event, params) => {
				return params.isEditable;
			},
		});

		this.win_ = new BrowserWindow(windowOptions)

		this.win_.loadURL(url.format({
			pathname: path.join(__dirname, 'index.html'),
			protocol: 'file:',
			slashes: true
		}))

		// Uncomment this to view errors if the application does not start
		if (this.env_ === 'dev') this.win_.webContents.openDevTools();

		// Let us register listeners on the window, so we can update the state
		// automatically (the listeners will be removed when the window is closed)
		// and restore the maximized or full screen state
		windowState.manage(this.win_);
	}

	async waitForElectronAppReady() {
		if (this.electronApp().isReady()) return Promise.resolve();

		return new Promise((resolve, reject) => {
			const iid = setInterval(() => {
				if (this.electronApp().isReady()) {
					clearInterval(iid);
					resolve();
				}
			}, 10);
		});
	}

	async quit() {
		this.electronApp_.quit();
	}

	exit(errorCode = 0) {
		this.electronApp_.exit(errorCode);
	}

	// This method is used in macOS only to hide the whole app (and not just the main window)
	// including the menu bar. This follows the macOS way of hidding an app.
	hide() {
		this.electronApp_.hide();
	}

	buildDir() {
		if (this.buildDir_) return this.buildDir_;
		let dir = __dirname + '/build';
		if (!fs.pathExistsSync(dir)) {
			dir = dirname(__dirname) + '/build';
			if (!fs.pathExistsSync(dir)) throw new Error('Cannot find build dir');
		}

		this.buildDir_ = dir;
		return dir;
	}

	ensureSingleInstance() {
		if (this.env_ === 'dev') return false;

		return new Promise((resolve, reject) => {
			const alreadyRunning = this.electronApp_.makeSingleInstance((commandLine, workingDirectory) => {
				const win = this.window();
				if (!win) return;
				if (win.isMinimized()) win.restore();
				win.show();
				win.focus();
			});

			if (alreadyRunning) this.electronApp_.quit();

			resolve(alreadyRunning);
		});
	}

	async start() {
		// Since we are doing other async things before creating the window, we might miss
		// the "ready" event. So we use the function below to make sure that the app is ready.
		await this.waitForElectronAppReady();

		const alreadyRunning = await this.ensureSingleInstance();
		if (alreadyRunning) return;

		this.createWindow();

		this.electronApp_.on('before-quit', () => {
			this.willQuitApp_ = true;
		})

		this.electronApp_.on('window-all-closed', () => {
			this.electronApp_.quit();
		})

		this.electronApp_.on('activate', () => {
			this.win_.show();
		})
	}

}

module.exports = { ElectronAppWrapper };