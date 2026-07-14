import { app, ipcMain, shell } from "electron";
import { getLogDirectory, writeLog } from "./logger.js";

const ALLOWED_ORIGIN = "https://app.hoantuyet.vn";

function isTrustedSender(event) {
  try {
    const senderUrl = event.senderFrame?.url;

    if (!senderUrl) {
      return false;
    }

    const parsedUrl = new URL(senderUrl);

    return parsedUrl.origin === ALLOWED_ORIGIN;
  } catch {
    return false;
  }
}

function assertTrustedSender(event) {
  if (!isTrustedSender(event)) {
    writeLog("WARN", "Đã chặn yêu cầu IPC từ nguồn không hợp lệ", {
      senderUrl: event.senderFrame?.url || "unknown"
    });

    throw new Error("Nguồn gửi IPC không được phép");
  }
}

export function registerIpcHandlers() {
  // Tránh đăng ký trùng nếu cửa sổ được tạo lại.
  ipcMain.removeHandler("superpos:get-app-info");
  ipcMain.removeHandler("superpos:open-logs-folder");
  ipcMain.removeHandler("superpos:connection-lost");

  ipcMain.handle(
    "superpos:connection-lost",
    async (event, payload) => {

      assertTrustedSender(event);

      writeLog(
        "WARN",
        "Website mất kết nối",
        payload
      );

      return {
        ok: true
      };
    }
  );

  ipcMain.handle("superpos:get-app-info", async (event) => {
    assertTrustedSender(event);

    return {
      name: app.getName(),
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      platform: process.platform
    };
  });

  ipcMain.handle("superpos:open-logs-folder", async (event) => {
    assertTrustedSender(event);

    const logDirectory = getLogDirectory();

    if (!logDirectory) {
      throw new Error("Thư mục log chưa được khởi tạo");
    }

    const result = await shell.openPath(logDirectory);

    if (result) {
      writeLog("ERROR", "Không thể mở thư mục log", result);
      throw new Error(result);
    }

    writeLog("INFO", "Người dùng đã mở thư mục log");

    return {
      success: true
    };
  });
}