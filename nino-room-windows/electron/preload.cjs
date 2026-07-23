const { contextBridge, ipcRenderer } = require("electron");

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
