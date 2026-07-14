import {
  app,
  BrowserWindow,
  session
} from "electron";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applySecurity }
  from "./security.js";

import { createApplicationMenu }
  from "./menu.js";

import {
  initializeLogger,
  writeLog
} from "./logger.js";

import { registerIpcHandlers }
  from "./ipc.js";

import { createConnectionManager }
  from "./connectionManager.js";

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const APP_ORIGIN =
  "https://app.hoantuyet.vn";

const APP_NAME = "SuperPOS";

app.setName(APP_NAME);

app.setPath(
  "userData",
  path.join(
    app.getPath("appData"),
    APP_NAME
  )
);

let mainWindow = null;
let connectionManager = null;

async function repairCacheOnce() {
  const markerFile = path.join(
    app.getPath("userData"),
    "cache-repair-v1.done"
  );

  if (fs.existsSync(markerFile)) {
    writeLog(
      "INFO",
      "Không cần sửa CacheStorage"
    );
    return;
  }

  try {
    await session.defaultSession
      .clearCache();

    await session.defaultSession
      .clearStorageData({
        storages: [
          "cachestorage",
          "serviceworkers"
        ]
      });

    fs.writeFileSync(
      markerFile,
      new Date().toISOString(),
      "utf8"
    );

    writeLog(
      "INFO",
      "Đã sửa CacheStorage lần đầu thành công"
    );
  } catch (error) {
    writeLog(
      "ERROR",
      "Sửa CacheStorage không thành công",
      error
    );
  }
}

function getStartUrl() {
  const siteArgument =
    process.argv.find(
      (argument) =>
        argument.startsWith("--site=")
    );

  const site = siteArgument
    ?.split("=")[1]
    ?.trim()
    .toLowerCase();

  if (site === "cs2") {
    return (
      `${APP_ORIGIN}/banlemtcs2.html`
    );
  }

  return (
    `${APP_ORIGIN}/banlemtcs1.html`
  );
}

function createMainWindow() {
  const targetUrl = getStartUrl();

  writeLog(
    "INFO",
    `Đang mở trang: ${targetUrl}`
  );

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1100,
    minHeight: 700,

    show: true,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",

    webPreferences: {
      preload: path.join(
        __dirname,
        "preload.cjs"
      ),

      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false,
      webviewTag: false
    }
  });

  createApplicationMenu(mainWindow);
  applySecurity(mainWindow);

  mainWindow.maximize();

  connectionManager =
    createConnectionManager({
      mainWindow,
      targetUrl,

      offlineHtmlPath: path.join(
        __dirname,
        "offline.html"
      ),

      offlinePreloadPath: path.join(
        __dirname,
        "offline-preload.cjs"
      ),

      writeLog,
      intervalMs: 5000,
      timeoutMs: 8000
    });

  mainWindow.webContents.on(
    "did-finish-load",
    () => {
      writeLog(
        "INFO",
        "Trang bán hàng đã tải hoàn tất",
        mainWindow.webContents.getURL()
      );
    }
  );

  mainWindow.webContents.on(
    "did-fail-load",
    (
      _event,
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame
    ) => {
      if (
        !isMainFrame ||
        errorCode === -3
      ) {
        return;
      }

      connectionManager
        ?.reportLoadFailure({
          errorCode,
          errorDescription,
          validatedURL
        });
    }
  );

  mainWindow.webContents.on(
    "unresponsive",
    () => {
      writeLog(
        "ERROR",
        "Giao diện Electron không phản hồi"
      );
    }
  );

  mainWindow.webContents.on(
    "responsive",
    () => {
      writeLog(
        "INFO",
        "Giao diện Electron đã phản hồi trở lại"
      );
    }
  );

  mainWindow.webContents.on(
    "render-process-gone",
    (_event, details) => {
      writeLog(
        "ERROR",
        "Tiến trình giao diện đã dừng",
        details
      );
    }
  );

  mainWindow.on("closed", () => {
    connectionManager?.stop();
    connectionManager = null;
    mainWindow = null;
  });

  connectionManager.start();

  mainWindow
    .loadURL(targetUrl)
    .catch((error) => {
      connectionManager
        ?.reportLoadFailure({
          message:
            error?.message ||
            String(error)
        });
    });
}

const hasSingleInstanceLock =
  app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    initializeLogger();

    writeLog(
      "INFO",
      "Electron đã sẵn sàng"
    );

    await repairCacheOnce();

    registerIpcHandlers();
    createMainWindow();

    app.on("activate", () => {
      if (
        BrowserWindow
          .getAllWindows()
          .length === 0
      ) {
        createMainWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  connectionManager?.stop();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on(
  "uncaughtException",
  (error) => {
    writeLog(
      "FATAL",
      "Lỗi chưa xử lý trong tiến trình chính",
      error
    );
  }
);

process.on(
  "unhandledRejection",
  (reason) => {
    writeLog(
      "ERROR",
      "Promise bị từ chối chưa xử lý",
      reason
    );
  }
);