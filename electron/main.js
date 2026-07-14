import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ORIGIN = "https://app.hoantuyet.vn";

function getStartUrl() {
  const siteArg = process.argv.find((arg) => arg.startsWith("--site="));
  const site = siteArg?.split("=")[1]?.trim().toLowerCase();

  if (site === "cs2") {
    return `${APP_ORIGIN}/banlemtcs2.html`;
  }

  return `${APP_ORIGIN}/banlemtcs1.html`;
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
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
      sandbox: true
    }
  });

  mainWindow.maximize();

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const targetUrl = new URL(url);

      if (targetUrl.origin === APP_ORIGIN) {
        return { action: "allow" };
      }

      shell.openExternal(url);
    } catch (error) {
      console.error("Không thể xử lý liên kết:", error);
    }

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const targetUrl = new URL(url);

      if (targetUrl.origin !== APP_ORIGIN) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch (error) {
      event.preventDefault();
      console.error("URL không hợp lệ:", error);
    }
  });

  mainWindow.loadURL(getStartUrl()).catch((error) => {
    console.error("Không thể tải trang bán hàng:", error);
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});