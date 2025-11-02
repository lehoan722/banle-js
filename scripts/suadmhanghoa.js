import { supabase } from './supabaseClient.js';
import { backupAllTablesToZip, backupAllTablesToExcel } from './backup.js';


// ==== Khai báo các trường bảng danh mục hàng hóa (giống bảng SQL) ====
const COLS = [
    { name: "masp", label: "Mã sản phẩm" },
    { name: "tensp", label: "Tên sản phẩm" },
    { name: "gianhap", label: "Giá nhập" },
    { name: "giale", label: "Giá lẻ" },
    { name: "giasi", label: "Giá sỉ" },
    { name: "mangan", label: "Mã ngắn" },
    { name: "nhomhang", label: "Nhóm hàng" },
    { name: "nhacc", label: "Nhà CC" },
    { name: "chungloai", label: "Chủng loại" },
    { name: "vitrikho1", label: "Vị trí kho 1" },
    { name: "vitrikho2", label: "Vị trí kho 2" },
    { name: "mausac", label: "Màu sắc" },
    { name: "khuyenmai", label: "Khuyến mãi" },
    { name: "quanlykichco", label: "Quản lý kích cỡ" },
    { name: "active", label: "Đang dùng?" },
    { name: "ngaysua", label: "Ngày sửa" },
    { name: "ngaykiem", label: "Ngày kiểm" },
    { name: "dvt", label: "ĐVT" },
    { name: "nhapdau", label: "Ngày nhập đầu" },
    { name: "vitrikho3", label: "Vị trí kho 3" },
];

// ==== Xử lý login đơn giản ====
// Chỉ gọi khi đăng nhập, lưu token vào localStorage
document.getElementById('login-submit').onclick = async function () {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    document.getElementById('login-status').textContent = 'Đang đăng nhập...';
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        document.getElementById('login-status').textContent = 'Sai tài khoản hoặc mật khẩu!';
    } else {
        document.getElementById('login-status').textContent = 'Đăng nhập thành công!';
        localStorage.setItem('supabase_access_token', data.session.access_token);
        setTimeout(() => window.location.reload(), 800);
    }
};

// ==== Render dropdown chọn cột cần ghi ====
function renderColSelect() {
    let html = `<option value="" selected disabled>-- Chọn mục cần ghi --</option>` +
        COLS.filter(c => c.name !== "masp")
            .map(c => `<option value="${c.name}">${c.label}</option>`).join("");
    document.getElementById('col-select').innerHTML = html;
}
renderColSelect();

// ==== Table Handsontable (chỉ gồm masp, cột cần sửa, trạng thái) ====
let hot;
function initTable(colname = 'vitrikho1') {
    let colInfo = COLS.find(c => c.name === colname);
    let colLabel = colInfo ? colInfo.label : colname;
    let colHeaders = ['Mã sản phẩm', colLabel, 'Trạng thái'];
    let columns = [
        { data: 'masp', type: 'text', width: 150 },
        { data: colname, type: 'text', width: 150 },
        { data: 'trangthai', type: 'text', width: 110 }
    ];
    const container = document.getElementById('hot');
    if (hot) hot.destroy();
    hot = new Handsontable(container, {
        data: Array.from({ length: 30 }, () => ({ masp: null, [colname]: null, trangthai: null })),
        columns,
        colHeaders,
        rowHeaders: true,
        minSpareRows: 1,
        width: '100%',
        height: 420,
        stretchH: 'all',
        manualColumnResize: true,
        licenseKey: 'non-commercial-and-evaluation',
        cells: function (row, col) {
            const cellProperties = {};
            if (col === 2) {
                const val = this.instance.getDataAtCell(row, col);
                if (val === "OK") cellProperties.className = "trangthai-ok";
                if (val === "BỎ QUA") cellProperties.className = "trangthai-boqua";
                if (val === "LỖI") cellProperties.className = "trangthai-loi";
                if (val === "MÃ KHÔNG TỒN TẠI") cellProperties.className = "trangthai-khongtontai";
                if (val === "CHƯA CÓ GIÁ TRỊ") cellProperties.className = "trangthai-chuacovitri";
            }
            return cellProperties;
        }
    });
}
initTable();

