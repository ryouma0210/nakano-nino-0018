const { contextBridge, ipcRenderer } = require("electron");

function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

window.addEventListener("error", (event) => {
  ipcRenderer.send("renderer:error", {
    type: "error",
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: serializeError(event.error),
  });
});

window.addEventListener("unhandledrejection", (event) => {
  ipcRenderer.send("renderer:error", {
    type: "unhandledrejection",
    reason: serializeError(event.reason) ?? String(event.reason),
  });
});

contextBridge.exposeInMainWorld("ninoDesktop", {
  getWindowState: () => ipcRenderer.invoke("window:get-state"),
  setZoom: (zoom) => ipcRenderer.invoke("window:set-zoom", zoom),
  toggleFullScreen: () => ipcRenderer.invoke("window:toggle-fullscreen"),
  onZoomChanged: (listener) => {
    const handler = (_event, zoom) => listener(zoom);
    ipcRenderer.on("window:zoom-changed", handler);
    return () => ipcRenderer.removeListener("window:zoom-changed", handler);
  },
  listFiles: () => ipcRenderer.invoke("files:list"),
  pickFiles: () => ipcRenderer.invoke("files:pick"),
  removeFile: (filePath) => ipcRenderer.invoke("files:remove", filePath),
});
