const { app, BrowserWindow, dialog, globalShortcut, ipcMain } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const util = require("node:util");
const { pathToFileURL } = require("node:url");

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2;
const STATIC_SERVER_PORT = 48218;
let mainWindow;
let staticServer;
let staticServerUrl;

function logPath() {
  return path.join(app.getPath("userData"), "nino-room-error.log");
}

function appendLog(label, payload) {
  try {
    const message = typeof payload === "string" ? payload : util.inspect(payload, { depth: 8, breakLength: 120 });
    fs.appendFileSync(
      logPath(),
      `[${new Date().toISOString()}] ${label}\n${message}\n\n`,
      "utf8",
    );
  } catch {
    // ログ書き込み自体の失敗ではアプリを落とさない。
  }
}

function visibleErrorHtml(title, details) {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>Nino Room Error</title>
    <style>
      body { margin: 0; background: #050505; color: #fff; font-family: sans-serif; padding: 32px; }
      h1 { color: #ff3348; font-size: 28px; }
      pre { white-space: pre-wrap; border: 1px solid #ff3348; padding: 16px; color: #ffb8bf; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <p>ログ: ${logPath()}</p>
    <pre>${String(details).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</pre>
  </body>
</html>`;
}

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
  appendLog("app:start", {
    version: app.getVersion(),
    userData: app.getPath("userData"),
    staticServerUrl,
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2 || /error|exception|failed|timeout/i.test(message)) {
      appendLog("renderer:console", { level, message, line, sourceId });
    }
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, validatedURL) => {
    appendLog("renderer:did-fail-load", { code, description, validatedURL });
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    appendLog("renderer:gone", details);
  });
  mainWindow.webContents.on("did-finish-load", () => {
    setTimeout(async () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      try {
        const snapshot = await mainWindow.webContents.executeJavaScript(`
          ({
            title: document.title,
            bodyText: document.body.innerText.slice(0, 1000),
            rootText: document.getElementById('root')?.innerText.slice(0, 1000) ?? null,
            rootHtmlLength: document.getElementById('root')?.innerHTML.length ?? null,
            scriptCount: document.scripts.length,
            crossOriginIsolated: globalThis.crossOriginIsolated,
            hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
          })
        `);
        appendLog("renderer:snapshot", snapshot);
      } catch (error) {
        appendLog("renderer:snapshot-error", error);
      }
    }, 3000);
  });
  mainWindow.loadURL(staticServerUrl);

  mainWindow.on("close", saveWindowState);
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".wasm") return "application/wasm";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".wav") return "audio/wav";
  return "application/octet-stream";
}

function responseHeaders(filePath) {
  return {
    "Content-Type": contentType(filePath),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (readError, data) => {
      if (readError) {
      appendLog("static:read-error", { filePath, error: readError });
      response.writeHead(500);
      response.end(visibleErrorHtml("読み込みエラー", readError.stack ?? readError.message));
      return;
    }

    response.writeHead(200, {
      ...responseHeaders(filePath),
      "Content-Length": data.byteLength,
    });
    response.end(data);
  });
}

function startStaticServer() {
  const root = path.resolve(__dirname, "..", "dist-web");
  staticServer = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
    const filePath = path.resolve(root, relativePath);

    if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.stat(filePath, (statError, stat) => {
      if (statError || !stat.isFile()) {
        sendFile(response, path.join(root, "index.html"));
        return;
      }

      sendFile(response, filePath);
    });
  });

  return new Promise((resolve, reject) => {
    staticServer.on("error", reject);
    staticServer.listen(STATIC_SERVER_PORT, "127.0.0.1", () => {
      const address = staticServer.address();
      staticServerUrl = `http://127.0.0.1:${address.port}/`;
      resolve();
    });
  });
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

app.whenReady().then(async () => {
  try {
    await startStaticServer();
    createWindow();
  } catch (error) {
    appendLog("app:startup-error", error);
    mainWindow = new BrowserWindow({
      width: 520,
      height: 900,
      backgroundColor: "#050505",
      autoHideMenuBar: true,
    });
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(visibleErrorHtml("起動エラー", error.stack ?? error.message ?? error))}`);
  }
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
ipcMain.on("renderer:error", (_event, error) => {
  appendLog("renderer:error", error);
});

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
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
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  staticServer?.close();
});