document.getElementById('col-select').onchange = function () {
    initTable(this.value);
    document.getElementById('preview').innerHTML = "";
};

// ==== Làm lại bảng ====
document.getElementById('btn-reset').onclick = function () {
    initTable(document.getElementById('col-select').value || 'vitrikho1');
    document.getElementById('preview').innerHTML = "";
};

// ==== Kiểm tra vị trí ====
document.getElementById('btn-kiemtra').onclick = async function () {
    const colname = document.getElementById('col-select').value;
    if (!colname) {
        alert("Bạn cần chọn mục cần ghi vào trước khi thực hiện thao tác này!");
        return;
    }
    hot.updateSettings({ cells: hot.getSettings().cells });
    let allRows = hot.getSourceData();
    let uniqueMasps = [];
    let uniqueRows = [];
    let seen = {};
    for (let row of allRows) {
        let masp = (row.masp || "").toString().trim().toUpperCase();
        if (masp && !seen[masp]) {
            seen[masp] = true;
            uniqueMasps.push(masp);
            uniqueRows.push({ masp, [colname]: null, trangthai: null });
        }
    }
    if (uniqueMasps.length === 0) {
        alert("Nhập mã sản phẩm để kiểm tra!");
        return;
    }
    hot.loadData(uniqueRows);
    const { data: found, error } = await supabase
        .from('dmhanghoa')
        .select(`masp,${colname}`)
        .in('masp', uniqueMasps);
    if (error) return alert('Lỗi kết nối Supabase!');
    const maspMap = {};
    found.forEach(row => { maspMap[row.masp.toUpperCase()] = row[colname]; });
    hot.batch(() => {
        for (let r = 0; r < hot.countRows(); r++) {
            const masp = (hot.getDataAtCell(r, 0) || "").toString().trim().toUpperCase();
            hot.setDataAtCell(r, 0, masp);
            if (!masp) {
                hot.setDataAtCell(r, 1, null);
                hot.setDataAtCell(r, 2, null);
                continue;
            }
            if (typeof maspMap[masp] === "undefined") {
                hot.setDataAtCell(r, 1, null);
                hot.setDataAtCell(r, 2, "MÃ KHÔNG TỒN TẠI");
            } else if (maspMap[masp]) {
                hot.setDataAtCell(r, 1, maspMap[masp]);
                hot.setDataAtCell(r, 2, "BỎ QUA");
            } else {
                hot.setDataAtCell(r, 1, null);
                hot.setDataAtCell(r, 2, "CHƯA CÓ GIÁ TRỊ");
            }
        }
    });
    document.getElementById('preview').innerHTML = `<span>✅ Đã kiểm tra xong.</span>`;
    hot.updateSettings({ cells: hot.getSettings().cells });
};

// ==== Xóa sản phẩm đã có vị trí (và dòng trống) ====
document.getElementById('btn-xoa').onclick = function () {
    let tableData = hot.getSourceData();
    tableData = tableData.filter(row =>
        row.masp && row.trangthai !== "BỎ QUA"
    );
    if (tableData.length === 0) tableData.push({ masp: null, vitrikho1: null, trangthai: null });
    hot.loadData(tableData);
    hot.updateSettings({ cells: hot.getSettings().cells });
    document.getElementById('preview').innerHTML = `<span>👉 Nhập vị trí cho các sản phẩm chưa có vị trí hoặc mã mới.</span>`;
};

// ==== Backup danh mục ====


document.getElementById('btn-backup').onclick = async function () {
    if (!confirm("Bạn muốn backup toàn bộ dữ liệu các bảng chính trước khi ghi?")) return;
    document.getElementById('backup-overlay').style.display = "block";
    try {
        await backupAllTablesToZip();
        alert("Đã backup toàn bộ các bảng quan trọng!\nHãy di chuyển file vừa tải về vào thư mục D:\\backup để đảm bảo an toàn!");
    } catch (err) {
        alert("Lỗi backup: " + err.message);
    } finally {
        document.getElementById('backup-overlay').style.display = "none";
    }
};


