import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

let logDirectory = "";
let logFilePath = "";

function formatDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function getLogDateName(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");

  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())}`
  );
}

export function initializeLogger() {
  logDirectory = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logDirectory, { recursive: true });

  logFilePath = path.join(
    logDirectory,
    `hoantuyet-${getLogDateName()}.log`
  );

  writeLog("INFO", "Khởi động hệ thống ghi log");
  writeLog("INFO", `Phiên bản ứng dụng: ${app.getVersion()}`);
  writeLog("INFO", `Electron: ${process.versions.electron}`);
  writeLog("INFO", `Hệ điều hành: ${process.platform}`);
}

export function writeLog(level, message, details = null) {
  try {
    if (!logFilePath) {
      return;
    }

    let line = `[${formatDate()}] [${level}] ${message}`;

    if (details !== null && details !== undefined) {
      if (details instanceof Error) {
        line += ` | ${details.stack || details.message}`;
      } else if (typeof details === "object") {
        line += ` | ${JSON.stringify(details)}`;
      } else {
        line += ` | ${String(details)}`;
      }
    }

    fs.appendFileSync(logFilePath, `${line}\n`, "utf8");
  } catch (error) {
    console.error("Không thể ghi log:", error);
  }
}

export function getLogDirectory() {
  return logDirectory;
}