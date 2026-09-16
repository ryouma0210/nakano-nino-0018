const assert = require("node:assert/strict");
const { test } = require("node:test");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function createHarness(saved = {}) {
  const files = new Map([[path.join("test-user-data", "window-state.json"), JSON.stringify(saved)]]);
  const logs = [];
  const handlers = new Map();
  let startup;
  let window;
  let failWrites = false;
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super();
      window = this;
      this.options = options;
      this.normal = { x: options.x, y: options.y, width: options.width, height: options.height };
      this.focused = true;
      this.maximized = false;
      this.fullScreen = false;
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = {};
      this.webContents.zoom = 1;
      this.webContents.getZoomFactor = () => this.webContents.zoom;
      this.webContents.setZoomFactor = (zoom) => { this.webContents.zoom = zoom; };
      this.webContents.isDestroyed = () => false;
      this.webContents.sent = [];
      this.webContents.send = (...message) => { this.webContents.sent.push(message); };
    }
    isDestroyed() { return false; }
    isFocused() { return this.focused; }
    isMaximized() { return this.maximized; }
    isFullScreen() { return this.fullScreen; }
    getNormalBounds() { return { ...this.normal }; }
    getBounds() { throw new Error("Saving display bounds would lose normal window size"); }
    maximize() { this.maximized = true; this.emit("maximize"); }
    setFullScreen(enabled) {
      if (this.fullScreen === enabled) return;
      if (enabled && this.maximized) { this.maximized = false; this.emit("unmaximize"); }
      this.fullScreen = enabled;
      this.emit(enabled ? "enter-full-screen" : "leave-full-screen");
    }
    loadURL() { return Promise.resolve(); }
  }
  const app = new EventEmitter();
  app.requestSingleInstanceLock = () => true;
  app.whenReady = () => ({ then: (callback) => { startup = callback; } });
  app.getPath = () => "test-user-data";
  app.getVersion = () => "test";
  app.quit = () => {};
  const ipcMain = new EventEmitter();
  ipcMain.handle = (channel, handler) => { handlers.set(channel, handler); };
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
  const mocks = {
    electron: { app, BrowserWindow: FakeWindow, ipcMain, dialog: {}, screen: {
      getPrimaryDisplay: () => ({ workArea }), getDisplayMatching: () => ({ workArea }),
    } },
    "node:fs": {
      readFileSync: (file) => files.get(file),
      writeFileSync: (file, data) => {
        if (failWrites) throw new Error("Disk full");
        files.set(file, data);
      },
      renameSync: (source, destination) => { files.set(destination, files.get(source)); files.delete(source); },
      appendFileSync: (_file, message) => { logs.push(message); },
    },
    "node:http": { createServer: () => {
      const server = new EventEmitter();
      server.listen = (_port, _host, callback) => callback();
      server.address = () => ({ port: 48218 });
      server.close = () => {};
      return server;
    } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8"), {
    require: (name) => mocks[name] ?? require(name), __dirname, setTimeout,
  });
  await startup();
  return {
    window, logs,
    saved: () => JSON.parse(files.get(path.join("test-user-data", "window-state.json"))),
    failWrites: () => { failWrites = true; },
    invoke: (channel, ...args) => handlers.get(channel)({ sender: window.webContents, senderFrame: window.webContents.mainFrame }, ...args),
    untrusted: (channel, ...args) => handlers.get(channel)({ sender: {}, senderFrame: {} }, ...args),
    subframe: (channel, ...args) => handlers.get(channel)({ sender: window.webContents, senderFrame: {} }, ...args),
  };
}

test("full-screen close persists normal bounds and restores maximized state, zoom and full screen", async () => {
  const saved = { x: 100, y: 100, width: 900, height: 700, maximized: true, zoom: 1.25 };
  const app = await createHarness(saved);
  assert.equal(app.invoke("window:set-fullscreen", true).fullScreen, true);
  app.window.emit("close");
  assert.deepEqual(app.saved(), { ...saved, fullScreen: true });

  const reopened = await createHarness(app.saved());
  assert.equal(reopened.window.options.width, 900);
  assert.equal(reopened.invoke("window:get-state").fullScreen, true);
  assert.equal(reopened.invoke("window:get-state").zoom, 1.25);
  reopened.invoke("window:set-fullscreen", false);
  assert.equal(reopened.window.isMaximized(), true);
  assert.equal(reopened.saved().fullScreen, false);
  assert.equal(reopened.saved().width, 900);
});

