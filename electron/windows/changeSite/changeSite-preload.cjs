"use strict";

const {
  contextBridge,
  ipcRenderer
} = require("electron");

contextBridge.exposeInMainWorld(
  "superPOSChangeSite",
  {
    getCurrentConfig: () => {
      return ipcRenderer.invoke(
        "superpos-change-site:get-config"
      );
    },

    saveSite: (site) => {
      return ipcRenderer.invoke(
        "superpos-change-site:save",
        site
      );
    },

    cancel: () => {
      ipcRenderer.send(
        "superpos-change-site:cancel"
      );
    }
  }
);