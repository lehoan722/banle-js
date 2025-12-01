// baocaochitiet.js
import { supabase } from "./supabaseClient.js";
let hotInstance = null;
let currentFilters = null;
let totalRows = 0;
let pageSize = 1000;
let currentPage = 1;

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

    // chuẩn hoá mã SP sang UPPER và hỗ trợ danh sách nếu bạn đã có từ UI
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
            // một số bản Handsontable không có isDestroyed()
            hotInstance.destroy();
        }
    } catch (e) {
        // bỏ qua nếu instance đã bị huỷ trước đó
    } finally {
        hotInstance = null;
    }
}


// ========== HÀM CHÍNH LẤY BÁO CÁO =============
window.taiBaoCaoChiTiet = async function () {
    // 1) Lấy filter từ giao diện
    const tuNgay = document.getElementById("tuNgay").value;
    const denNgay = document.getElementById("denNgay").value;
    const loaihdArr = Array.from(document.getElementById("loaihdSelect").selectedOptions).map(o => o.value);
    const diadiem = document.getElementById("diadiemSelect").value || null;
    const khachhang = (document.getElementById("khachhangInput").value || "").trim() || null;
    const nhanvien = (document.getElementById("nhanvienInput").value || "").trim() || null;
    const masp = (document.getElementById("maspInput").value || "").trim().toUpperCase();
    const tensp = (document.getElementById("tenspInput").value || "").trim() || null;
    const size = (document.getElementById("sizeInput").value || "").trim() || null;
    const tuGia = document.getElementById("tuGia").value ? Number(document.getElementById("tuGia").value) : null;
    const denGia = document.getElementById("denGia").value ? Number(document.getElementById("denGia").value) : null;

    // Lấy nhiều mã SP từ textarea (nếu có) -> ưu tiên hơn ô mã đơn
    const maspListRaw = document.getElementById("maspList").value || "";
    let maspListArr = maspListRaw
        .split("\n")
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
    maspListArr = Array.from(new Set(maspListArr)); // loại trùng

    const finalMaspList = maspListArr.length > 0 ? maspListArr : (masp ? [masp] : null);

    // 2) Kiểm tra đủ ngày
    if (!tuNgay || !denNgay) {
        alert("Vui lòng chọn đủ Từ ngày và Đến ngày!");
        return;
    }

    // 3) Đóng bảng cũ nếu có và hiển thị trạng thái
    const container = document.getElementById("hot");
    safeDestroyHot();
    container.innerHTML = "<div style='color:#888'>Đang đếm dữ liệu...</div>";

    // 4) Lưu filter & state phân trang
    const f = {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        p_loaihd_arr: loaihdArr.length ? loaihdArr : null,
        p_diadiem: diadiem,
        p_khachhang: khachhang,
        p_nhanvien: nhanvien,
        p_masp_list: finalMaspList,
        p_tensp: tensp,
        p_size: size,
        p_tu_gia: tuGia,
        p_den_gia: denGia
    };
    currentFilters = f;
    pageSize = Number(document.getElementById("pageSize").value) || 1000;
    currentPage = 1;

    // 5) Gọi RPC đếm tổng dòng
    const { data: cnt, error: errCnt } = await supabase.rpc("baocaochitietnv11_bh_count_v3", currentFilters);
    if (errCnt) {
        console.error("baocaochitietnv11_bh_count_v3 error:", errCnt);
        alert("Lỗi đếm dữ liệu!");
        return;
    }
    totalRows = Number(cnt || 0);

    // 6) Tải trang đầu tiên
    await taiTrang(currentPage);
    // (B) Sau khi đếm xong, gọi KPI match-2h và render vào #tonghop
    await taiKPI_Match2h();
};

