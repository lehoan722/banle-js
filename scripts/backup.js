// ==== CẤU HÌNH ====
// Danh sách bảng cần backup
export const BACKUP_TABLES = [
  'dmhanghoa',
  'dmkhachhang',
  'dmnhanvien',
  'dmnhomhang',
  'dmchungloai',
  'sochungtu',
  'hoadon_banle',
  'ct_hoadon_banle',
  'hoadon_banle_t',
  'ct_hoadon_banle_t',
  'kiemkho'
  // Thêm các bảng khác nếu cần
];

// ==== Phụ thuộc thư viện ngoài ====
// - JSZip: https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// - FileSaver: https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// - SheetJS: https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js

// ==== HÀM CHÍNH ====

// Nhập biến supabase từ file client của bạn
import { supabase } from './supabaseClient.js';

/**
 * Backup tất cả bảng về dạng ZIP (mỗi bảng 1 file .csv)
 */
export async function backupAllTablesToZip(tables = BACKUP_TABLES) {
    const zip = new JSZip();
    for (const table of tables) {
        try {
            const data = await fetchAllRows(table);
            if (data.length) {
                const csv = toCSV(data);
                zip.file(`${table}.csv`, csv);
            } else {
                zip.file(`${table}.EMPTY.txt`, 'Bảng không có dữ liệu');
            }
        } catch (err) {
            zip.file(`${table}_ERROR.txt`, err.message);
        }
    }
    // Xuất ZIP
    const now = new Date();
    const name = `supabase_backup_${formatDateForFile(now)}.zip`;
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, name);
}

/**
 * Backup tất cả bảng về 1 file Excel (.xlsx), mỗi bảng 1 sheet
 */
export async function backupAllTablesToExcel(tables = BACKUP_TABLES) {
    const workbook = XLSX.utils.book_new();
    for (const table of tables) {
        try {
            const data = await fetchAllRows(table);
            if (data.length) {
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(workbook, ws, table.substring(0, 31)); // Sheet name tối đa 31 ký tự
            }
        } catch (err) {
            // Nếu lỗi, thêm sheet lỗi riêng
            const ws = XLSX.utils.aoa_to_sheet([[`ERROR: ${err.message}`]]);
            XLSX.utils.book_append_sheet(workbook, ws, (table + "_ERROR").substring(0, 31));
        }
    }
    // Xuất Excel
    const now = new Date();
    const name = `supabase_backup_${formatDateForFile(now)}.xlsx`;
    XLSX.writeFile(workbook, name);
}

// ==== TIỆN ÍCH ====

/**
 * Lấy toàn bộ dữ liệu từng bảng qua paging (không giới hạn 1000 dòng)
 */
async function fetchAllRows(table) {
    let allData = [];
    let limit = 1000, offset = 0, done = false;
    while (!done) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .range(offset, offset + limit - 1);
        if (error) throw new Error(error.message + ' (' + table + ')');
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        offset += data.length;
        if (data.length < limit) done = true;
    }
    return allData;
}

/**
 * Chuyển array object sang CSV chuẩn
 */
function toCSV(data) {
    if (!data.length) return '';
    const keys = Object.keys(data[0]);
    const csvRows = [
        keys.join(','), // Header
        ...data.map(row => keys.map(k => {
            let val = row[k] ?? '';
            if (typeof val === 'string') val = val.replace(/"/g, '""');
            return `"${val}"`;
        }).join(','))
    ];
    return csvRows.join('\r\n');
}

/**
 * Định dạng ngày cho tên file
 */
function formatDateForFile(date) {
    return `${date.getFullYear()}${(date.getMonth()+1+"").padStart(2,"0")}${(date.getDate()+"").padStart(2,"0")}_${(date.getHours()+"").padStart(2,"0")}${(date.getMinutes()+"").padStart(2,"0")}`;
}

