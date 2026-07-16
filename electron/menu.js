import {
  Menu,
  app,
  dialog,
  net,
  shell
} from "electron";

import {
  getLogDirectory,
  writeLog
} from "./logger.js";

import {
  openChangeSiteWindow
} from "./windows/changeSite/changeSiteWindow.js";

const SYSTEM_URL = "https://app.hoantuyet.vn/banlemtcs1.html";

async function openLogsFolder(mainWindow) {
  const logDirectory = getLogDirectory();

  if (!logDirectory) {
    await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "SuperPOS",
      message: "Thư mục nhật ký chưa được khởi tạo."
    });

    return;
  }

  const errorMessage = await shell.openPath(logDirectory);

  if (errorMessage) {
    writeLog("ERROR", "Không thể mở thư mục nhật ký", errorMessage);

    await dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "SuperPOS",
      message: "Không thể mở thư mục nhật ký.",
      detail: errorMessage
    });

    return;
  }

  writeLog("INFO", "Người dùng đã mở thư mục nhật ký");
}

async function checkSystemConnection(mainWindow) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 10000);

  try {
    writeLog("INFO", "Bắt đầu kiểm tra kết nối hệ thống");

    const response = await net.fetch(SYSTEM_URL, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Máy chủ phản hồi HTTP ${response.status}`);
    }

    writeLog("INFO", "Kiểm tra kết nối hệ thống thành công");

    await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Kiểm tra kết nối",
      message: "Kết nối tới hệ thống SuperPOS hoạt động tốt.",
      detail: `Máy chủ phản hồi HTTP ${response.status}.`
    });
  } catch (error) {
    const message =
      error?.name === "AbortError"
        ? "Quá thời gian chờ phản hồi từ máy chủ."
        : error?.message || String(error);

    writeLog("ERROR", "Kiểm tra kết nối hệ thống thất bại", error);

    await dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Kiểm tra kết nối",
      message: "Không thể kết nối tới hệ thống SuperPOS.",
      detail:
        `${message}\n\n` +
        "Hãy kiểm tra Internet, modem mạng hoặc trạng thái máy chủ."
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function showApplicationInfo(mainWindow) {
  await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Thông tin SuperPOS",
    message: "SuperPOS – Shop Hoàn Tuyết",
    detail:
      `Phiên bản ứng dụng: ${app.getVersion()}\n` +
      `Phiên bản Electron: ${process.versions.electron}\n` +
      `Phiên bản Chromium: ${process.versions.chrome}\n` +
      `Hệ điều hành: ${process.platform}\n` +
      `Kiến trúc máy: ${process.arch}`
  });
}

export function createApplicationMenu(mainWindow) {
  const template = [
    {
      label: "Hệ thống",
      submenu: [
        {
          label: "Tải lại trang",
          accelerator: "Ctrl+R",
          click: () => {
            mainWindow.webContents.reload();
          }
        },
        {
          label: "Tải lại hoàn toàn",
          accelerator: "Ctrl+Shift+R",
          click: () => {
            mainWindow.webContents.reloadIgnoringCache();
          }
        },
        { type: "separator" },
        {
          label: "Thoát phần mềm",
          accelerator: "Alt+F4",
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: "Hiển thị",
      submenu: [
        {
          label: "Phóng to",
          accelerator: "Ctrl+=",
          role: "zoomIn"
        },
        {
          label: "Thu nhỏ",
          accelerator: "Ctrl+-",
          role: "zoomOut"
        },
        {
          label: "Kích thước mặc định",
          accelerator: "Ctrl+0",
          role: "resetZoom"
        },
        { type: "separator" },
        {
          label: "Toàn màn hình",
          accelerator: "F11",
          role: "togglefullscreen"
        }
      ]
    },
    {
      label: "Công cụ",
      submenu: [
        {
          label: "Kiểm tra kết nối hệ thống",
          click: async () => {
            await checkSystemConnection(
              mainWindow
            );
          }
        },
        {
          label: "Đổi cơ sở sử dụng...",
          click: async () => {
            await openChangeSiteWindow(
              mainWindow
            );
          }
        },
        { type: "separator" },
        {
          label: "Mở thư mục nhật ký",
          click: async () => {
            await openLogsFolder(
              mainWindow
            );
          }
        }
      ]
    },
    {
      label: "Trợ giúp",
      submenu: [
        {
          label: "Thông tin SuperPOS",
          click: async () => {
            await showApplicationInfo(mainWindow);
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}