// (C) Thêm hàm render KPI
async function taiKPI_Match2h() {
    // map filter sang hàm summary của match-2h
    const f = {
        tu_ngay: currentFilters.tu_ngay,
        den_ngay: currentFilters.den_ngay,
        p_manv: currentFilters.p_nhanvien || null,
        p_masp_list: currentFilters.p_masp_list || null,
        p_size: currentFilters.p_size || null,
        p_min_price: currentFilters.p_tu_gia || 35000,
        p_diadiem: currentFilters.p_diadiem || 'cs1'
    };
    const { data, error } = await supabase.rpc("nv_match2h_summary_all", f);

    if (error) { console.error(error); document.getElementById("tonghop").innerHTML = ""; return; }

    // tổng hợp KPI
    const rows = data || [];
    const sumB = rows.reduce((s, r) => s + Number(r.doanh_thu_gia_b || 0), 0);
    const slGhep = rows.reduce((s, r) => s + Number(r.tong_sl_ghep || 0), 0);
    const slKhong = rows.reduce((s, r) => s + Number(r.sl_khong_ghep || 0), 0);
    const tyle = (slGhep + slKhong) ? (slGhep / (slGhep + slKhong)) : 0;
    const soGiaKhac = rows.reduce((s, r) => s + Number(r.so_sp_gia_khac || 0), 0);
    const avgDelta = rows.length ? (rows.reduce((s, r) => s + Number(r.delta_tb_min || 0), 0) / rows.length) : 0;

    document.getElementById("tonghop").innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div style="background:#f7fafd;border:1px solid #e3e6f3;border-radius:8px;padding:8px 12px">
        <b>Doanh thu (giá B):</b> ${sumB.toLocaleString('vi-VN')}
      </div>
      <div style="background:#f7fafd;border:1px solid #e3e6f3;border-radius:8px;padding:8px 12px">
        <b>Tổng SL Web:</b> ${slGhep.toLocaleString('vi-VN')}
      </div>
      <div style="background:#f7fafd;border:1px solid #e3e6f3;border-radius:8px;padding:8px 12px">
        <b>Tỷ lệ ghép:</b> ${(tyle * 100).toFixed(1)}%
      </div>
      <div style="background:#f7fafd;border:1px solid #e3e6f3;border-radius:8px;padding:8px 12px">
        <b>Số SP khác giá:</b> ${soGiaKhac.toLocaleString('vi-VN')}
      </div>
      <div style="background:#f7fafd;border:1px solid #e3e6f3;border-radius:8px;padding:8px 12px">
        <b>Δ trung bình:</b> ${(avgDelta || 0).toFixed(1)} phút
      </div>
    </div>`;
}

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

    const { data, error } = await supabase.rpc("baocaochitietnv11_bh_page_v3", params);

    if (error) {
        console.error(error);
        alert("Lỗi tải dữ liệu trang!");
        return;
    }



    // ánh xạ thêm cột STT như cũ
    const startIndex = offset + 1;
    const hotData = (data || []).map((r, idx) => ({
        stt: startIndex + idx,
        ...r
    }));

    renderTable(hotData);      // dùng lại cấu hình Handsontable y như cũ
    updatePagingBar();         // cập nhật nút/nhãn
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


// hook cho nút
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

window.addEventListener('DOMContentLoaded', () => {
    const pgSizeEl = document.getElementById("pageSize");
    if (pgSizeEl) {
        pgSizeEl.addEventListener("change", async function () {
            if (!currentFilters) return;
            pageSize = Number(this.value) || 1000;
            currentPage = 1;
            await taiTrang(currentPage);
        });
    }

    const popupInput = document.getElementById('popupSearchInput');
    if (popupInput) {
        popupInput.addEventListener('input', async function () {
            let keyword = this.value.trim();
            if (keyword.length < 2) {
                document.getElementById('popupSearchList').innerHTML = '<i>Nhập từ khóa (≥2 ký tự)...</i>';
                return;
            }
            await searchPopup(keyword);
        });
    }
});


function renderTable(hotData) {
    const container = document.getElementById("hot");
    // columns: **giữ nguyên** danh sách cột bạn đang dùng
    const columns = [
        { data: "stt", title: "STT", readOnly: true, width: 45 },
        { data: "ngay_gio", title: "Ngày Gio", readOnly: true, width: 150, renderer: formatDateCellVN },
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
        { data: "thanhtien", title: "Thành tiền", readOnly: true, width: 120, type: 'numeric', renderer: formatNumberCell },
        { data: "ket_qua", title: "Kết quả", readOnly: true, width: 90 },
        { data: "baymau_by", title: "Bày mẫu bởi", readOnly: true, width: 120 },
        { data: "baymau_note", title: "Ghi chú bày mẫu", readOnly: true, width: 130 }   // ✅ THÊM
    ];

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
}

function formatNumberCell(instance, td, row, col, prop, value, cellProperties) {
    const v = (value == null || value === '') ? '' : Number(value).toLocaleString('vi-VN');
    td.textContent = v;
}

function formatDateCellVN(instance, td, row, col, prop, value) {
    if (!value) { td.textContent = ""; return; }
    try {
        const d = new Date(value);   // timestamptz -> UTC
        d.setHours(d.getHours()); // VN = UTC+7 khong +7 thi dung + 7 thi sai gio. 
        const yy = String(d.getFullYear()).slice(-2);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        td.textContent = `${dd}-${mm}-${yy}, ${hh}-${mi}`;
    } catch {
        td.textContent = value;
    }
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
        const { data, error } = await supabase.rpc("baocaochitietnv11_bh_page_v3", params);

        if (error) { console.error(error); alert("Lỗi tải dữ liệu khi xuất!"); return; }
        (data || []).forEach((r, idx) => allRows.push({
            stt: offset + idx + 1, ...r
        }));
    }

    // trong xuatExcelToanBo():
    const headers = ["STT", "Ngày", "Số HĐ", "Loại HĐ", "Địa điểm", "Khách hàng", "Nhân viên", "Mã SP", "Tên SP", "Size", "SL", "ĐVT", "Giá", "KM", "Thành tiền", "Kết quả"];
    const aoa = [headers];
    allRows.forEach(r => {
        aoa.push([
            r.stt, r.ngay_gio, r.sohd, r.loaihd, r.diadiem, r.khachhang, r.nhanvien,
            r.masp, r.tensp, r.size, r.soluong, r.dvt, r.gia, r.km, r.thanhtien, r.ket_qua
        ]);
    });


    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, "ChiTietBanHang");
    XLSX.writeFile(wb, "baocao_chitiet_banhang_ALL.xlsx");
};



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
        // Ở popup, value chính là MANV → dùng luôn
        ten = value;
    }
    if (inputId) document.getElementById(inputId).value = ten;
    closePopupSearch();
};


// ========== AUTO FILL NGÀY HÔM NAY ==========
window.onload = function () {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('tuNgay').value = today;
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




