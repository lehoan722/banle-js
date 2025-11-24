// baocaochitiet.js
import { supabase } from "./supabaseClient.js";
import { openInvoiceFromRow } from "./invoiceNavigator.js";
let hotInstance = null;
let currentFilters = null;
let totalRows = 0;
let pageSize = 1000;
let currentPage = 1;
let onlyOneProduct = false; // <== thêm biến toàn cục để xác định 
let isCompactMode = false;

// ở CUỐI FILE, thêm:
window.trangTruoc = window.trangTruoc;
window.trangSau = window.trangSau;
window.toiTrang = window.toiTrang;

function getFiltersFromUI() {
    const tuNgay = document.getElementById("tuNgay").value;
    const denNgay = document.getElementById("denNgay").value;
    const loaihdArr = Array.from(document.getElementById("loaihdSelect").selectedOptions).map(o => o.value);
    const diadiem = document.getElementById("diadiemSelect").value || null;
    const khachhang = document.getElementById("khachhangInput").value.trim() || null;
    const nhanvien = document.getElementById("nhanvienInput").value.trim() || null;

    const sohd = (document.getElementById("sohdInput")?.value || "").trim() || null; // <== THÊM DÒNG NÀY

    const masp = (document.getElementById("maspInput").value || "").trim().toUpperCase();
    const finalMaspList = masp ? masp.split(/[,\s]+/).map(x => x.trim()).filter(Boolean) : null;

    const tensp = document.getElementById("tenspInput").value.trim() || null;
    const size = document.getElementById("sizeInput").value.trim() || null;
    const tuGia = document.getElementById("tuGia").value ? Number(document.getElementById("tuGia").value) : null;
    const denGia = document.getElementById("denGia").value ? Number(document.getElementById("denGia").value) : null;

    return {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        p_loaihd_arr: loaihdArr.length ? loaihdArr : null,
        p_diadiem: diadiem,
        p_khachhang: khachhang,
        p_nhanvien: nhanvien,
        p_sohd: sohd,               // <== THÊM DÒNG NÀY
        p_masp_list: finalMaspList,
        p_tensp: tensp,
        p_size: size,
        p_tu_gia: tuGia,
        p_den_gia: denGia
    };
}


function safeDestroyHot() {
    if (!hotInstance) return;
    try {
        if (typeof hotInstance.isDestroyed === 'function') {
            if (!hotInstance.isDestroyed()) hotInstance.destroy();
        } else {
            hotInstance.destroy();
        }
    } catch (e) {
    } finally {
        hotInstance = null;
    }
}

// ========== HÀM CHÍNH LẤY BÁO CÁO =============
window.taiBaoCaoChiTiet = async function () {
    const tuNgay = document.getElementById("tuNgay").value;
    const denNgay = document.getElementById("denNgay").value;
    const loaihdArr = Array.from(document.getElementById("loaihdSelect").selectedOptions).map(o => o.value);
    const diadiem = document.getElementById("diadiemSelect").value || null;
    const khachhang = (document.getElementById("khachhangInput").value || "").trim() || null;
    const nhanvien = (document.getElementById("nhanvienInput").value || "").trim() || null;
    const sohd = (document.getElementById("sohdInput")?.value || "").trim() || null;  // <== THÊM DÒNG NÀY
    const masp = (document.getElementById("maspInput").value || "").trim().toUpperCase();
    const tensp = (document.getElementById("tenspInput").value || "").trim() || null;
    const size = (document.getElementById("sizeInput").value || "").trim() || null;
    const tuGia = document.getElementById("tuGia").value ? Number(document.getElementById("tuGia").value) : null;
    const denGia = document.getElementById("denGia").value ? Number(document.getElementById("denGia").value) : null;

    const maspListRaw = document.getElementById("maspList").value || "";
    let maspListArr = maspListRaw
        .split("\n")
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
    maspListArr = Array.from(new Set(maspListArr));

    const finalMaspList = maspListArr.length > 0 ? maspListArr : (masp ? [masp] : null);

    if (!tuNgay || !denNgay) {
        alert("Vui lòng chọn đủ Từ ngày và Đến ngày!");
        return;
    }

    const container = document.getElementById("hot");
    safeDestroyHot();
    container.innerHTML = "<div style='color:#888'>Đang đếm dữ liệu...</div>";

    // xác định có phải chỉ 1 mã hay không
    onlyOneProduct = Array.isArray(finalMaspList) && finalMaspList.length === 1;

    const f = {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        p_loaihd_arr: loaihdArr.length ? loaihdArr : null,
        p_diadiem: diadiem,
        p_khachhang: khachhang,
        p_nhanvien: nhanvien,
        p_sohd: sohd,                 // <== THÊM DÒNG NÀY
        p_masp_list: finalMaspList,
        p_tensp: tensp,
        p_size: size,
        p_tu_gia: tuGia,
        p_den_gia: denGia,
        p_tinh_ton: onlyOneProduct   // <== truyền thêm tham số
    };


    currentFilters = f;
    pageSize = Number(document.getElementById("pageSize").value) || 1000;
    currentPage = 1;

    const { data: cnt, error: errCnt } = await supabase.rpc("baocaochitiet_bh_count", currentFilters);
    if (errCnt) {
        console.error("baocaochitiet_bh_count error:", errCnt);
        alert("Lỗi đếm dữ liệu!");
        return;
    }
    totalRows = Number(cnt || 0);

    await taiTrang(currentPage);
};

