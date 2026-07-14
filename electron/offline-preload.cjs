"use strict";

const {
  contextBridge,
  ipcRenderer
} = require("electron");

contextBridge.exposeInMainWorld(
  "superPOSOffline",
  {
    retry: () => {
      ipcRenderer.send(
        "superpos-offline:retry"
      );
    },

    continueToSystem: () => {
      ipcRenderer.send(
        "superpos-offline:continue"
      );
    },

    onStatus: (callback) => {
      if (typeof callback !== "function") {
        return;
      }

      ipcRenderer.on(
        "superpos-offline:status",
        (_event, status) => {
          callback(status);
        }
      );
    }
  }
);