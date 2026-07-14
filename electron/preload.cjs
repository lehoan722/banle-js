const {
  contextBridge,
  ipcRenderer
} = require("electron");

contextBridge.exposeInMainWorld("superPOS", {
  isElectron: true,

  getAppInfo: () => {
    return ipcRenderer.invoke("superpos:get-app-info");
  },

  openLogsFolder: () => {
    return ipcRenderer.invoke("superpos:open-logs-folder");
  }
});