test("window keyboard commands require focus and do not consume Escape or repeat-toggle F11", async () => {
  const app = await createHarness();
  let prevented = 0;
  const input = (key, properties = {}) => app.window.webContents.emit("before-input-event", { preventDefault: () => { prevented += 1; } }, { type: "keyDown", key, ...properties });
  app.window.focused = false;
  input("F11");
  input("+", { control: true });
  assert.equal(app.window.isFullScreen(), false);
  assert.equal(app.window.webContents.zoom, 1);
  assert.equal(prevented, 0);
  app.window.focused = true;
  input("F11");
  input("F11", { isAutoRepeat: true });
  input("Escape");
  assert.equal(app.window.isFullScreen(), true);
  assert.equal(prevented, 2);
  input("+", { control: true });
  assert.equal(app.saved().zoom, 1.1);
  input("0", { control: true });
  assert.equal(app.saved().zoom, 1);
});

test("persistence failures preserve the previous file, reject settings IPC and never crash close or shortcuts", async () => {
  const app = await createHarness();
  app.invoke("window:set-fullscreen", false);
  const previous = app.saved();
  app.failWrites();
  assert.throws(() => app.invoke("window:set-fullscreen", true), /could not be saved/);
  assert.doesNotThrow(() => app.window.emit("close"));
  assert.doesNotThrow(() => app.window.webContents.emit("before-input-event", { preventDefault: () => {} }, { type: "keyDown", key: "F11" }));
  assert.deepEqual(app.saved(), previous);
  assert.ok(app.logs.some((message) => message.includes("window:save-error")));
});

test("window, logging and file IPC reject other windows and subframes before doing work", async () => {
  const app = await createHarness();
  for (const channel of ["window:get-state", "window:set-zoom", "window:set-fullscreen", "window:toggle-fullscreen", "log:write", "files:list", "files:pick", "files:remove"]) {
    assert.throws(() => app.untrusted(channel, true), /not allowed/);
    assert.throws(() => app.subframe(channel, true), /not allowed/);
  }
  assert.throws(() => app.invoke("window:set-fullscreen", "false"), /boolean/);
  assert.throws(() => app.invoke("window:set-zoom", NaN), /finite/);
  assert.equal(app.invoke("window:toggle-fullscreen").fullScreen, true);
});

test("temporary HTML full screen does not overwrite the application preference", async () => {
  const app = await createHarness();
  app.window.setFullScreen(true);
  app.window.emit("close");
  assert.equal(app.saved().fullScreen, false);
});

test("preload exposes the explicit setter and removable full-screen notifications without IPC events", async () => {
  const ipcRenderer = new EventEmitter();
  const calls = [];
  ipcRenderer.invoke = async (...args) => { calls.push(args); return { zoom: 1, fullScreen: true }; };
  let desktop;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8"), {
    require: () => ({ ipcRenderer, contextBridge: { exposeInMainWorld: (_name, value) => { desktop = value; } } }),
    window: { addEventListener: () => {} },
  });
  assert.deepEqual(await desktop.setFullScreen(true), { zoom: 1, fullScreen: true });
  assert.deepEqual(calls, [["window:set-fullscreen", true]]);
  const observed = [];
  const unsubscribe = desktop.onFullScreenChanged((...args) => observed.push(args));
  ipcRenderer.emit("window:fullscreen-changed", { sender: "private" }, true);
  unsubscribe();
  ipcRenderer.emit("window:fullscreen-changed", { sender: "private" }, false);
  assert.deepEqual(observed, [[true]]);
  assert.equal(ipcRenderer.listenerCount("window:fullscreen-changed"), 0);
});
