import {
  BrowserWindow,
  ipcMain
} from "electron";

import path from "node:path";

import {
  readAppConfig,
  saveAppConfig
} from "./configManager.js";

export function openInitialSetup({
  preloadPath,
  htmlPath,
  writeLog
}) {
  return new Promise((resolve, reject) => {
    let setupWindow = null;
    let completed = false;

    function removeHandlers() {
      ipcMain.removeHandler(
        "superpos-setup:get-config"
      );

      ipcMain.removeHandler(
        "superpos-setup:save-site"
      );
    }

    function isTrustedSetupSender(event) {
      return Boolean(
        setupWindow &&
        !setupWindow.isDestroyed() &&
        event.sender ===
          setupWindow.webContents
      );
    }

    removeHandlers();

    setupWindow = new BrowserWindow({
      width: 680,
      height: 650,

      minWidth: 680,
      minHeight: 650,

      maxWidth: 680,
      maxHeight: 650,

      resizable: false,
      maximizable: false,
      minimizable: false,

      show: false,
      autoHideMenuBar: true,
      backgroundColor: "#eef3f7",

      title: "Thiết lập SuperPOS",

      webPreferences: {
        preload: preloadPath,

        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        devTools: false,
        webviewTag: false
      }
    });

    setupWindow.removeMenu();

    ipcMain.handle(
      "superpos-setup:get-config",
      async (event) => {
        if (!isTrustedSetupSender(event)) {
          throw new Error(
            "Nguồn yêu cầu không hợp lệ"
          );
        }

        return readAppConfig();
      }
    );

    ipcMain.handle(
      "superpos-setup:save-site",
      async (event, site) => {
        if (!isTrustedSetupSender(event)) {
          throw new Error(
            "Nguồn yêu cầu không hợp lệ"
          );
        }

        try {
          const config =
            saveAppConfig(site);

          completed = true;

          writeLog(
            "INFO",
            "Đã hoàn tất thiết lập cơ sở",
            {
              site: config.site
            }
          );

          setTimeout(() => {
            if (
              setupWindow &&
              !setupWindow.isDestroyed()
            ) {
              setupWindow.close();
            }
          }, 300);

          return {
            success: true,
            config
          };
        } catch (error) {
          writeLog(
            "ERROR",
            "Không thể lưu thiết lập cơ sở",
            error
          );

          return {
            success: false,
            message:
              error?.message ||
              String(error)
          };
        }
      }
    );

    setupWindow.once(
      "ready-to-show",
      () => {
        setupWindow.show();
        setupWindow.focus();
      }
    );

    setupWindow.on("closed", () => {
      removeHandlers();
      setupWindow = null;

      if (completed) {
        const config = readAppConfig();

        if (config) {
          resolve(config);
          return;
        }
      }

      reject(
        new Error(
          "Thiết lập SuperPOS chưa hoàn tất"
        )
      );
    });

    setupWindow
      .loadFile(htmlPath)
      .catch((error) => {
        writeLog(
          "ERROR",
          "Không thể tải màn hình thiết lập",
          error
        );

        if (
          setupWindow &&
          !setupWindow.isDestroyed()
        ) {
          setupWindow.destroy();
        }
      });
  });
}