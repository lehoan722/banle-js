import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applySecurity } from "./security.js";
import { createApplicationMenu } from "./menu.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ORIGIN = "https://app.hoantuyet.vn";

let mainWindow = null;

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

  app.whenReady().then(() => {
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