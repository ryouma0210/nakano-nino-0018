const { app, BrowserWindow, dialog, globalShortcut, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2;
let mainWindow;

function settingsPath() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  } catch {
    return { width: 520, height: 900, zoom: 1 };
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const state = {
    ...bounds,
    maximized: mainWindow.isMaximized(),
    zoom: mainWindow.webContents.getZoomFactor(),
  };
  fs.writeFileSync(settingsPath(), JSON.stringify(state, null, 2));
}

function setZoom(nextZoom) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  mainWindow.webContents.setZoomFactor(zoom);
  saveWindowState();
  mainWindow.webContents.send("window:zoom-changed", zoom);
}

function createWindow() {
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 390,
    minHeight: 640,
    backgroundColor: "#050505",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (state.maximized) mainWindow.maximize();
  mainWindow.webContents.setZoomFactor(state.zoom ?? 1);
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (!app.isPackaged) {
    mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist-web", "index.html"));
  }

  mainWindow.on("close", saveWindowState);
}

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register("F11", () => {
    mainWindow?.setFullScreen(!mainWindow.isFullScreen());
  });
  globalShortcut.register("CommandOrControl+=", () =>
    setZoom((mainWindow?.webContents.getZoomFactor() ?? 1) + 0.1),
  );
  globalShortcut.register("CommandOrControl+-", () =>
    setZoom((mainWindow?.webContents.getZoomFactor() ?? 1) - 0.1),
  );
  globalShortcut.register("CommandOrControl+0", () => setZoom(1));
});

ipcMain.handle("window:set-zoom", (_event, zoom) => setZoom(zoom));
ipcMain.handle("window:get-state", () => ({
  zoom: mainWindow?.webContents.getZoomFactor() ?? 1,
  fullScreen: mainWindow?.isFullScreen() ?? false,
}));
ipcMain.handle("window:toggle-fullscreen", () => {
  mainWindow?.setFullScreen(!mainWindow.isFullScreen());
});
function storedFilesDirectory() {
  const directory = path.join(app.getPath("userData"), "stored-files");
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}
function listStoredFiles() {
  return fs.readdirSync(storedFilesDirectory()).map((name) => {
    const filePath = path.join(storedFilesDirectory(), name);
    const stat = fs.statSync(filePath);
    return { name, path: filePath, url: pathToFileURL(filePath).href, size: stat.size };
  });
}
ipcMain.handle("files:list", () => listStoredFiles());
ipcMain.handle("files:pick", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "画像・動画", extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "m4a", "wav"] }],
  });
  if (result.canceled) return listStoredFiles();
  for (const source of result.filePaths) {
    const safeName = path.basename(source).replace(/[<>:"/\\|?*]/g, "_");
    fs.copyFileSync(source, path.join(storedFilesDirectory(), `${Date.now()}_${safeName}`));
  }
  return listStoredFiles();
});
ipcMain.handle("files:remove", (_event, filePath) => {
  const resolved = path.resolve(filePath);
  const root = path.resolve(storedFilesDirectory());
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("削除対象が格納フォルダ外です。");
  fs.rmSync(resolved, { force: true });
  return listStoredFiles();
});

app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => globalShortcut.unregisterAll());
