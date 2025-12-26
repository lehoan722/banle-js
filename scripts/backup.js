// scripts/backup.js
// Backup dữ liệu Supabase ra ZIP (CSV) hoặc Excel.
// ✅ Nâng cấp: CHỈ ADMIN mới được phép tạo backup.
// - Nếu không phải admin: các hàm backup sẽ "no-op" (không tạo file, không báo lỗi).
//
// Yêu cầu thư viện global (đã có trong HTML):
// - JSZip: https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// - FileSaver: https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js (saveAs)
// - XLSX: https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js
//
// Yêu cầu Supabase client global:
// - window.supabase (đã init từ supabaseClient.js)

export const BACKUP_TABLES = [
  "dmhanghoa",
  "dmkhachhang",
  "dmnhanvien",
  "dmnhomhang",
  "dmchungloai",
  "sochungtu",
  "hoadon_banle",
  "ct_hoadon_banle",
  "hoadon_banleT",
  "ct_hoadon_banleT",
  "kiemkho",
  // Thêm các bảng khác nếu cần
];

// ====== PUBLIC API ======

/**
 * Backup tất cả bảng về dạng ZIP (mỗi bảng 1 file .csv)
 * @returns {Promise<boolean>} true nếu có tạo file; false nếu bị chặn quyền (không phải admin)
 */
export async function backupAllTablesToZip(tables = BACKUP_TABLES) {
  const isAdmin = await isAdminUser();
  if (!isAdmin) return false;

  const JSZipLib = mustGetGlobal("JSZip");
  const saveAsFn = mustGetGlobal("saveAs");

  const zip = new JSZipLib();
  for (const table of tables) {
    try {
      const data = await fetchAllRows(table);
      if (data.length) {
        const csv = toCSV(data);
        zip.file(`${table}.csv`, csv);
      } else {
        zip.file(`${table}.EMPTY.txt`, "Bảng không có dữ liệu");
      }
    } catch (err) {
      // Không dừng toàn bộ backup nếu 1 bảng lỗi
      zip.file(`${table}.ERROR.txt`, String(err?.message || err));
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const filename = `backup_${formatDateForFile(new Date())}.zip`;
  saveAsFn(blob, filename);
  return true;
}

/**
 * Backup tất cả bảng về dạng Excel (.xlsx) (mỗi bảng 1 sheet)
 * @returns {Promise<boolean>} true nếu có tạo file; false nếu bị chặn quyền (không phải admin)
 */
export async function backupAllTablesToExcel(tables = BACKUP_TABLES) {
  const isAdmin = await isAdminUser();
  if (!isAdmin) return false;

  const XLSXLib = mustGetGlobal("XLSX");

  const wb = XLSXLib.utils.book_new();

  for (const table of tables) {
    try {
      const data = await fetchAllRows(table);
      const sheetName = normalizeSheetName(table);

      // Nếu bảng rỗng vẫn tạo sheet để biết có bảng đó
      const ws = XLSXLib.utils.json_to_sheet(data && data.length ? data : [{ _EMPTY_: "" }], {
        skipHeader: false,
      });

      XLSXLib.utils.book_append_sheet(wb, ws, sheetName);
    } catch (err) {
      const sheetName = normalizeSheetName(`${table}_ERROR`);
      const ws = XLSXLib.utils.json_to_sheet([{ table, error: String(err?.message || err) }]);
      XLSXLib.utils.book_append_sheet(wb, ws, sheetName);
    }
  }

  const filename = `backup_${formatDateForFile(new Date())}.xlsx`;
  XLSXLib.writeFile(wb, filename);
  return true;
}

// ====== INTERNAL HELPERS ======

function mustGetGlobal(name) {
  const v = (typeof window !== "undefined" ? window[name] : undefined);
  if (!v) throw new Error(`Thiếu thư viện global: ${name}. Kiểm tra <script> load thư viện trước khi dùng backup.`);
  return v;
}

function getSupabaseClient() {
  const sb = (typeof window !== "undefined" ? window.supabase : undefined);
  if (!sb || !sb.from) throw new Error("Chưa khởi tạo window.supabase. Hãy load supabaseClient.js trước khi gọi backup.");
  return sb;
}

/**
 * Kiểm tra admin:
 * - Ưu tiên localStorage/sessionStorage key: is_admin = "true"/"false"
 * - Nếu chưa có, fallback gọi RPC is_admin() (nếu anh có tạo function này)
 */
async function isAdminUser() {
  try {
    const v =
      (localStorage.getItem("is_admin") ??
        sessionStorage.getItem("is_admin") ??
        localStorage.getItem("IS_ADMIN") ??
        sessionStorage.getItem("IS_ADMIN") ??
        "")
        .toString()
        .trim()
        .toLowerCase();

    if (v === "true") return true;
    if (v === "false") return false;

    // Fallback: RPC is_admin() nếu có
    const sb = getSupabaseClient();
    if (sb?.rpc) {
      const { data, error } = await sb.rpc("is_admin");
      if (!error && typeof data === "boolean") return data;
    }
  } catch (_) {
    // ignore
  }
  return false;
}

/**
 * Lấy toàn bộ dòng của 1 bảng (phân trang)
 */
async function fetchAllRows(table) {
  const sb = getSupabaseClient();

  const PAGE_SIZE = 1000;
  let from = 0;
  let all = [];

  while (true) {
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await sb.from(table).select("*").range(from, to);
    if (error) throw error;

    const rows = data || [];
    all = all.concat(rows);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;

    // Chống vòng lặp vô hạn nếu bảng quá lớn / lỗi
    if (from > 500000) throw new Error(`Bảng ${table} quá lớn (>${from} dòng). Dừng để tránh treo trình duyệt.`);
  }

  return all;
}

/**
 * Convert array of objects -> CSV (UTF-8)
 */
function toCSV(data) {
  if (!Array.isArray(data) || data.length === 0) return "";

  // Lấy union keys, ưu tiên key theo thứ tự của dòng đầu
  const keys = [];
  const pushKey = (k) => {
    if (k && !keys.includes(k)) keys.push(k);
  };

  Object.keys(data[0]).forEach(pushKey);
  for (let i = 1; i < data.length; i++) Object.keys(data[i] || {}).forEach(pushKey);

  const escapeCell = (val) => {
    if (val === null || val === undefined) return '""';
    if (typeof val === "object") {
      try {
        val = JSON.stringify(val);
      } catch (_) {
        val = String(val);
      }
    }
    val = String(val);

    // Escape quotes
    val = val.replace(/"/g, '""');
    return `"${val}"`;
  };

  const header = keys.map((k) => escapeCell(k)).join(",");
  const rows = data.map((row) => keys.map((k) => escapeCell(row?.[k] ?? "")).join(","));
  return [header, ...rows].join("\r\n");
}

/**
 * Định dạng ngày cho tên file: YYYYMMDD_HHMM (giờ local máy)
 */
function formatDateForFile(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}_${hh}${mm}`;
}

/**
 * Sheet name giới hạn 31 ký tự + bỏ ký tự cấm
 */
function normalizeSheetName(name) {
  const cleaned = String(name).replace(/[\[\]\*\?\/\\:]/g, "_");
  return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned;
}
