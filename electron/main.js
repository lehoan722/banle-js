import { app, BrowserWindow, session } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applySecurity } from "./security.js";
import { createApplicationMenu } from "./menu.js";
import {
  initializeLogger,
  writeLog
} from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ORIGIN = "https://app.hoantuyet.vn";
const APP_NAME = "SuperPOS";

// Phải cấu hình trước app.whenReady().
app.setName(APP_NAME);

const superPosUserDataPath = path.join(
  app.getPath("appData"),
  APP_NAME
);

app.setPath("userData", superPosUserDataPath);

let mainWindow = null;

async function repairCacheOnce() {
  const markerFile = path.join(
    app.getPath("userData"),
    "cache-repair-v1.done"
  );

  // Đã sửa trước đó thì không xóa cache thêm lần nữa.
  if (fs.existsSync(markerFile)) {
    writeLog("INFO", "Không cần sửa CacheStorage");
    return;
  }

  try {
    await session.defaultSession.clearCache();

    await session.defaultSession.clearStorageData({
      storages: ["cachestorage", "serviceworkers"]
    });

    fs.writeFileSync(
      markerFile,
      new Date().toISOString(),
      "utf8"
    );

    writeLog("INFO", "Đã sửa CacheStorage lần đầu thành công");
  } catch (error) {
    writeLog("ERROR", "Sửa CacheStorage không thành công", error);
  }
}

function getStartUrl() {
  const siteArgument = process.argv.find((argument) =>
    argument.startsWith("--site=")
  );

  const site = siteArgument
    ?.split("=")[1]
    ?.trim()
    .toLowerCase();

  if (site === "cs2") {
    return `${APP_ORIGIN}/banlemtcs2.html`;
  }

  return `${APP_ORIGIN}/banlemtcs1.html`;
}

function createMainWindow() {

  writeLog("INFO", `Đang mở trang: ${getStartUrl()}`);
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1100,
    minHeight: 700,

    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",

    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),

      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,

      // Không cho nội dung web tự mở DevTools.
      devTools: false,

      // Không cho website bật webview.
      webviewTag: false
    }
  });

  createApplicationMenu(mainWindow);
  applySecurity(mainWindow);

  mainWindow.maximize();

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    writeLog("INFO", "Trang bán hàng đã tải hoàn tất");
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }

      writeLog("ERROR", "Không tải được trang bán hàng", {
        errorCode,
        errorDescription,
        validatedURL
      });
    }
  );

  mainWindow.webContents.on("unresponsive", () => {
    writeLog("ERROR", "Giao diện Electron không phản hồi");
  });

  mainWindow.webContents.on("responsive", () => {
    writeLog("INFO", "Giao diện Electron đã phản hồi trở lại");
  });

  mainWindow.webContents.on(
    "render-process-gone",
    (_event, details) => {
      writeLog("ERROR", "Tiến trình giao diện Electron đã dừng", details);
    }
  );

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(getStartUrl()).catch((error) => {
    console.error("Không thể tải trang bán hàng:", error);
  });
}

// Ngăn người dùng mở nhiều phiên bản phần mềm cùng lúc.
const hasSingleInstanceLock = app.requestSingleInstanceLock();

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
    writeLog("INFO", "Electron đã sẵn sàng");

    await repairCacheOnce();

    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on("uncaughtException", (error) => {
  writeLog("FATAL", "Lỗi chưa được xử lý trong tiến trình chính", error);
});

process.on("unhandledRejection", (reason) => {
  writeLog("ERROR", "Promise bị từ chối nhưng chưa được xử lý", reason);
});