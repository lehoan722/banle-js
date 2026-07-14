import {
  BrowserWindow,
  ipcMain,
  net
} from "electron";

export function createConnectionManager({
  mainWindow,
  targetUrl,
  offlineHtmlPath,
  offlinePreloadPath,
  writeLog,
  intervalMs = 5000,
  timeoutMs = 8000
}) {
  let offlineWindow = null;
  let connectionTimer = null;
  let checkRunning = false;
  let connected = null;

  function isOfflineWindowSender(event) {
    return (
      offlineWindow &&
      !offlineWindow.isDestroyed() &&
      event.sender ===
        offlineWindow.webContents
    );
  }

  function sendStatus(status) {
    if (
      !offlineWindow ||
      offlineWindow.isDestroyed()
    ) {
      return;
    }

    offlineWindow.webContents.send(
      "superpos-offline:status",
      status
    );
  }

  async function createOfflineWindow(
    message
  ) {
    if (
      offlineWindow &&
      !offlineWindow.isDestroyed()
    ) {
      sendStatus({
        online: false,
        checking: false,
        message
      });

      offlineWindow.show();
      offlineWindow.focus();
      return;
    }

    offlineWindow = new BrowserWindow({
      parent: mainWindow,
      modal: true,

      width: 640,
      height: 500,

      minWidth: 640,
      minHeight: 500,

      maxWidth: 640,
      maxHeight: 500,

      resizable: false,
      minimizable: false,
      maximizable: false,
      closable: false,

      show: false,
      autoHideMenuBar: true,
      backgroundColor: "#f3f6f9",

      webPreferences: {
        preload: offlinePreloadPath,

        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        devTools: false,
        webviewTag: false
      }
    });

    offlineWindow.removeMenu();

    offlineWindow.on("closed", () => {
      offlineWindow = null;
    });

    try {
      await offlineWindow.loadFile(
        offlineHtmlPath
      );

      sendStatus({
        online: false,
        checking: false,
        message
      });

      offlineWindow.show();
      offlineWindow.focus();

      writeLog(
        "WARN",
        "Đã mở cửa sổ mất kết nối"
      );
    } catch (error) {
      writeLog(
        "ERROR",
        "Không thể mở cửa sổ mất kết nối",
        error
      );
    }
  }

  async function checkConnection({
    manual = false
  } = {}) {
    if (checkRunning) {
      return connected;
    }

    checkRunning = true;

    if (manual) {
      sendStatus({
        online: false,
        checking: true,
        message: "Đang kiểm tra kết nối..."
      });
    }

    const controller =
      new AbortController();

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const separator =
        targetUrl.includes("?") ? "&" : "?";

      const checkUrl =
        `${targetUrl}${separator}` +
        `superpos_check=${Date.now()}`;

      const response = await net.fetch(
        checkUrl,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        }
      );

      if (response.status >= 500) {
        throw new Error(
          `Máy chủ phản hồi HTTP ` +
          `${response.status}`
        );
      }

      const recovered =
        connected === false;

      connected = true;

      if (
        offlineWindow &&
        !offlineWindow.isDestroyed()
      ) {
        offlineWindow.setClosable(true);

        sendStatus({
          online: true,
          checking: false
        });
      }

      if (recovered) {
        writeLog(
          "INFO",
          "Kết nối SuperPOS đã hoạt động trở lại"
        );
      }

      return true;
    } catch (error) {
      const firstFailure =
        connected !== false;

      connected = false;

      const message =
        error?.name === "AbortError"
          ? "Máy chủ phản hồi quá chậm."
          : "Không có Internet hoặc " +
            "máy chủ không phản hồi.";

      if (firstFailure || manual) {
        writeLog(
          "ERROR",
          "Mất kết nối hệ thống SuperPOS",
          error
        );
      }

      await createOfflineWindow(message);

      return false;
    } finally {
      clearTimeout(timeoutId);
      checkRunning = false;
    }
  }

  function registerActions() {
    ipcMain.removeAllListeners(
      "superpos-offline:retry"
    );

    ipcMain.removeAllListeners(
      "superpos-offline:continue"
    );

    ipcMain.on(
      "superpos-offline:retry",
      async (event) => {
        if (!isOfflineWindowSender(event)) {
          return;
        }

        await checkConnection({
          manual: true
        });
      }
    );

    ipcMain.on(
      "superpos-offline:continue",
      async (event) => {
        if (
          !isOfflineWindowSender(event) ||
          connected !== true
        ) {
          return;
        }

        writeLog(
          "INFO",
          "Người dùng tiếp tục vào trang bán hàng"
        );

        if (
          offlineWindow &&
          !offlineWindow.isDestroyed()
        ) {
          offlineWindow.setClosable(true);
          offlineWindow.close();
          offlineWindow = null;
        }

        try {
          await mainWindow.loadURL(
            targetUrl
          );
        } catch (error) {
          writeLog(
            "ERROR",
            "Không thể tải lại trang bán hàng",
            error
          );

          connected = false;

          await createOfflineWindow(
            "Không thể tải lại trang bán hàng."
          );
        }
      }
    );
  }

  function start() {
    registerActions();

    checkConnection();

    connectionTimer = setInterval(() => {
      checkConnection();
    }, intervalMs);
  }

  function stop() {
    if (connectionTimer) {
      clearInterval(connectionTimer);
      connectionTimer = null;
    }

    ipcMain.removeAllListeners(
      "superpos-offline:retry"
    );

    ipcMain.removeAllListeners(
      "superpos-offline:continue"
    );

    if (
      offlineWindow &&
      !offlineWindow.isDestroyed()
    ) {
      offlineWindow.setClosable(true);
      offlineWindow.destroy();
      offlineWindow = null;
    }
  }

  function reportLoadFailure(details = {}) {
    connected = false;

    writeLog(
      "ERROR",
      "Trang bán hàng tải thất bại",
      details
    );

    createOfflineWindow(
      "Không thể tải trang bán hàng " +
      "do mất kết nối."
    );
  }

  return {
    start,
    stop,
    checkConnection,
    reportLoadFailure
  };
}