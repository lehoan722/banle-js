import {
  app,
  BrowserWindow,
  dialog,
  ipcMain
} from "electron";

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  readAppConfig,
  saveAppConfig
} from "../../configManager.js";

import {
  writeLog
} from "../../logger.js";

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

let changeSiteWindow = null;

function removeChangeSiteHandlers() {
  ipcMain.removeHandler(
    "superpos-change-site:get-config"
  );

  ipcMain.removeHandler(
    "superpos-change-site:save"
  );

  ipcMain.removeAllListeners(
    "superpos-change-site:cancel"
  );
}

function isTrustedSender(event) {
  return Boolean(
    changeSiteWindow &&
    !changeSiteWindow.isDestroyed() &&
    event.sender ===
      changeSiteWindow.webContents
  );
}

function registerChangeSiteHandlers() {
  removeChangeSiteHandlers();

  ipcMain.handle(
    "superpos-change-site:get-config",
    async (event) => {
      if (!isTrustedSender(event)) {
        throw new Error(
          "Nguồn yêu cầu không hợp lệ"
        );
      }

      return readAppConfig();
    }
  );

  ipcMain.handle(
    "superpos-change-site:save",
    async (event, site) => {
      if (!isTrustedSender(event)) {
        throw new Error(
          "Nguồn yêu cầu không hợp lệ"
        );
      }

      try {
        const currentConfig =
          readAppConfig();

        if (currentConfig?.site === site) {
          return {
            success: false,
            message:
              "Máy tính đang sử dụng cơ sở này."
          };
        }

        const newConfig =
          saveAppConfig(site);

        writeLog(
          "INFO",
          "Người dùng đã đổi cơ sở sử dụng",
          {
            oldSite:
              currentConfig?.site || null,
            newSite: newConfig.site
          }
        );

        setTimeout(() => {
          app.relaunch();
          app.exit(0);
        }, 700);

        return {
          success: true,
          config: newConfig
        };
      } catch (error) {
        writeLog(
          "ERROR",
          "Không thể đổi cơ sở sử dụng",
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

  ipcMain.on(
    "superpos-change-site:cancel",
    (event) => {
      if (!isTrustedSender(event)) {
        return;
      }

      changeSiteWindow.close();
    }
  );
}

export async function openChangeSiteWindow(
  parentWindow
) {
  if (
    changeSiteWindow &&
    !changeSiteWindow.isDestroyed()
  ) {
    changeSiteWindow.show();
    changeSiteWindow.focus();
    return;
  }

  registerChangeSiteHandlers();

  changeSiteWindow = new BrowserWindow({
    parent: parentWindow,
    modal: true,

    width: 600,
    height: 590,

    minWidth: 600,
    minHeight: 590,

    maxWidth: 600,
    maxHeight: 590,

    resizable: false,
    maximizable: false,
    minimizable: false,

    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#eef3f7",

    title: "Đổi cơ sở sử dụng",

    webPreferences: {
      preload: path.join(
        __dirname,
        "changeSite-preload.cjs"
      ),

      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false,
      webviewTag: false
    }
  });

  changeSiteWindow.removeMenu();

  changeSiteWindow.once(
    "ready-to-show",
    () => {
      changeSiteWindow.show();
      changeSiteWindow.focus();
    }
  );

  changeSiteWindow.on(
    "closed",
    () => {
      removeChangeSiteHandlers();
      changeSiteWindow = null;
    }
  );

  try {
    await changeSiteWindow.loadFile(
      path.join(
        __dirname,
        "changeSite.html"
      )
    );

    writeLog(
      "INFO",
      "Đã mở cửa sổ đổi cơ sở"
    );
  } catch (error) {
    writeLog(
      "ERROR",
      "Không thể mở cửa sổ đổi cơ sở",
      error
    );

    await dialog.showMessageBox(
      parentWindow,
      {
        type: "error",
        title: "SuperPOS",
        message:
          "Không thể mở màn hình đổi cơ sở.",
        detail:
          error?.message ||
          String(error)
      }
    );

    if (
      changeSiteWindow &&
      !changeSiteWindow.isDestroyed()
    ) {
      changeSiteWindow.destroy();
    }
  }
}