async function taiTrang(page) {
    const container = document.getElementById("hot");
    safeDestroyHot();
    container.innerHTML = "<div style='color:#888'>Đang tải dữ liệu...</div>";

    const offset = (page - 1) * pageSize;
    const params = {
        ...currentFilters,
        p_limit: pageSize,
        p_offset: offset
    };

    const { data, error } = await supabase.rpc("baocaochitiet_bh_page", params);
    if (error) {
        console.error(error);
        alert("Lỗi tải dữ liệu trang!");
        return;
    }

    const startIndex = offset + 1;
    const hotData = (data || []).map((r, idx) => ({
        stt: startIndex + idx,
        ...r
    }));

    renderTable(hotData);
    updatePagingBar();
    currentPage = page;
}

function updatePagingBar() {
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    document.getElementById("pageInfo").innerText =
        `Trang ${currentPage}/${totalPages} (Tổng: ${totalRows.toLocaleString('vi-VN')})`;
    const prev = document.getElementById("btnPrev");
    const next = document.getElementById("btnNext");
    if (prev) prev.disabled = currentPage <= 1;
    if (next) next.disabled = currentPage >= totalPages;
}

window.trangTruoc = function () {
    if (currentPage > 1) taiTrang(currentPage - 1);
};
window.trangSau = function () {
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    if (currentPage < totalPages) taiTrang(currentPage + 1);
};
window.toiTrang = function () {
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const n = Number(document.getElementById("gotoPage").value);
    if (!n || n < 1 || n > totalPages) return alert("Số trang không hợp lệ");
    taiTrang(n);
};

document.getElementById("pageSize").addEventListener("change", async function () {
    if (!currentFilters) return;
    pageSize = Number(this.value) || 1000;
    currentPage = 1;
    await taiTrang(currentPage);
});

// renderer riêng cho cột tồn
function tonRenderer(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.TextRenderer.apply(this, arguments);
    td.style.textAlign = 'right';
    if (value !== null && value !== undefined && value !== '') {
        const num = Number(value);
        td.textContent = isNaN(num) ? '' : num.toLocaleString('vi-VN');
        if (!isNaN(num) && num < 0) {
            td.style.background = '#ffe6e6';   // cảnh báo âm
            td.style.color = '#c00';
            td.style.fontWeight = '600';
        }
    }
}

