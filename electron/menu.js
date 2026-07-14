import { Menu, app } from "electron";

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
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}