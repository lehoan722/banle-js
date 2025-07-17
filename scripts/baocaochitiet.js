// baocaochitiet.js
import { supabase } from "./supabaseClient.js";
let hotInstance = null;

// ========== HÀM CHÍNH LẤY BÁO CÁO =============
window.taiBaoCaoChiTiet = async function () {
    // 1. Lấy filter từ giao diện
    const tuNgay = document.getElementById("tuNgay").value;
    const denNgay = document.getElementById("denNgay").value;
    const loaihdArr = Array.from(document.getElementById("loaihdSelect").selectedOptions).map(o => o.value);
    const diadiem = document.getElementById("diadiemSelect").value || null;
    const khachhang = document.getElementById("khachhangInput").value.trim() || null;
    const nhanvien = document.getElementById("nhanvienInput").value.trim() || null;
    const masp = document.getElementById("maspInput").value.trim().toUpperCase() || null;
    const tensp = document.getElementById("tenspInput").value.trim() || null;
    const size = document.getElementById("sizeInput").value.trim() || null;
    const tuGia = document.getElementById("tuGia").value ? Number(document.getElementById("tuGia").value) : null;
    const denGia = document.getElementById("denGia").value ? Number(document.getElementById("denGia").value) : null;

    // Lấy nhiều mã sp từ textarea (ưu tiên nếu có nhập)
    let maspListRaw = document.getElementById("maspList").value;
    let maspListArr = maspListRaw
        ? maspListRaw.split('\n').map(s => s.trim().toUpperCase()).filter(s => !!s)
        : [];
    maspListArr = Array.from(new Set(maspListArr)); // Loại trùng

    let finalMaspList = maspListArr.length > 0 ? maspListArr : (masp ? [masp] : null);

    console.log({
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
    });


    // 2. Kiểm tra đủ ngày
    if (!tuNgay || !denNgay) {
        alert("Vui lòng chọn đủ Từ ngày và Đến ngày!");
        return;
    }

    // 3. Đóng bảng cũ nếu có
    const container = document.getElementById("hot");
    if (hotInstance) {
        hotInstance.destroy();
        hotInstance = null;
    }
    container.innerHTML = "<div style='color:#888'>Đang tải dữ liệu...</div>";

    // 4. Gọi function SQL (tên ví dụ: baocaochitiet_bh)
    // --- Thay function name bên dưới cho đúng tên function SQL bạn tạo
    const { data, error } = await supabase.rpc("baocaochitiet_bh", {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        p_loaihd_arr: loaihdArr.length ? loaihdArr : null, // array
        p_diadiem: diadiem,
        p_khachhang: khachhang,
        p_nhanvien: nhanvien,
        p_masp_list: finalMaspList,
        p_tensp: tensp,
        p_size: size,
        p_tu_gia: tuGia,
        p_den_gia: denGia
    });

    if (error) {
        container.innerHTML = `<div style="color:red">Lỗi: ${error.message}</div>`;
        return;
    }
    if (!data || !data.length) {
        container.innerHTML = "<div style='color:orange'>Không có dữ liệu</div>";
        return;
    }

    // 5. Chuẩn hóa dữ liệu đưa vào bảng (Handsontable)
    const hotData = data.map((row, idx) => ({
        stt: idx + 1,
        ngay: row.ngay,
        sohd: row.sohd,
        loaihd: row.loaihd,
        diadiem: row.diadiem,
        khachhang: row.khachhang,
        nhanvien: row.nhanvien,
        masp: row.masp,
        tensp: row.tensp,
        size: row.size,
        soluong: row.soluong,
        dvt: row.dvt,
        gia: row.gia,
        km: row.km,
        thanhtien: row.thanhtien
    }));

    // 6. Render bảng Handsontable
    const columns = [
        { data: "stt", title: "STT", readOnly: true, width: 45 },
        { data: "ngay", title: "Ngày", readOnly: true, width: 105 },
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

    hotInstance = new Handsontable(container, {
        data: hotData,
        columns: columns,
        colHeaders: columns.map(c => c.title || c.data),
        rowHeaders: true,
        width: '100%',
        height: Math.min(window.innerHeight - 260, 550),
        licenseKey: 'non-commercial-and-evaluation',
        stretchH: 'all',
        manualColumnResize: true,
        filters: true,
        dropdownMenu: true,
        columnSorting: true,
        readOnly: true,
    });

    // 7. Hiển thị tổng cộng cuối bảng
    let sumSL = 0, sumKM = 0, sumTT = 0;
    hotData.forEach(r => {
        sumSL += Number(r.soluong) || 0;
        sumKM += Number(r.km) || 0;
        sumTT += Number(r.thanhtien) || 0;
    });
    let footer = document.createElement("div");
    footer.style = "margin:12px 0 0 0; font-weight:500; color:#1565c0;";
    footer.innerHTML = `Tổng SL: <b>${sumSL.toLocaleString()}</b> &nbsp; | &nbsp; Tổng KM: <b>${sumKM.toLocaleString()}</b> &nbsp; | &nbsp; Tổng thành tiền: <b>${sumTT.toLocaleString()}</b>`;
    container.appendChild(footer);
};

// ========== FORMAT SỐ ==========
function formatNumberCell(instance, td, row, col, prop, value, cellProps) {
    td.innerHTML = value ? Number(value).toLocaleString() : '';
}

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
    if (type === 'khachhang') inputId = 'khachhangInput';
    else if (type === 'mahang') inputId = 'maspInput';
    else if (type === 'nhanvien') inputId = 'nhanvienInput';
    if (inputId) document.getElementById(inputId).value = value;
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