function renderTable(hotData) {
    const container = document.getElementById("hot");
    const columns = [
        { data: "stt", title: "STT", readOnly: true, width: 45 },
        { data: "ngay", title: "Ngày", readOnly: true, width: 105, renderer: formatDateTimeCell },
        { data: "sohd", title: "Số HĐ", readOnly: true, width: 120 },
        { data: "loaihd", title: "Loại HĐ", readOnly: true, width: 100 },
        { data: "diadiem", title: "Địa điểm", readOnly: true, width: 90 },
        { data: "khachhang", title: "Khách hàng", readOnly: true, width: 140 },
        { data: "nhanvien", title: "Nhân viên", readOnly: true, width: 110 },
        { data: "masp", title: "Mã SP", readOnly: true, width: 100 },
        { data: "tensp", title: "Tên SP", readOnly: true, width: 160 },
        { data: "size", title: "Size", readOnly: true, width: 60 },
        { data: "soluong", title: "SL", readOnly: true, width: 65, type: 'numeric' },
        { data: "dvt", title: "ĐVT", readOnly: true, width: 60 },
        { data: "gia", title: "Giá", readOnly: true, width: 100, type: 'numeric', renderer: formatNumberCell },
        { data: "km", title: "KM", readOnly: true, width: 70, type: 'numeric', renderer: formatNumberCell },
        { data: "thanhtien", title: "Thành tiền", readOnly: true, width: 120, type: 'numeric', renderer: formatNumberCell }
    ];

    if (onlyOneProduct) {
        columns.push({
            data: "ton_tichluy",
            title: "Tổng tồn kho",
            readOnly: true,
            width: 120,
            type: 'numeric',
            renderer: tonRenderer
        });
    }

    hotInstance = new Handsontable(container, {
        data: hotData,
        columns,
        colHeaders: columns.map(c => c.title || c.data),
        rowHeaders: true,
        width: '100%',
        height: Math.min(window.innerHeight - 260, 550),
        licenseKey: 'non-commercial-and-evaluation',
        stretchH: 'all',
        manualColumnResize: true,
        filters: true,
        dropdownMenu: true,
    });

    hotInstance = new Handsontable(container, {
        data: hotData,
        columns,
        colHeaders: columns.map(c => c.title || c.data),
        rowHeaders: true,
        width: '100%',
        height: Math.min(window.innerHeight - 260, 550),
        licenseKey: 'non-commercial-and-evaluation',
        stretchH: 'all',
        manualColumnResize: true,
        filters: true,
        dropdownMenu: true,
        // không cần khai báo hiddenColumns ở đây; sẽ update bằng applyCompactView()

        // >>> THÊM SỰ KIỆN CLICK VÀO Ô
        afterOnCellMouseDown(event, coords, TD) {
            // coords.row < 0 = header, bỏ qua
            if (coords.row < 0) return;

            // Xem cột được click là cột nào
            const prop = hotInstance.colToProp(coords.col);
            if (prop !== "sohd") return;   // chỉ xử lý khi click cột Số HĐ

            const rowData = hotInstance.getSourceDataAtRow(coords.row);
            if (!rowData || !rowData.sohd) return;

            // Gọi module dùng chung để mở hóa đơn
            openInvoiceFromRow(rowData);
        }
    });

    // áp dụng trạng thái rút gọn (nếu đang bật)
    applyCompactView();


}

function getCompactColumnIndexes() {
    if (!hotInstance) return [];
    // danh sách cột cần ẩn khi rút gọn:
    const props = ["loaihd", "khachhang", "nhanvien", "tensp", "dvt", "gia", "km", "thanhtien"];
    // chuyển data-prop -> chỉ số cột hiện tại
    const cols = [];
    for (const p of props) {
        const idx = hotInstance.propToCol(p);
        if (typeof idx === 'number' && idx >= 0) cols.push(idx);
    }
    // loại trùng + sắp xếp tăng dần để tránh lỗi
    return Array.from(new Set(cols)).sort((a, b) => a - b);
}

function applyCompactView() {
    if (!hotInstance) return;
    if (isCompactMode) {
        const colsToHide = getCompactColumnIndexes();
        hotInstance.updateSettings({
            hiddenColumns: { columns: colsToHide, indicators: true }
        });
        const btn = document.getElementById('btnCompact');
        if (btn) btn.textContent = "Đầy đủ";
    } else {
        // Hiện tất cả cột
        hotInstance.updateSettings({
            hiddenColumns: { columns: [], indicators: true }
        });
        const btn = document.getElementById('btnCompact');
        if (btn) btn.textContent = "Rút gọn";
    }
}

// toggle từ nút bấm
window.toggleCompact = function () {
    isCompactMode = !isCompactMode;
    applyCompactView();
};