// ==== Lưu dữ liệu (PATCH từng dòng, chia chunk 100 dòng) ====
document.getElementById('btn-luu').onclick = luuDuLieu;
async function luuDuLieu() {
    const colname = document.getElementById('col-select').value;
    if (!colname) {
        alert("Bạn cần chọn mục cần ghi vào trước khi thực hiện thao tác này!");
        return;
    }
    const colLabel = COLS.find(c => c.name === colname)?.label || colname;
    let rows = hot.getSourceData().filter(r =>
        r.masp && r[colname]
    );
    //if (rows.length === 0) return alert("Không có dữ liệu hợp lệ để ghi.");
    if (!confirm(`⚠️ Bạn chắc chắn muốn ghi đè dữ liệu cũ của cột "${colLabel}" không?`)) {
        document.getElementById('preview').innerHTML = `<span style="color:orange;">⏹️ Đã hủy thao tác ghi đè.</span>`;
        return;
    }
    const chunkSize = 100;
    const chunks = chunkArray(rows, chunkSize);
    let success = 0, fail = 0, errorMsg = [];
    for (let i = 0; i < chunks.length; i++) {
        document.getElementById('preview').innerHTML = `<span>⏳ Đang ghi nhóm ${i + 1}/${chunks.length}...</span>`;
        let promises = chunks[i].map((row, idx) => {
            let updateObj = { [colname]: row[colname] };
            if (["ngaysua", "ngaykiem", "nhapdau"].includes(colname)) {
                updateObj[colname] = normalizeDate(row[colname]);
            }
            return supabase
                .from('dmhanghoa')
                .update(updateObj)
                .eq('masp', row.masp.toString().trim().toUpperCase())
                .select()
                .then(({ data, error }) => ({
                    idx: i * chunkSize + idx,
                    masp: row.masp,
                    success: !error && data && data.length === 1,
                    error: error?.message || (!data?.length && 'Không có dòng nào được cập nhật (mã không tồn tại)') || null
                }));
        });
        let results = await Promise.all(promises);
        results.forEach(res => {
            if (res.success) {
                hot.setDataAtCell(res.idx, 2, "OK");
                success++;
            } else {
                hot.setDataAtCell(res.idx, 2, "LỖI");
                fail++;
                errorMsg.push(`Dòng ${res.idx + 1} (${res.masp}): ${res.error}`);
            }
        });
    }
    let html = `<span>✅ Đã lưu xong: <b style="color:#e53935">${success} OK</b> &nbsp; <b style="color:orange">${fail} lỗi</b></span>`;
    if (fail) html += `<br><details><summary>Xem chi tiết lỗi</summary><div style="color:orange;text-align:left">${errorMsg.join('<br>')}</div></details>`;
    document.getElementById('preview').innerHTML = html;
    hot.updateSettings({ cells: hot.getSettings().cells });
}

// ==== Phục hồi từ backup (import lại từ file CSV) ====
// Bạn bổ sung sau nếu thực sự cần, mình sẽ gửi riêng hàm parse file zip và ghi batch

// ==== Tiện ích ====

// Chia mảng thành các nhóm nhỏ
function chunkArray(array, size) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}

// Chuyển array object sang CSV
function toCSV(data) {
    if (!data.length) return '';
    const keys = Object.keys(data[0]);
    const csvRows = [
        keys.join(','), // Tiêu đề
        ...data.map(row => keys.map(k => `"${(row[k] ?? "").toString().replace(/"/g, '""')}"`).join(','))
    ];
    return csvRows.join('\r\n');
}

// Chuẩn hóa ngày tháng (dành cho các trường ngày)
function normalizeDate(val) {
    if (!val) return null;
    let m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?/);
    if (m) {
        let dd = m[1].padStart(2, '0');
        let mm = m[2].padStart(2, '0');
        let yyyy = m[3];
        let h = m[4] || '00', mi = m[5] || '00';
        return `${yyyy}-${mm}-${dd} ${h.padStart(2, '0')}:${mi.padStart(2, '0')}:00`;
    }
    if (["null", "NULL", "NaN", "undefined"].includes(val.toString().trim())) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val;
    return null;
}
