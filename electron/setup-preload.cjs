"use strict";

const {
  contextBridge,
  ipcRenderer
} = require("electron");

contextBridge.exposeInMainWorld(
  "superPOSSetup",
  {
    saveSite: (site) => {
      return ipcRenderer.invoke(
        "superpos-setup:save-site",
        site
      );
    },

    getCurrentConfig: () => {
      return ipcRenderer.invoke(
        "superpos-setup:get-config"
      );
    }
  }
);