function formatNumberCell(instance, td, row, col, prop, value, cellProperties) {
    const v = (value == null || value === '') ? '' : Number(value).toLocaleString('vi-VN');
    td.textContent = v;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDateTimeCell(instance, td, row, col, prop, value, cellProperties) {
    // Cho phép các dạng: Date | ISO string | "YYYY-MM-DD HH:mm:ss" | chỉ có ngày
    let d = null;
    if (value instanceof Date) {
        d = value;
    } else if (typeof value === 'string' && value.trim()) {
        // chuyển dấu ' ' thành 'T' để Date parse tốt hơn
        const candidate = value.includes('T') ? value : value.replace(' ', 'T');
        const t = new Date(candidate);
        if (!isNaN(t.getTime())) d = t;
    }
    if (!d) {
        // fallback: nếu chỉ có YYYY-MM-DD, hiển thị với 00-00
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [y, m, day] = value.split('-').map(Number);
            const yy = String(y).slice(-2);
            td.textContent = `${pad2(day)}-${pad2(m)}-${yy} 00-00`;
            return td;
        }
        td.textContent = value ?? ''; // để nguyên nếu không parse được
        return td;
    }
    const dd = pad2(d.getDate());
    const mm = pad2(d.getMonth() + 1);
    const yy = String(d.getFullYear()).slice(-2);
    const HH = pad2(d.getHours());
    const MM = pad2(d.getMinutes());
    td.textContent = `${dd}-${mm}-${yy} ${HH}-${MM}`; // dd-mm-yy hh-mm
    return td;
}


