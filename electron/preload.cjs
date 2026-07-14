const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("hoanTuyetDesktop", {
  isElectron: true,
  platform: process.platform,
  electronVersion: process.versions.electron
});