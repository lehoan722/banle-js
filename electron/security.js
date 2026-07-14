import { shell } from "electron";

const ALLOWED_ORIGINS = new Set([
  "https://app.hoantuyet.vn"
]);

function isAllowedUrl(url) {
  try {
    const parsedUrl = new URL(url);

    if (
      parsedUrl.protocol === "https:" &&
      ALLOWED_ORIGINS.has(parsedUrl.origin)
    ) {
      return true;
    }

    if (parsedUrl.protocol === "file:") {
      const normalizedPath = decodeURIComponent(parsedUrl.pathname)
        .replace(/\\/g, "/")
        .toLowerCase();

      return normalizedPath.endsWith("/offline.html");
    }

    if (
      parsedUrl.protocol === "data:" &&
      parsedUrl.href.startsWith("data:text/html")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function applySecurity(mainWindow) {
  const { webContents } = mainWindow;

  // Không cho website tự xin các quyền nhạy cảm.
  webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    }
  );

  // Chỉ cho điều hướng bên trong tên miền chính thức.
  webContents.on("will-navigate", (event, url) => {
    if (isAllowedUrl(url)) {
      return;
    }

    event.preventDefault();

    try {
      const parsedUrl = new URL(url);

      // Chỉ mở bằng trình duyệt ngoài đối với HTTP/HTTPS.
      if (
        parsedUrl.protocol === "http:" ||
        parsedUrl.protocol === "https:"
      ) {
        shell.openExternal(url);
      }
    } catch (error) {
      console.error("Không thể xử lý liên kết:", error);
    }
  });

  // Kiểm soát liên kết tạo cửa sổ mới.
  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
          }
        }
      };
    }

    try {
      shell.openExternal(url);
    } catch (error) {
      console.error("Không thể mở liên kết ngoài:", error);
    }

    return { action: "deny" };
  });

  // Chặn website tải hoặc thay thế nội dung bằng giao thức nguy hiểm.
  webContents.on("will-redirect", (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
    }
  });

  // Chặn các phím mở công cụ phát triển trên máy cửa hàng.
  webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "").toUpperCase();

    const isF12 = key === "F12";

    const isDevToolsShortcut =
      input.control &&
      input.shift &&
      ["I", "J", "C"].includes(key);

    if (isF12 || isDevToolsShortcut) {
      event.preventDefault();
    }
  });

  // Nếu DevTools bị mở bằng cách khác thì tự đóng lại.
  webContents.on("devtools-opened", () => {
    webContents.closeDevTools();
  });
}