window.xuatExcelToanBo = async function () {
    if (!currentFilters) return alert("Hãy chạy báo cáo trước đã!");
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    if (totalRows === 0) return alert("Không có dữ liệu!");

    const confirmAll = confirm(`Sẽ tải ${totalRows.toLocaleString('vi-VN')} dòng (≈ ${totalPages} trang) rồi xuất Excel. Tiếp tục?`);
    if (!confirmAll) return;

    const allRows = [];
    for (let p = 1; p <= totalPages; p++) {
        const offset = (p - 1) * pageSize;
        const params = { ...currentFilters, p_limit: pageSize, p_offset: offset };
        const { data, error } = await supabase.rpc("baocaochitiet_bh_page", params);
        if (error) { console.error(error); alert("Lỗi tải dữ liệu khi xuất!"); return; }
        (data || []).forEach((r, idx) => allRows.push({
            stt: offset + idx + 1, ...r
        }));
    }

    const headers = ["STT", "Ngày", "Số HĐ", "Loại HĐ", "Địa điểm", "Khách hàng", "Nhân viên", "Mã SP", "Tên SP", "Size", "SL", "ĐVT", "Giá", "KM", "Thành tiền"];
    if (onlyOneProduct) headers.push("Tổng tồn kho");

    const aoa = [headers];
    allRows.forEach(r => {
        const row = [
            r.stt, r.ngay, r.sohd, r.loaihd, r.diadiem, r.khachhang, r.nhanvien,
            r.masp, r.tensp, r.size, r.soluong, r.dvt, r.gia, r.km, r.thanhtien
        ];
        if (onlyOneProduct) row.push(r.ton_tichluy);
        aoa.push(row);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, "ChiTietBanHang");
    XLSX.writeFile(wb, "baocao_chitiet_banhang_ALL.xlsx");
};

// (phần xuất Excel từng trang giữ nguyên)
// ========== XUẤT EXCEL ==========
window.xuatExcel = function () {
    if (!hotInstance) return alert("Chưa có dữ liệu để xuất!");
    const table = document.createElement("table");
    const hotData = hotInstance.getData();
    const colHeaders = hotInstance.getColHeader();
    // Header
    let headerRow = document.createElement("tr");
    colHeaders.forEach(h => {
        let th = document.createElement("th");
        th.innerText = h;
        headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    // Data
    hotData.forEach(row => {
        let tr = document.createElement("tr");
        row.forEach(cell => {
            let td = document.createElement("td");
            td.innerText = cell;
            tr.appendChild(td);
        });
        table.appendChild(tr);
    });
    // Xuất excel
    const wb = XLSX.utils.table_to_book(table, { sheet: "ChiTietBanHang" });
    XLSX.writeFile(wb, "baocao_chitiet_banhang.xlsx");
};

// ========== POPUP TÌM KIẾM KHÁCH/MÃ HÀNG/NHÂN VIÊN ==========
window.openPopupSearch = function (type, keyword = "") {
    window.currentPopupType = type;
    const popup = document.getElementById('popupSearch');
    const input = document.getElementById('popupSearchInput');
    const list = document.getElementById('popupSearchList');
    popup.style.display = 'block';
    input.value = keyword || '';
    input.focus();
    if (!keyword || keyword.trim().length === 0) {
        searchPopup(""); // Hiển thị 100 bản đầu
    } else if (keyword.trim().length >= 1) {
        searchPopup(keyword.trim());
    } else {
        list.innerHTML = '<i>Nhập từ khóa (≥2 ký tự)...</i>';
    }
};
window.closePopupSearch = function () {
    document.getElementById('popupSearch').style.display = 'none';
};
window.clearInput = function (inputId) {
    document.getElementById(inputId).value = '';
};

document.getElementById('popupSearchInput').addEventListener('input', async function () {
    let keyword = this.value.trim();
    if (keyword.length < 2) {
        document.getElementById('popupSearchList').innerHTML = '<i>Nhập từ khóa (≥2 ký tự)...</i>';
        return;
    }
    let type = window.currentPopupType;
    let table = '', field = '', extraFields = '';
    if (type === 'khachhang') { table = 'dmkhachhang'; field = 'makh'; extraFields = ', tenkh'; }
    else if (type === 'mahang') { table = 'dmhanghoa'; field = 'masp'; extraFields = ', tensp'; }
    else if (type === 'nhanvien') { table = 'dmnhanvien'; field = 'manv'; extraFields = ', tennv'; }
    else return;

    let { data, error } = await supabase
        .from(table)
        .select(`${field}${extraFields}`)
        .ilike(field, `%${keyword}%`)
        .limit(100);

    if (error || !data || data.length === 0) {
        document.getElementById('popupSearchList').innerHTML = '<i>Không tìm thấy dữ liệu</i>';
        return;
    }
    document.getElementById('popupSearchList').innerHTML = data.map(row => `
        <div style="padding:5px 10px;cursor:pointer;border-bottom:1px solid #eee;"
            onclick="selectPopupValue('${type}', '${row[field].replace(/'/g, "\\'")}', this)">
            ${row[field]}${row.tensp ? " - " + row.tensp : ""}${row.tenkh ? " - " + row.tenkh : ""}${row.tennv ? " - " + row.tennv : ""}
        </div>
    `).join('');
});
window.selectPopupValue = function (type, value, el) {
    let inputId = '';
    let ten = '';
    if (type === 'khachhang') {
        inputId = 'khachhangInput';
        let fullText = el.innerText;
        if (fullText.indexOf(" - ") !== -1) {
            ten = fullText.split(" - ").slice(1).join(" - ").trim();
        } else {
            ten = fullText.trim();
        }
    } else if (type === 'mahang') {
        inputId = 'maspInput';
        ten = value;
    } else if (type === 'nhanvien') {
        inputId = 'nhanvienInput';
        let fullText = el.innerText;
        if (fullText.indexOf(" - ") !== -1) {
            ten = fullText.split(" - ").slice(1).join(" - ").trim();
        } else {
            ten = fullText.trim();
        }
    }
    if (inputId) document.getElementById(inputId).value = ten;
    closePopupSearch();
};


// ========== AUTO FILL NGÀY MẶC ĐỊNH ==========
window.onload = function () {
    const today = new Date().toISOString().slice(0, 10);

    // Từ ngày cố định: 01/05/2025
    document.getElementById('tuNgay').value = '2025-05-01';

    // Đến ngày là hôm nay
    document.getElementById('denNgay').value = today;
};


window.searchPopup = async function (keyword) {
    let type = window.currentPopupType;
    let table = '', field = '', extraFields = '';
    if (type === 'khachhang') { table = 'dmkhachhang'; field = 'makh'; extraFields = ', tenkh'; }
    else if (type === 'mahang') { table = 'dmhanghoa'; field = 'masp'; extraFields = ', tensp'; }
    else if (type === 'nhanvien') { table = 'dmnhanvien'; field = 'manv'; extraFields = ', tennv'; }
    else return;

    let { data, error } = await supabase
        .from(table)
        .select(`${field}${extraFields}`)
        .ilike(field, keyword ? `%${keyword}%` : "%")
        .limit(100);

    if (error || !data || data.length === 0) {
        document.getElementById('popupSearchList').innerHTML = '<i>Không tìm thấy dữ liệu</i>';
        return;
    }
    document.getElementById('popupSearchList').innerHTML = data.map(row => `
        <div style="padding:5px 10px;cursor:pointer;border-bottom:1px solid #eee;"
            onclick="selectPopupValue('${type}', '${row[field].replace(/'/g, "\\'")}', this)">
            ${row[field]}${row.tensp ? " - " + row.tensp : ""}${row.tenkh ? " - " + row.tenkh : ""}${row.tennv ? " - " + row.tennv : ""}
        </div>
    `).join('');
};
