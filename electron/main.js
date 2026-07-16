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

import {
  readAppConfig,
  isValidSite
} from "./configManager.js";

import {
  openInitialSetup
} from "./setupWindow.js";

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

function getSiteFromCommandLine() {
  const siteArgument =
    process.argv.find(
      (argument) =>
        argument.startsWith("--site=")
    );

  const site = siteArgument
    ?.split("=")[1]
    ?.trim()
    .toLowerCase();

  return isValidSite(site)
    ? site
    : null;
}

function getStartUrl(site) {
  if (site === "cs2") {
    return (
      `${APP_ORIGIN}/banlemtcs2.html`
    );
  }

  return (
    `${APP_ORIGIN}/banlemtcs1.html`
  );
}

async function resolveApplicationConfig() {
  // Dùng cho quá trình phát triển bằng:
  // npm run electron:cs1 hoặc electron:cs2.
  const commandLineSite =
    getSiteFromCommandLine();

  if (commandLineSite) {
    writeLog(
      "INFO",
      "Sử dụng cơ sở từ tham số dòng lệnh",
      {
        site: commandLineSite
      }
    );

    return {
      site: commandLineSite,
      source: "command-line"
    };
  }

  const existingConfig =
    readAppConfig();

  if (existingConfig) {
    writeLog(
      "INFO",
      "Đã đọc cấu hình SuperPOS",
      {
        site: existingConfig.site
      }
    );

    return existingConfig;
  }

  writeLog(
    "INFO",
    "Chưa có cấu hình, mở thiết lập ban đầu"
  );

  return openInitialSetup({
    preloadPath: path.join(
      __dirname,
      "setup-preload.cjs"
    ),

    htmlPath: path.join(
      __dirname,
      "setup.html"
    ),

    writeLog
  });
}

function createMainWindow(site) {
  const targetUrl = getStartUrl(site);

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

    try {
      const config =
        await resolveApplicationConfig();

      createMainWindow(config.site);
    } catch (error) {
      writeLog(
        "ERROR",
        "Không thể hoàn tất thiết lập SuperPOS",
        error
      );

      app.quit();
      return;
    }

    app.on("activate", async () => {
      if (
        BrowserWindow
          .getAllWindows()
          .length !== 0
      ) {
        return;
      }

      try {
        const config =
          await resolveApplicationConfig();

        createMainWindow(config.site);
      } catch (error) {
        writeLog(
          "ERROR",
          "Không thể mở lại SuperPOS",
          error
        );
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