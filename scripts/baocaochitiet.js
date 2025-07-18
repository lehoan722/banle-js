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
        // Ẩn filterInfo nếu lỗi
        document.getElementById("filterInfo") && (document.getElementById("filterInfo").innerHTML = "");
        return;
    }
    if (!data || !data.length) {
        container.innerHTML = "<div style='color:orange'>Không có dữ liệu</div>";
        document.getElementById("filterInfo") && (document.getElementById("filterInfo").innerHTML = "");
        return;
    }

    // 5. Thông báo các filter đã chọn (đặt trước bảng)
    let arrFilter = [];
    if (khachhang) arrFilter.push("Khách hàng: " + khachhang);
    if (nhanvien) arrFilter.push("Nhân viên: " + nhanvien);
    if (masp) arrFilter.push("Mã SP: " + masp);
    if (tensp) arrFilter.push("Tên SP: " + tensp);
    if (size) arrFilter.push("Kích cỡ: " + size);
    if (tuGia) arrFilter.push("Từ giá: " + tuGia);
    if (denGia) arrFilter.push("Đến giá: " + denGia);
    if (loaihdArr && loaihdArr.length) arrFilter.push("Loại HĐ: " + loaihdArr.join(", "));
    if (diadiem) arrFilter.push("Địa điểm: " + diadiem);
    if (maspListArr && maspListArr.length) arrFilter.push("Nhiều mã SP: " + maspListArr.join(", "));
    const filterDiv = document.getElementById("filterInfo");
    if (filterDiv) {
        if (arrFilter.length) {
            filterDiv.innerHTML = "Bạn đang xem báo cáo theo: <span style='color:#004085'>" + arrFilter.join("; ") + "</span>";
        } else {
            filterDiv.innerHTML = "";
        }
    }

    // 6. Chuẩn hóa dữ liệu đưa vào bảng (Handsontable)
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

    // 7. Thêm dòng tổng cuối bảng
    let sumSL = 0, sumKM = 0, sumTT = 0;
    hotData.forEach(r => {
        sumSL += Number(r.soluong) || 0;
        sumKM += Number(r.km) || 0;
        sumTT += Number(r.thanhtien) || 0;
    });
    hotData.push({
        stt: '',
        ngay: '',
        sohd: '',
        loaihd: '',
        diadiem: '',
        khachhang: '',
        nhanvien: '',
        masp: '',
        tensp: 'TỔNG CỘNG',
        size: '',
        soluong: sumSL,
        dvt: '',
        gia: '',
        km: sumKM,
        thanhtien: sumTT
    });

    // 8. Render bảng Handsontable
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
        // Làm nổi bật dòng tổng
        cells: function(row, col) {
            if (row === hotData.length - 1) {
                return { className: 'row-total' };
            }
        }
    });

    // 9. Bỏ phần tổng cũ phía dưới bảng (nếu còn)
    // -- Xóa đoạn appendChild(footer) nếu trước đây bạn có dùng.
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
// Giữ nguyên phần popup cũ của bạn...

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
