import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const VALID_SITES = new Set([
  "cs1",
  "cs2"
]);

function getConfigDirectory() {
  return path.join(
    app.getPath("userData"),
    "config"
  );
}

export function getConfigFilePath() {
  return path.join(
    getConfigDirectory(),
    "app.json"
  );
}

function createDefaultConfig(site) {
  return {
    version: 1,
    site,
    language: "vi",
    printer: "default",
    updatedAt: new Date().toISOString()
  };
}

export function isValidSite(site) {
  return VALID_SITES.has(
    String(site || "").trim().toLowerCase()
  );
}

export function readAppConfig() {
  const configFile = getConfigFilePath();

  if (!fs.existsSync(configFile)) {
    return null;
  }

  try {
    const rawContent = fs.readFileSync(
      configFile,
      "utf8"
    );

    const config = JSON.parse(rawContent);

    if (!isValidSite(config?.site)) {
      return null;
    }

    return {
      ...config,
      site: String(config.site).toLowerCase()
    };
  } catch {
    return null;
  }
}

export function saveAppConfig(site) {
  const normalizedSite = String(site || "")
    .trim()
    .toLowerCase();

  if (!isValidSite(normalizedSite)) {
    throw new Error(
      "Cơ sở được chọn không hợp lệ"
    );
  }

  const configDirectory =
    getConfigDirectory();

  const configFile =
    getConfigFilePath();

  fs.mkdirSync(
    configDirectory,
    {
      recursive: true
    }
  );

  const existingConfig =
    readAppConfig() || {};

  const newConfig = {
    ...createDefaultConfig(normalizedSite),
    ...existingConfig,
    site: normalizedSite,
    updatedAt: new Date().toISOString()
  };

  // Ghi vào file tạm trước để tránh app.json bị hỏng
  // nếu máy mất điện đúng lúc đang lưu.
  const temporaryFile =
    `${configFile}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(newConfig, null, 2),
    "utf8"
  );

  fs.renameSync(
    temporaryFile,
    configFile
  );

  return newConfig;
}